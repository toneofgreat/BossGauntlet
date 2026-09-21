/* ==========================================================================
 * RAGE TRIALS - entities.js
 * --------------------------------------------------------------------------
 * The entity library. Loads AFTER engine.js (which owns window.RT) and BEFORE
 * the levels. Defines every built-in type listed in CONTRACT.md section 6:
 *
 *   mover faller spring walker flyer thwomp cannon saw laser beatblock switch
 *   toggleblock door key portal wind conveyor trapspike fallingceiling
 *   fakegoal sign text deco launcher coin checkpoint ball balloon mushroom
 *   lavaball                                                       (30 types)
 *
 * Rules honoured here:
 *   - plain browser JS, no modules, no imports, no frameworks, no assets
 *   - all art is procedural vector drawing in WORLD space (crisp at any zoom)
 *   - every engine service call is guarded (typeof check) so a partially
 *     implemented engine degrades instead of throwing
 *   - descriptor params arrive in TILES (engine converts x,y,w,h); speeds are
 *     tiles/s unless the number is large (see spd(), noted in Amendments)
 *   - every type has onReset(): respawning restores the level exactly
 *   - solid entities declare solid:true and move by writing e.x / e.y so the
 *     engine carries the player standing on them (vx/vy stay 0 so an engine
 *     that integrates velocity cannot double-move them)
 * ========================================================================== */
(function(){
'use strict';

var RT = window.RT;
if (!RT || typeof RT.defineEntity !== 'function'){
  if (window.console && window.console.error){
    window.console.error('[rage-trials] entities.js: window.RT.defineEntity is missing - engine.js must load first.');
  }
  return;
}

/* ===================== constants ======================================== */

var T       = 32;      /* tile size (CONTRACT section 2)                    */
var G_RISE  = 1550;    /* player gravity while rising  (section 4)          */
var G_FALL  = 2200;    /* player gravity while falling (section 4)          */
var V_TERM  = 900;     /* terminal velocity            (section 4)          */
var HANG_V  = 45;      /* apex hang threshold          (section 4)          */
var HANG_M  = 0.55;    /* apex hang gravity multiplier (section 4)          */
var PW      = 20;      /* player hitbox w (fallback only)                   */
var PH      = 28;      /* player hitbox h (fallback only)                   */
var TAU     = Math.PI * 2;

/* ===================== tiny utilities =================================== */

function isFn(f){ return typeof f === 'function'; }
function num(v, d){ return (typeof v === 'number' && isFinite(v)) ? v : d; }
function str(v, d){ return (typeof v === 'string' && v.length) ? v : d; }
function clamp(v, a, b){ return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t){ return a + (b - a) * t; }
function sgn(v){ return v < 0 ? -1 : (v > 0 ? 1 : 0); }

/* tiles -> px */
function tpx(v, dTiles){ return num(v, dTiles) * T; }

/* A speed / acceleration param. The contract says params are in TILES unless
 * noted, so 2.5 means 2.5 tiles/s. Numbers >= 60 are read as px/s (the
 * contract itself quotes spring power as 900 px/s) so both spellings work. */
function spd(v, dTiles){
  var n = num(v, null);
  if (n === null) return dTiles * T;
  return (Math.abs(n) < 60) ? n * T : n;
}

/* deterministic hash noise in 0..1 - stable procedural art across frames */
function srand(n){ var s = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return s - Math.floor(s); }
function rnd(){ return isFn(RT.random) ? RT.random() : Math.random(); }
function rrange(a, b){ return a + rnd() * (b - a); }

/* seconds clock: RT.time is the contract clock (pauses on menus) */
function now(){ return (typeof RT.time === 'number') ? RT.time : (Date.now() / 1000); }

function dirName(v, d){
  if (typeof v === 'string'){
    var s = v.toLowerCase();
    if (s === 'up' || s === 'u') return 'up';
    if (s === 'down' || s === 'd') return 'down';
    if (s === 'left' || s === 'l') return 'left';
    if (s === 'right' || s === 'r') return 'right';
  }
  if (typeof v === 'number') return v < 0 ? 'left' : 'right';
  return d;
}
function dirSign(v, d){
  if (typeof v === 'string'){
    var s = v.toLowerCase();
    if (s === 'left' || s === 'up') return -1;
    if (s === 'right' || s === 'down') return 1;
  }
  if (typeof v === 'number' && v !== 0) return v < 0 ? -1 : 1;
  return d;
}
function dirVec(name){
  if (name === 'up') return { x: 0, y: -1 };
  if (name === 'down') return { x: 0, y: 1 };
  if (name === 'left') return { x: -1, y: 0 };
  return { x: 1, y: 0 };
}

var errSeen = {};
function logErr(where, err){
  if (errSeen[where]) return;
  errSeen[where] = 1;
  /* engine.js keeps the list __dbg.errors reads, so tests see it there too */
  if (typeof RT.logError === 'function'){ try { RT.logError('entities:' + where, err); } catch (e2) {} }
  else if (window.console && window.console.error) window.console.error('[rage-trials] entity "' + where + '":', err);
  (window.__entityErrors || (window.__entityErrors = [])).push(where + ': ' + ((err && err.message) ? err.message : err));
}

/* ===================== guarded engine services ========================== */

function sfx(name){
  if (RT.Audio && typeof RT.Audio.sfx === 'function'){
    try { RT.Audio.sfx(name); } catch (err) { /* audio must never break play */ }
  }
}
function fxBurst(x, y, colors, count, speed, opts){
  if (!RT.particles || typeof RT.particles.burst !== 'function') return;
  var c = (colors && colors.length) ? colors : ['#ffffff'];
  var o = {
    n: count, count: count, num: count,
    color: c[0], colors: c,
    speed: speed || 180, spread: TAU,
    life: 0.55, size: 3, gravity: 480
  };
  if (opts){ for (var k in opts){ if (Object.prototype.hasOwnProperty.call(opts, k)) o[k] = opts[k]; } }
  try { RT.particles.burst(x, y, o); } catch (err) { /* ignore */ }
}
function fxEmit(x, y, kind){
  if (!RT.particles || typeof RT.particles.emit !== 'function') return;
  try { RT.particles.emit(x, y, kind); } catch (err) { /* ignore */ }
}
function shakeCam(p, d){ if (RT.cam && typeof RT.cam.shake === 'function'){ try { RT.cam.shake(p, d); } catch (err) {} } }
function flashScreen(c, d){ if (isFn(RT.flash)){ try { RT.flash(c, d); } catch (err) {} } }
function hitStop(f){ if (isFn(RT.hitstop)){ try { RT.hitstop(f); } catch (err) {} } }
function slowMo(f, d){ if (isFn(RT.slowmo)){ try { RT.slowmo(f, d); } catch (err) {} } }
function toastMsg(t, d){ if (isFn(RT.toast)){ try { RT.toast(t, d); } catch (err) {} } }
function speechMsg(x, y, t, d){ if (isFn(RT.speech)){ try { RT.speech(x, y, t, d); } catch (err) {} } }
function hudSet(k, t){ if (RT.hud && isFn(RT.hud.set)){ try { RT.hud.set(k, t); } catch (err) {} } }
function hudClear(k){ if (RT.hud && isFn(RT.hud.clear)){ try { RT.hud.clear(k); } catch (err) {} } }
function emitEvt(){ if (isFn(RT.emit)){ try { RT.emit.apply(RT, arguments); } catch (err) {} } }
function findAll(type){ if (isFn(RT.find)){ try { return RT.find(type) || []; } catch (err) {} } return []; }
function input(){ return RT.input || {}; }

/* ===================== player helpers =================================== */

function pAlive(){ var p = RT.player; return !!(p && !p.dead); }
function pW(){ var p = RT.player; return (p && num(p.w, 0)) || PW; }
function pH(){ var p = RT.player; return (p && num(p.h, 0)) || PH; }
function pCx(){ var p = RT.player; return p ? p.x + pW() / 2 : 0; }
function pCy(){ var p = RT.player; return p ? p.y + pH() / 2 : 0; }

/* player rect, inset like the engine hazard test (3 px each side, section 4) */
function pr(inset){
  var p = RT.player; if (!p) return null;
  var i = (inset == null) ? 3 : inset;
  return { x: p.x + i, y: p.y + i, w: pW() - i * 2, h: pH() - i * 2 };
}
function hitP(x, y, w, h, inset){
  if (!pAlive()) return false;
  var r = pr(inset); if (!r) return false;
  return x < r.x + r.w && x + w > r.x && y < r.y + r.h && y + h > r.y;
}
function hitPE(e, inset){ return hitP(e.x, e.y, DW(e), DH(e), inset); }
function hitPCircle(cx, cy, rad){
  if (!pAlive()) return false;
  var r = pr(3); if (!r) return false;
  var nx = clamp(cx, r.x, r.x + r.w), ny = clamp(cy, r.y, r.y + r.h);
  var dx = cx - nx, dy = cy - ny;
  return dx * dx + dy * dy < rad * rad;
}
/* player standing on top of this entity (true with or without engine carry) */
function standingOn(e){
  var p = RT.player; if (!p || p.dead) return false;
  var w = DW(e), h = DH(e); if (w <= 0 || h <= 0) return false;
  if (p.rideEnt === e) return true;            /* engine's own "riding" flag */
  var pb = p.y + pH();
  return (p.x + pW() > e.x + 1) && (p.x < e.x + w - 1) &&
         (pb > e.y - 7) && (pb < e.y + 13) && (num(p.vy, 0) >= -40);
}

/* single funnel for every entity-caused death, so the mushroom shield and the
 * post-hit invulnerability window work for all of them at once.
 * engine.js's killPlayer eats the hit itself when RT.player.shield is set. */
function hurt(cause){
  var p = RT.player; if (!p || p.dead) return false;
  if (Shield.invuln()) return false;
  if (p.shield) Shield.until = now() + 0.9;   /* the hit about to be absorbed */
  if (isFn(RT.killPlayer)){ try { RT.killPlayer(cause); } catch (err) { logErr('killPlayer', err); } }
  return true;
}

/* mirrors engine.js hazardCheck() exactly (contract section 4: hazard box
 * inset 3, spike tile inset 6 on its non-pointing sides) so the shield can
 * tell whether the player is standing in something lethal. */
function rectsHit(a, b){ return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
function spikeTileRect(ch, tx, ty){
  var i = 6, x = tx * T, y = ty * T;
  if (ch === '^') return { x: x + i, y: y, w: T - i * 2, h: T - i };
  if (ch === 'v') return { x: x + i, y: y + i, w: T - i * 2, h: T - i };
  if (ch === '<') return { x: x, y: y + i, w: T - i, h: T - i * 2 };
  return { x: x + i, y: y + i, w: T - i, h: T - i * 2 };
}
function playerInTileHazard(x, y){
  if (!isFn(RT.getTile)) return false;
  var i = 3;
  var hb = { x: x + i, y: y + i, w: pW() - i * 2, h: pH() - i * 2 };
  var eb = { x: x - 1, y: y - 1, w: pW() + 2, h: pH() + 2 };
  var x0 = Math.floor(eb.x / T), x1 = Math.floor((eb.x + eb.w - 0.001) / T);
  var y0 = Math.floor(eb.y / T), y1 = Math.floor((eb.y + eb.h - 0.001) / T);
  for (var ty = y0; ty <= y1; ty++){
    for (var tx = x0; tx <= x1; tx++){
      var ch;
      try { ch = RT.getTile(tx, ty); } catch (err) { ch = '.'; }
      if (ch !== 'L' && ch !== 'X' && ch !== '^' && ch !== 'v' && ch !== '<' && ch !== '>') continue;
      var tr = { x: tx * T, y: ty * T, w: T, h: T };
      if (ch === 'X'){ if (rectsHit(eb, tr)) return true; }
      else if (ch === 'L'){ if (rectsHit(hb, tr)) return true; }
      else if (rectsHit(hb, spikeTileRect(ch, tx, ty))) return true;
    }
  }
  return false;
}

/* ===================== world queries ==================================== */

function solidPx(x, y){
  if (isFn(RT.solidAtPx)){ try { return !!RT.solidAtPx(x, y); } catch (err) {} }
  if (isFn(RT.getTile)){
    try {
      var ch = RT.getTile(Math.floor(x / T), Math.floor(y / T));
      return ch === '#' || ch === 'X' || ch === 'I' || ch === 'B';
    } catch (err) {}
  }
  return false;
}
function rectSolidAt(x, y, w, h){
  if (isFn(RT.rectHitsSolid)){
    try { return !!RT.rectHitsSolid({ x: x, y: y, w: w, h: h }); } catch (err) {}
  }
  var sx, sy, cx, cy;
  for (sx = x + 1; sx < x + w - 1 + T; sx += T){
    cx = Math.min(sx, x + w - 1);
    for (sy = y + 1; sy < y + h - 1 + T; sy += T){
      cy = Math.min(sy, y + h - 1);
      if (solidPx(cx, cy)) return true;
    }
  }
  return false;
}
function entitySolidAt(x, y, ignore){
  var list = RT.entities;
  if (!list || !list.length || list.length > 400) return null;
  for (var i = 0; i < list.length; i++){
    var o = list[i];
    if (!o || o === ignore || o.dead || !o.solid) continue;
    if (!(o.w > 0) || !(o.h > 0)) continue;
    if (x >= o.x && x < o.x + o.w && y >= o.y && y < o.y + o.h) return o;
  }
  return null;
}
function solidAny(x, y, ignore){ return solidPx(x, y) || !!entitySolidAt(x, y, ignore); }

function levelW(){ var L = RT.level; return (L && L.tiles && L.tiles[0]) ? L.tiles[0].length * T : 400 * T; }
function levelH(){ var L = RT.level; return (L && L.tiles) ? L.tiles.length * T : 60 * T; }


/* ===================== dynamic solidity ================================= */
/* The engine reads e.solid per instance; collapsing the box to zero as well
 * means a non-solid state cannot be collided with whichever way the engine
 * tests it. Draw code always uses DW()/DH(), the real display size. */
function setSolid(e, on){
  on = !!on;
  e.solid = on;
  if (e._solidOn === on) return;
  e._solidOn = on;
  if (!on){
    if (e._sw == null){ e._sw = e.w; e._sh = e.h; }
    e.w = 0; e.h = 0;
  } else if (e._sw != null){
    e.w = e._sw; e.h = e._sh; e._sw = null; e._sh = null;
  }
}
function DW(e){ return (e._sw != null) ? e._sw : e.w; }
function DH(e){ return (e._sh != null) ? e._sh : e.h; }

/* ===================== drawing helpers ================================== */

function rrPath(g, x, y, w, h, r){
  r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  if (!(r > 0)){ g.beginPath(); g.rect(x, y, w, h); return; }
  g.beginPath();
  g.moveTo(x + r, y);
  g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
  g.closePath();
}
function fillRR(g, x, y, w, h, r, style){ rrPath(g, x, y, w, h, r); g.fillStyle = style; g.fill(); }
function strokeRR(g, x, y, w, h, r, style, lw){ rrPath(g, x, y, w, h, r); g.strokeStyle = style; g.lineWidth = lw || 1.5; g.stroke(); }
function circle(g, x, y, r){ g.beginPath(); g.arc(x, y, Math.max(0.01, r), 0, TAU); g.closePath(); }
function fillCircle(g, x, y, r, style){ circle(g, x, y, r); g.fillStyle = style; g.fill(); }
function poly(g, pts){
  g.beginPath();
  for (var i = 0; i < pts.length; i += 2){
    if (i === 0) g.moveTo(pts[0], pts[1]); else g.lineTo(pts[i], pts[i + 1]);
  }
  g.closePath();
}
function vgrad(g, x, y0, y1, stops){
  var gr = g.createLinearGradient(x, y0, x, y1);
  for (var i = 0; i < stops.length; i++) gr.addColorStop(stops[i][0], stops[i][1]);
  return gr;
}
function hgrad(g, x0, x1, y, stops){
  var gr = g.createLinearGradient(x0, y, x1, y);
  for (var i = 0; i < stops.length; i++) gr.addColorStop(stops[i][0], stops[i][1]);
  return gr;
}
function rgrad(g, x, y, r0, r1, stops){
  var gr = g.createRadialGradient(x, y, Math.max(0.01, r0), x, y, Math.max(0.02, r1));
  for (var i = 0; i < stops.length; i++) gr.addColorStop(stops[i][0], stops[i][1]);
  return gr;
}
function ellipse(g, x, y, rx, ry){
  g.beginPath();
  if (isFn(g.ellipse)) g.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), 0, 0, TAU);
  else {
    g.save(); g.translate(x, y); g.scale(1, Math.max(0.01, ry) / Math.max(0.01, rx));
    g.arc(0, 0, Math.max(0.01, rx), 0, TAU); g.restore();
  }
  g.closePath();
}
var FONT = '"Trebuchet MS", "Segoe UI", Roboto, system-ui, sans-serif';
function fontOf(size, weight){ return (weight || '700') + ' ' + size.toFixed(1) + 'px ' + FONT; }
function drawLabel(g, text, x, y, o){
  o = o || {};
  var size = o.size || 12;
  g.save();
  g.font = fontOf(size, o.weight);
  g.textAlign = o.align || 'center';
  g.textBaseline = o.baseline || 'middle';
  if (o.outline){
    g.lineJoin = 'round'; g.miterLimit = 2;
    g.lineWidth = o.outlineWidth || Math.max(2, size * 0.26);
    g.strokeStyle = o.outline;
    g.strokeText(text, x, y);
  }
  g.fillStyle = o.color || '#ffffff';
  g.fillText(text, x, y);
  g.restore();
}
function measureW(g, text, size, weight){
  g.save(); g.font = fontOf(size, weight);
  var w = g.measureText(text).width; g.restore();
  return w;
}
function wrapText(g, text, size, maxW, weight){
  var words = String(text).split(/\s+/), lines = [], cur = '', i, t;
  g.save(); g.font = fontOf(size, weight);
  for (i = 0; i < words.length; i++){
    t = cur ? (cur + ' ' + words[i]) : words[i];
    if (g.measureText(t).width > maxW && cur){ lines.push(cur); cur = words[i]; }
    else cur = t;
  }
  if (cur) lines.push(cur);
  g.restore();
  return lines;
}
/* beveled block body: every solid entity uses it so they read as one game */
function blockBody(g, x, y, w, h, pal, seed, radius){
  var r = (radius == null) ? 4 : radius, i;
  rrPath(g, x, y, w, h, r);
  g.fillStyle = vgrad(g, x, y, y + h, [[0, pal.face], [0.52, pal.side], [1, pal.dark]]);
  g.fill();
  var n = Math.min(26, Math.max(4, Math.floor(w * h / 420)));
  g.fillStyle = 'rgba(255,255,255,0.055)';
  for (i = 0; i < n; i++){
    var sx = x + 3 + srand(seed + i * 2.13) * Math.max(1, w - 6);
    var sy = y + 3 + srand(seed + i * 3.77) * Math.max(1, h - 6);
    var s = 1 + srand(seed + i * 5.11) * 2.2;
    g.fillRect(sx, sy, s, s);
  }
  g.fillStyle = pal.rim;
  g.fillRect(x + r * 0.6, y + 1.5, Math.max(0, w - r * 1.2), 2);
  g.fillStyle = 'rgba(0,0,0,0.26)';
  g.fillRect(x + r * 0.6, y + h - 3.5, Math.max(0, w - r * 1.2), 2);
  rrPath(g, x + 0.5, y + 0.5, w - 1, h - 1, r);
  g.strokeStyle = pal.line; g.lineWidth = 1.4; g.stroke();
}
function rivet(g, x, y, r){
  fillCircle(g, x, y, r, 'rgba(0,0,0,0.32)');
  fillCircle(g, x - r * 0.22, y - r * 0.26, r * 0.55, 'rgba(255,255,255,0.40)');
}

/* shared palettes */
var PAL = {
  stone:  { face: '#7f8a9d', side: '#5d6879', dark: '#3b4353', rim: 'rgba(255,255,255,0.30)', line: 'rgba(10,14,22,0.60)' },
  metal:  { face: '#9aa6b6', side: '#6e7a8c', dark: '#454f60', rim: 'rgba(255,255,255,0.40)', line: 'rgba(8,12,20,0.65)' },
  wood:   { face: '#b07a44', side: '#8a5c31', dark: '#5e3c1f', rim: 'rgba(255,225,180,0.30)', line: 'rgba(40,22,8,0.70)' },
  rust:   { face: '#b5734a', side: '#8c5333', dark: '#5a3320', rim: 'rgba(255,200,150,0.26)', line: 'rgba(40,20,10,0.65)' },
  ice:    { face: '#bfe6f5', side: '#8fc6e0', dark: '#5d93b3', rim: 'rgba(255,255,255,0.65)', line: 'rgba(30,70,100,0.55)' },
  dark:   { face: '#4a4560', side: '#37334a', dark: '#232032', rim: 'rgba(190,180,230,0.25)', line: 'rgba(8,6,16,0.70)' },
  gold:   { face: '#f4cf5a', side: '#d9a52f', dark: '#9c6f14', rim: 'rgba(255,248,210,0.60)', line: 'rgba(80,50,0,0.60)' },
  danger: { face: '#e8574c', side: '#bb3a34', dark: '#7d211f', rim: 'rgba(255,200,190,0.35)', line: 'rgba(60,10,10,0.65)' }
};
var GROUP_COLORS = {
  A: '#ff6b6b', B: '#4fc3f7', C: '#9ccc65', D: '#ffd54f',
  E: '#ba68c8', F: '#4db6ac', G: '#ff8a65', H: '#90a4ae'
};
function groupColor(name){
  var k = String(name || 'A').toUpperCase().charAt(0);
  return GROUP_COLORS[k] || '#ffd54f';
}
function keyColor(name){
  var n = String(name || 'gold').toLowerCase();
  if (n.indexOf('red') >= 0) return '#ef5350';
  if (n.indexOf('blue') >= 0) return '#42a5f5';
  if (n.indexOf('green') >= 0) return '#66bb6a';
  if (n.indexOf('purple') >= 0 || n.indexOf('violet') >= 0) return '#ab47bc';
  if (n.indexOf('silver') >= 0 || n.indexOf('white') >= 0) return '#e0e6ef';
  return '#ffd54f';
}

/* ===================== cross-entity module state ======================== */
/* Reset whenever the level changes so nothing leaks between levels. */

var MOD = { level: undefined };
function checkLevel(){
  var li = RT.levelIndex;
  if (MOD.level !== li){
    MOD.level = li;
    Shield.clear();
    Float.clear();
    Portal.until = -1;
    Hold.e = null;
    if (RT.player){ RT.player.held = null; RT.player.frozen = false; }
  }
}

/* --- mushroom shield: one free hit ---------------------------------------
 * engine.js's killPlayer already honours RT.player.shield: it eats the hit,
 * plays 'hurt' and returns. So entities.js only raises that flag and adds the
 * two things a bare flag cannot give - a window of invulnerability, and a
 * bail-out to the last honest footing, so the spike you were standing in does
 * not simply kill you again on the very next step. */
var Shield = {
  owner: null, until: -1, safe: null,
  clear: function(){
    this.owner = null; this.until = -1; this.safe = null;
    if (RT.player) RT.player.shield = false;
    hudClear('shield');
  },
  give: function(owner){
    this.owner = owner; this.until = -1; this.safe = null;
    if (RT.player) RT.player.shield = true;
    hudSet('shield', 'SHIELD');
  },
  up: function(){ return !!(RT.player && RT.player.shield && this.owner); },
  invuln: function(){ return now() < this.until; },
  /* ticked every step by the carried mushroom */
  carry: function(){
    var p = RT.player;
    if (!p || p.dead) return;
    if (p.shield){
      if (p.onGround && !playerInTileHazard(p.x, p.y)) this.safe = { x: p.x, y: p.y };
      return;
    }
    /* just spent - make surviving it real */
    this.until = now() + 0.9;
    p.vy = -300;
    p.vx = (num(p.facing, 1) < 0 ? 1 : -1) * 160;
    if (playerInTileHazard(p.x, p.y) && this.safe){
      p.x = this.safe.x; p.y = this.safe.y; p.vy = -260; p.vx = 0;
    }
    fxBurst(p.x + pW() / 2, p.y + pH() / 2, ['#ffe27a', '#ffffff', '#ff9e4f'], 24, 230, { life: 0.5, gravity: 260 });
    shakeCam(5, 0.22);
    hudClear('shield');
    if (this.owner) this.owner.state = 'spent';
    this.owner = null;
  }
};

/* --- P-balloon floatiness ------------------------------------------------
 * Gravity lives in engine.js, so the balloon damps the OBSERVED per-step
 * velocity change instead of assuming a gravity field it can write. Works
 * whichever side of the player step the entity update happens on. */
var Float = {
  owner: null, lastVy: null, factor: 0.15, cap: 200,
  clear: function(){ this.owner = null; this.lastVy = null; hudClear('balloon'); },
  attach: function(o){ this.owner = o; this.lastVy = null; },
  detach: function(o){ if (this.owner === o){ this.owner = null; this.lastVy = null; hudClear('balloon'); } },
  step: function(){
    var p = RT.player;
    if (!p || p.dead){ this.lastVy = null; return; }
    if (p.onGround || this.lastVy === null){ this.lastVy = num(p.vy, 0); return; }
    var vy = num(p.vy, 0), dv = vy - this.lastVy;
    if (dv > 0 && dv < 70) vy = this.lastVy + dv * this.factor;
    if (vy > this.cap) vy = this.cap;
    p.vy = vy;
    this.lastVy = vy;
  }
};

var Portal = { until: -1 };
var Hold = { e: null };

/* ===================== the definer ====================================== */
/* Wraps RT.defineEntity so every type gets: animation clock, deterministic
 * art seed, crash isolation, and a free onReset that restores the snapshot
 * taken at init (unless the instance opted out with e.persistent). */

var SNAP = ['x', 'y', 'w', 'h', 'vx', 'vy', 'state', 'at', '_sw', '_sh', '_solidOn'];
function snapshot(e, keep){
  var s = {}, i, k;
  for (i = 0; i < SNAP.length; i++){ k = SNAP[i]; s[k] = e[k]; }
  if (keep){ for (i = 0; i < keep.length; i++){ k = keep[i]; s[k] = e[k]; } }
  e._home = s;
}
function restoreHome(e){
  var s = e._home, k;
  if (!s) return;
  for (k in s){ if (Object.prototype.hasOwnProperty.call(s, k)) e[k] = s[k]; }
}

var DEFINED = [];
function E(name, spec){
  DEFINED.push(name);
  RT.defineEntity(name, {
    layer: spec.layer || 'main',
    solid: (spec.solid === undefined) ? false : spec.solid,
    shadow: !!spec.shadow,          /* engine.js draws its soft ground shadow */
    init: function(e, d){
      d = d || e.spawnDef || {};
      e.at = 0;
      e.seed = (typeof e.id === 'number' ? (e.id * 7.13 + 1.7) : rnd() * 1000);
      if (typeof e.state !== 'string') e.state = 'idle';
      checkLevel();
      if (spec.init){
        try { spec.init(e, d); } catch (err) { logErr(name + '.init', err); }
      }
      snapshot(e, spec.keep);
    },
    update: function(e, dt){
      e.at = num(e.at, 0) + dt;
      if (!spec.update) return;
      try { spec.update(e, dt); } catch (err) { logErr(name + '.update', err); }
    },
    draw: function(e, g){
      if (!spec.draw) return;
      g.save();
      try { spec.draw(e, g); } catch (err) { logErr(name + '.draw', err); }
      g.restore();
    },
    onPlayerTouch: spec.onPlayerTouch ? function(e, p, side){
      try { spec.onPlayerTouch(e, p, side); } catch (err) { logErr(name + '.touch', err); }
    } : undefined,
    onPlayerDeath: function(e){
      if (!spec.onPlayerDeath) return;
      try { spec.onPlayerDeath(e); } catch (err) { logErr(name + '.death', err); }
    },
    onReset: function(e){
      if (!e.persistent) restoreHome(e);
      if (!spec.onReset) return;
      try { spec.onReset(e); } catch (err) { logErr(name + '.reset', err); }
    },
    onRemove: spec.onRemove ? function(e){
      try { spec.onRemove(e); } catch (err) { logErr(name + '.remove', err); }
    } : undefined
  });
}

/* path helper shared by mover / flyer / saw: descriptor paths are in TILES
 * and describe the entity's top-left corner (same as descriptor x,y). */
function buildPath(e, d){
  var p = d.path, i, n, out = [];
  if (p && p.length){
    for (i = 0; i < p.length; i++){
      n = p[i];
      if (!n) continue;
      if (typeof n.length === 'number' && n.length >= 2) out.push({ x: n[0] * T, y: n[1] * T });
      else if (typeof n.x === 'number') out.push({ x: n.x * T, y: num(n.y, 0) * T });
    }
  }
  if (!out.length) out.push({ x: e.x, y: e.y });
  e.path = out;
  e.node = 0;
  e.nextNode = out.length > 1 ? 1 : 0;
  e.pdir = 1;
  e.waitT = 0;
  e.x = out[0].x;
  e.y = out[0].y;
  e.loopMode = (d.loop === true || d.loop === 'loop') ? 'loop' : ((d.loop === 'once' || d.loop === false && d.once) ? 'once' : 'pingpong');
  if (d.loop === 'once') e.loopMode = 'once';
  e.pauseT = num(d.pause, 0);
}
function advanceNode(e){
  var len = e.path.length;
  if (len < 2){ e.nextNode = 0; return; }
  if (e.loopMode === 'loop'){
    e.nextNode = (e.node + 1) % len;
  } else if (e.loopMode === 'once'){
    e.nextNode = Math.min(e.node + 1, len - 1);
  } else {
    if (e.node + e.pdir > len - 1 || e.node + e.pdir < 0) e.pdir = -e.pdir;
    e.nextNode = clamp(e.node + e.pdir, 0, len - 1);
  }
}
/* moves e along its path; returns {dx,dy} actually moved this step */
function pathStep(e, dt, speedPx){
  var mv = { dx: 0, dy: 0 };
  if (!e.path || e.path.length < 2) return mv;
  if (e.waitT > 0){ e.waitT -= dt; return mv; }
  var tgt = e.path[e.nextNode];
  if (!tgt) return mv;
  var dx = tgt.x - e.x, dy = tgt.y - e.y;
  var dist = Math.sqrt(dx * dx + dy * dy);
  var step = speedPx * dt;
  if (dist <= step || dist < 0.0001){
    mv.dx = tgt.x - e.x; mv.dy = tgt.y - e.y;
    e.x = tgt.x; e.y = tgt.y;
    e.node = e.nextNode;
    advanceNode(e);
    e.waitT = e.pauseT;
  } else {
    mv.dx = dx / dist * step; mv.dy = dy / dist * step;
    e.x += mv.dx; e.y += mv.dy;
  }
  return mv;
}
function drawPathGhost(g, e, color){
  if (!e.path || e.path.length < 2) return;
  var w = DW(e), h = DH(e), i;
  g.save();
  g.globalAlpha = 0.16;
  g.strokeStyle = color || '#ffffff';
  g.lineWidth = 2;
  if (isFn(g.setLineDash)) g.setLineDash([5, 7]);
  g.beginPath();
  for (i = 0; i < e.path.length; i++){
    var px1 = e.path[i].x + w / 2, py1 = e.path[i].y + h / 2;
    if (i === 0) g.moveTo(px1, py1); else g.lineTo(px1, py1);
  }
  if (e.loopMode === 'loop') g.lineTo(e.path[0].x + w / 2, e.path[0].y + h / 2);
  g.stroke();
  if (isFn(g.setLineDash)) g.setLineDash([]);
  for (i = 0; i < e.path.length; i++){
    fillCircle(g, e.path[i].x + w / 2, e.path[i].y + h / 2, 2.5, color || '#ffffff');
  }
  g.restore();
}

/* =========================================================================
 *  1. MOVER - solid moving platform, carries the player
 * ========================================================================= */
E('mover', {
  layer: 'main',
  solid: true,
  keep: ['node', 'nextNode', 'pdir', 'waitT'],
  init: function(e, d){
    buildPath(e, d);
    e.spdPx = spd(d.speed, 2);
    e.pal = PAL[str(d.pal, 'metal')] || PAL.metal;
    e.showPath = d.ghost !== false;
  },
  update: function(e, dt){
    pathStep(e, dt, e.spdPx);
    /* the engine carries the player from the position change (it tracks
     * e.dx/e.dy itself) - never also integrate vx/vy, or the platform would
     * move twice as fast */
    e.vx = 0; e.vy = 0;
    if (e.waitT > 0 && e.waitT > e.pauseT - dt * 1.5 && e.pauseT > 0){
      fxBurst(e.x + DW(e) / 2, e.y + DH(e), ['#c8d4e4', '#9aa6b6'], 4, 60, { life: 0.35, gravity: 220 });
    }
  },
  draw: function(e, g){
    var w = DW(e), h = DH(e), x = e.x, y = e.y, i;
    if (e.showPath) drawPathGhost(g, e, '#8fd3ff');
    blockBody(g, x, y, w, h, e.pal, e.seed, 5);
    /* tread hatching along the top lip */
    g.save();
    rrPath(g, x + 2, y + 2, w - 4, Math.min(9, h - 4), 3);
    g.clip();
    g.fillStyle = 'rgba(255,255,255,0.13)';
    for (i = -12; i < w + 12; i += 10){
      poly(g, [x + i, y + 2, x + i + 5, y + 2, x + i - 1, y + 11, x + i - 6, y + 11]);
      g.fill();
    }
    g.restore();
    /* side plates */
    g.fillStyle = 'rgba(0,0,0,0.16)';
    g.fillRect(x + 2, y + h - 7, w - 4, 3);
    for (i = 0; i < 2; i++){
      var bx = i === 0 ? x + 6 : x + w - 6;
      rivet(g, bx, y + 6, 2.2);
      rivet(g, bx, y + h - 6, 2.2);
    }
    /* direction chevrons, brighter the faster it goes */
    var tgt = e.path[e.nextNode] || e.path[0];
    var vx = tgt.x - e.x, vy = tgt.y - e.y;
    var L = Math.sqrt(vx * vx + vy * vy);
    if (L > 0.5 && e.waitT <= 0){
      vx /= L; vy /= L;
      var cx = x + w / 2, cy = y + h / 2;
      var ph = (e.at * 2.2) % 1;
      g.save();
      g.translate(cx, cy);
      g.rotate(Math.atan2(vy, vx));
      for (i = 0; i < 3; i++){
        var a = 0.42 - i * 0.12;
        var off = (i * 7) - ph * 7;
        g.globalAlpha = a;
        g.strokeStyle = '#bfe9ff';
        g.lineWidth = 2.2;
        g.beginPath();
        g.moveTo(off - 4, -5); g.lineTo(off + 2, 0); g.lineTo(off - 4, 5);
        g.stroke();
      }
      g.restore();
    }
  }
});

/* =========================================================================
 *  2. FALLER - falls 0.4 s after being stood on
 * ========================================================================= */
E('faller', {
  layer: 'main',
  solid: true,
  keep: ['timer', 'mvy', 'crack'],
  init: function(e, d){
    e.delay = num(d.delay, 0.4);
    e.back = num(d.respawn, 0);
    e.timer = 0;
    e.mvy = 0;
    e.crack = 0;
    e.state = 'idle';
    e.pal = PAL[str(d.pal, 'stone')] || PAL.stone;
    e.homeX = e.x; e.homeY = e.y;
  },
  update: function(e, dt){
    e.vx = 0; e.vy = 0;
    if (e.state === 'idle'){
      if (standingOn(e)){
        e.state = 'shake';
        e.timer = e.delay;
        sfx('tick');
      }
      return;
    }
    if (e.state === 'shake'){
      e.timer -= dt;
      e.crack = 1 - clamp(e.timer / Math.max(0.01, e.delay), 0, 1);
      if (Math.random() < 0.35){
        fxBurst(e.x + rrange(4, DW(e) - 4), e.y + DH(e), ['#cbd3de', '#9aa3ae'], 2, 40, { life: 0.5, gravity: 300, size: 2 });
      }
      if (e.timer <= 0){
        e.state = 'fall';
        e.mvy = 40;
        sfx('crumble');
        shakeCam(2.5, 0.12);
        fxBurst(e.x + DW(e) / 2, e.y + DH(e) / 2, ['#b9c2cd', '#8b949f', '#6c757f'], 14, 120, { life: 0.6, gravity: 500 });
      }
      return;
    }
    if (e.state === 'fall'){
      e.mvy = Math.min(1300, e.mvy + 2000 * dt);
      e.y += e.mvy * dt;
      if (Math.random() < 0.5){
        fxBurst(e.x + rrange(2, DW(e) - 2), e.y + rrange(0, DH(e)), ['#9aa3ae'], 1, 20, { life: 0.4, gravity: 120, size: 2 });
      }
      if (e.y > levelH() + 96){
        e.state = e.back > 0 ? 'gone' : 'done';
        e.timer = e.back;
        setSolid(e, false);
      }
      return;
    }
    if (e.state === 'gone'){
      e.timer -= dt;
      if (e.timer <= 0){
        e.x = e.homeX; e.y = e.homeY;
        e.mvy = 0; e.crack = 0;
        setSolid(e, true);
        e.state = 'idle';
        sfx('pop');
        fxBurst(e.x + DW(e) / 2, e.y + DH(e) / 2, ['#ffffff', '#cbd3de'], 12, 110, { life: 0.4, gravity: 0 });
      }
    }
  },
  onReset: function(e){
    e.x = e.homeX; e.y = e.homeY;
    e.mvy = 0; e.crack = 0; e.timer = 0;
    e.state = 'idle';
    setSolid(e, true);
  },
  draw: function(e, g){
    if (e.state === 'done' || e.state === 'gone') return;
    var w = DW(e), h = DH(e), i;
    var sx = 0, sy = 0;
    if (e.state === 'shake'){
      var amp = 1 + e.crack * 2.2;
      sx = Math.sin(e.at * 60) * amp;
      sy = Math.cos(e.at * 47) * amp * 0.5;
    }
    g.translate(e.x + sx, e.y + sy);
    if (e.state === 'fall'){
      g.translate(w / 2, h / 2);
      g.rotate(Math.sin(e.at * 3) * 0.05);
      g.translate(-w / 2, -h / 2);
    }
    blockBody(g, 0, 0, w, h, e.pal, e.seed, 4);
    /* loose-looking chipped edges */
    g.fillStyle = 'rgba(0,0,0,0.20)';
    for (i = 0; i < 4; i++){
      var cx = 4 + srand(e.seed + i * 9.1) * (w - 8);
      g.fillRect(cx, h - 5, 3 + srand(e.seed + i) * 4, 4);
    }
    /* cracks grow as it is about to go */
    if (e.crack > 0.02){
      g.save();
      g.globalAlpha = clamp(e.crack, 0, 1);
      g.strokeStyle = 'rgba(20,14,10,0.75)';
      g.lineWidth = 1.6;
      for (i = 0; i < 3; i++){
        var x0 = 6 + srand(e.seed + i * 3.3) * (w - 12);
        g.beginPath();
        g.moveTo(x0, 2);
        g.lineTo(x0 + (srand(e.seed + i) - 0.5) * 10, h * 0.45 * e.crack + 3);
        g.lineTo(x0 + (srand(e.seed + i * 2) - 0.5) * 16, h * 0.85 * e.crack + 4);
        g.stroke();
      }
      g.restore();
    }
    /* warning glow while shaking */
    if (e.state === 'shake'){
      g.save();
      g.globalAlpha = 0.25 + 0.25 * Math.sin(e.at * 26);
      g.strokeStyle = '#ffcf6b';
      g.lineWidth = 2;
      rrPath(g, 1, 1, w - 2, h - 2, 4);
      g.stroke();
      g.restore();
    }
  }
});

/* =========================================================================
 *  3. SPRING - bounces the player (default 900 px/s, contract section 4)
 * ========================================================================= */
E('spring', {
  layer: 'main',
  solid: false,
  keep: ['cool', 'comp'],
  init: function(e, d){
    e.dirn = dirName(d.dir, 'up');
    e.power = spd(d.power, 900 / T);
    e.cool = 0;
    e.comp = 0;
  },
  update: function(e, dt){
    if (e.cool > 0) e.cool -= dt;
    e.comp = Math.max(0, e.comp - dt * 4.5);
    var p = RT.player;
    if (!p || p.dead || e.cool > 0) return;
    var w = DW(e), h = DH(e);
    if (!hitP(e.x - 2, e.y - 3, w + 4, h + 6, 2)) return;
    var ok = false;
    if (e.dirn === 'up'){ ok = num(p.vy, 0) >= -40 && (p.y + pH()) < e.y + h * 0.8; }
    else if (e.dirn === 'down'){ ok = num(p.vy, 0) <= 40 && p.y > e.y + h * 0.2; }
    else if (e.dirn === 'left'){ ok = p.x + pW() > e.x; }
    else { ok = p.x < e.x + w; }
    if (!ok) return;
    if (e.dirn === 'up'){ p.vy = -e.power; p.y = e.y - pH() - 1; }
    else if (e.dirn === 'down'){ p.vy = e.power; p.y = e.y + h + 1; }
    else if (e.dirn === 'left'){ p.vx = -e.power; p.vy = Math.min(num(p.vy, 0), -180); }
    else { p.vx = e.power; p.vy = Math.min(num(p.vy, 0), -180); }
    p.onGround = false;
    if (p.jumpsLeft != null) p.jumpsLeft = Math.max(num(p.jumpsLeft, 0), (p.abilities && p.abilities.doubleJump) ? 1 : 0);
    e.comp = 1;
    e.cool = 0.16;
    sfx('spring');
    shakeCam(2.5, 0.1);
    var cx = e.x + w / 2, cy = e.y + h / 2;
    fxBurst(cx, cy, ['#ffffff', '#9ae6ff', '#5ec7ff'], 14, 200, { life: 0.4, gravity: 140 });
  },
  draw: function(e, g){
    var w = DW(e), h = DH(e), i;
    g.translate(e.x + w / 2, e.y + h / 2);
    if (e.dirn === 'down') g.rotate(Math.PI);
    else if (e.dirn === 'left') g.rotate(Math.PI / 2);
    else if (e.dirn === 'right') g.rotate(-Math.PI / 2);
    g.translate(-w / 2, -h / 2);

    var squash = e.comp;
    var baseH = 6;
    var topY = lerp(h * 0.30, h - baseH - 5, squash);
    /* base */
    fillRR(g, 2, h - baseH, w - 4, baseH, 2, '#3a4250');
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.fillRect(4, h - baseH, w - 8, 1.5);
    /* coil */
    var coils = 4, cx = w / 2;
    g.strokeStyle = '#d9dee8';
    g.lineWidth = 3;
    g.lineCap = 'round';
    g.beginPath();
    for (i = 0; i <= coils * 2; i++){
      var t = i / (coils * 2);
      var yy = lerp(h - baseH - 1, topY + 4, t);
      var xx = cx + (i % 2 === 0 ? -1 : 1) * (w * 0.26);
      if (i === 0) g.moveTo(xx, yy); else g.lineTo(xx, yy);
    }
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 1;
    g.stroke();
    /* top plate */
    var plateH = 6;
    fillRR(g, 1, topY, w - 2, plateH, 3, vgrad(g, 0, topY, topY + plateH, [[0, '#ff8a5c'], [1, '#d64f36']]));
    g.fillStyle = 'rgba(255,255,255,0.45)';
    g.fillRect(3, topY + 1, w - 6, 1.6);
    strokeRR(g, 1.5, topY + 0.5, w - 3, plateH - 1, 3, 'rgba(60,16,8,0.6)', 1.2);
    /* arrows on the plate */
    g.save();
    g.globalAlpha = 0.5 + 0.35 * Math.sin(e.at * 4);
    g.strokeStyle = '#fff3d6';
    g.lineWidth = 1.8;
    g.beginPath();
    g.moveTo(w / 2 - 4, topY - 3); g.lineTo(w / 2, topY - 7); g.lineTo(w / 2 + 4, topY - 3);
    g.stroke();
    g.restore();
  }
});

/* =========================================================================
 *  4. WALKER - patrols, turns at edges, stompable
 * ========================================================================= */
function critterFall(e, dt, gravity, maxFall){
  e.mvy = num(e.mvy, 0) + gravity * dt;
  if (e.mvy > maxFall) e.mvy = maxFall;
  var ny = e.y + e.mvy * dt;
  var fx0 = e.x + 4, fx1 = e.x + DW(e) - 4, fy = ny + DH(e);
  if (e.mvy >= 0){
    var he = entitySolidAt(fx0, fy, e) || entitySolidAt(fx1, fy, e);
    if (he){ e.y = he.y - DH(e); e.mvy = 0; e.grounded = true; return; }
    if (solidPx(fx0, fy) || solidPx(fx1, fy)){
      e.y = Math.floor(fy / T) * T - DH(e);
      e.mvy = 0; e.grounded = true; return;
    }
  }
  e.y = ny;
  e.grounded = false;
}
/* shared stomp check: returns 'stomp' | 'hit' | null */
function stompTest(e, topFrac){
  if (!pAlive()) return null;
  if (!hitP(e.x + 2, e.y + 1, DW(e) - 4, DH(e) - 2, 2)) return null;
  var p = RT.player;
  var frac = (topFrac == null) ? 0.55 : topFrac;
  if (num(p.vy, 0) > 40 && (p.y + pH()) < e.y + DH(e) * frac) return 'stomp';
  return 'hit';
}
function stompKill(e, bounce){
  var p = RT.player;
  e.alive = false;
  e.state = 'squash';
  e.squashT = 0.45;
  if (p){
    p.vy = -(bounce == null ? 350 : bounce);
    p.onGround = false;
    if (p.jumpsLeft != null && p.abilities && p.abilities.doubleJump) p.jumpsLeft = 1;
  }
  sfx('stomp');
  hitStop(3);
  shakeCam(3, 0.14);
  fxBurst(e.x + DW(e) / 2, e.y + DH(e) * 0.7, ['#ffd9a0', '#ff9a6b', '#8d5a3b'], 18, 190, { life: 0.5, gravity: 520 });
}
function eyeAim(e, maxOff){
  var m = maxOff == null ? 2.2 : maxOff;
  if (!RT.player) return { x: 0, y: 0 };
  var dx = pCx() - (e.x + DW(e) / 2), dy = pCy() - (e.y + DH(e) / 2);
  var L = Math.sqrt(dx * dx + dy * dy) || 1;
  return { x: clamp(dx / L, -1, 1) * m, y: clamp(dy / L, -1, 1) * m };
}

E('walker', {
  layer: 'main',
  solid: false,
  shadow: true,
  keep: ['dirx', 'mvy', 'alive', 'squashT', 'grounded'],
  init: function(e, d){
    e.dirx = dirSign(d.dir, -1);
    e.spdPx = spd(d.speed, 2);
    e.range = tpx(d.range, 0);
    e.homeX = e.x; e.homeY = e.y;
    e.mvy = 0;
    e.alive = true;
    e.squashT = 0;
    e.grounded = false;
    e.gy = e.y + DH(e);
    e.tick = 0;
    e.body = str(d.color, '#b5568f');
    e.state = 'walk';
  },
  update: function(e, dt){
    if (!e.alive){
      if (e.squashT > 0) e.squashT -= dt;
      return;
    }
    critterFall(e, dt, 2400, 900);
    /* patrol */
    var w = DW(e), h = DH(e);
    var step = e.spdPx * dt;
    var nx = e.x + e.dirx * step;
    var lead = e.dirx > 0 ? (nx + w + 1) : (nx - 1);
    var turn = false;
    if (solidAny(lead, e.y + h * 0.5, e) || solidAny(lead, e.y + h * 0.15, e)) turn = true;
    if (e.grounded && !solidAny(lead, e.y + h + 5, e)) turn = true;
    if (e.range > 0 && Math.abs(nx - e.homeX) > e.range) turn = true;
    if (nx < 0 || nx + w > levelW()) turn = true;
    if (turn){
      e.dirx = -e.dirx;
      fxBurst(e.x + w / 2, e.y + h - 2, ['#d8cfc4'], 3, 45, { life: 0.3, gravity: 260, size: 2 });
    } else {
      e.x = nx;
    }
    /* player interaction */
    var r = stompTest(e, 0.55);
    if (r === 'stomp') stompKill(e, 350);
    else if (r === 'hit') hurt('walker');
  },
  onPlayerDeath: function(e){ e.state = e.alive ? 'walk' : e.state; },
  onReset: function(e){
    e.alive = true; e.squashT = 0; e.mvy = 0; e.state = 'walk';
  },
  draw: function(e, g){
    var w = DW(e), h = DH(e), cx = e.x + w / 2, i;
    if (!e.alive && e.squashT <= 0) return;
    if (!e.alive){
      /* squashed: flattened body, X eyes, fading */
      var k = clamp(e.squashT / 0.45, 0, 1);
      g.globalAlpha = k;
      var fh = h * 0.28;
      var by = e.y + h - fh;
      fillRR(g, e.x + 1, by, w - 2, fh, fh * 0.5, e.body);
      g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 1.6;
      for (i = 0; i < 2; i++){
        var ex = cx + (i ? 6 : -6);
        g.beginPath();
        g.moveTo(ex - 3, by + 2); g.lineTo(ex + 3, by + fh - 3);
        g.moveTo(ex + 3, by + 2); g.lineTo(ex - 3, by + fh - 3);
        g.stroke();
      }
      return;
    }
    var walkT = e.at * (e.spdPx / 26 + 3.2);
    var bob = Math.sin(walkT * 2) * 1.4;
    var squash = 1 + Math.sin(walkT * 2) * 0.05;
    var by2 = e.y + bob;
    /* feet */
    g.fillStyle = '#3c2a3a';
    for (i = 0; i < 2; i++){
      var fx = cx + (i ? 1 : -1) * w * 0.22 + Math.sin(walkT + i * Math.PI) * 2.4;
      fillRR(g, fx - 4.5, e.y + h - 5 + bob * 0.3, 9, 5, 2.5, '#3c2a3a');
    }
    /* body */
    var bw = w * 0.86 * (2 - squash), bh = (h - 6) * squash;
    var bx = cx - bw / 2, byy = by2 + h - 5 - bh;
    rrPath(g, bx, byy, bw, bh, bw * 0.34);
    g.fillStyle = vgrad(g, 0, byy, byy + bh, [[0, e.body], [0.6, '#8d3d6e'], [1, '#5c2447']]);
    g.fill();
    g.strokeStyle = 'rgba(30,8,24,0.65)'; g.lineWidth = 1.6; g.stroke();
    /* back spikes */
    g.fillStyle = '#efe4d8';
    for (i = 0; i < 3; i++){
      var sxp = bx + bw * (0.26 + i * 0.24);
      poly(g, [sxp - 3, byy + 2, sxp, byy - 5, sxp + 3, byy + 2]);
      g.fill();
    }
    /* belly */
    g.save();
    g.globalAlpha = 0.28;
    ellipse(g, cx, byy + bh * 0.72, bw * 0.3, bh * 0.2);
    g.fillStyle = '#ffd9ef'; g.fill();
    g.restore();
    /* eyes */
    var ea = eyeAim(e, 1.8);
    for (i = 0; i < 2; i++){
      var exx = cx + (i ? 1 : -1) * bw * 0.20;
      var eyy = byy + bh * 0.34;
      fillCircle(g, exx, eyy, 4.4, '#fffdf6');
      fillCircle(g, exx + ea.x, eyy + ea.y, 2.1, '#1a1020');
      fillCircle(g, exx + ea.x - 0.7, eyy + ea.y - 0.9, 0.8, 'rgba(255,255,255,0.9)');
      /* angry brow */
      g.strokeStyle = '#2a1020'; g.lineWidth = 2;
      g.beginPath();
      g.moveTo(exx - 4.5 * (i ? -1 : 1), eyy - 6);
      g.lineTo(exx + 3.5 * (i ? -1 : 1), eyy - 4);
      g.stroke();
    }
    /* mouth with fangs */
    var my = byy + bh * 0.62;
    g.strokeStyle = '#2a1020'; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(cx - 5, my); g.lineTo(cx + 5, my); g.stroke();
    g.fillStyle = '#fffdf6';
    poly(g, [cx - 3.5, my, cx - 1.5, my, cx - 2.5, my + 3.2]); g.fill();
    poly(g, [cx + 1.5, my, cx + 3.5, my, cx + 2.5, my + 3.2]); g.fill();
  }
});

/* =========================================================================
 *  5. FLYER - flying enemy, stompable from above
 * ========================================================================= */
E('flyer', {
  layer: 'main',
  solid: false,
  shadow: true,
  keep: ['node', 'nextNode', 'pdir', 'waitT', 'alive', 'squashT', 'mvy'],
  init: function(e, d){
    e.hasPath = !!(d.path && d.path.length > 1);
    buildPath(e, d);
    e.spdPx = spd(d.speed, 2.2);
    e.amp = tpx(d.amp, 1);
    e.freq = num(d.freq, 0.7);
    e.homeX = e.x; e.homeY = e.y;
    e.alive = true;
    e.squashT = 0;
    e.mvy = 0;
    e.chase = !!d.chase;
    e.state = 'fly';
    e.body = str(d.color, '#7b5cc4');
  },
  update: function(e, dt){
    if (!e.alive){
      if (e.squashT > 0) e.squashT -= dt;
      e.y += 180 * dt;
      return;
    }
    if (e.hasPath){
      pathStep(e, dt, e.spdPx);
      e.y += Math.sin(e.at * 3.4) * 0.35;
    } else if (e.chase && pAlive()){
      var dx = pCx() - (e.x + DW(e) / 2), dy = pCy() - (e.y + DH(e) / 2);
      var L = Math.sqrt(dx * dx + dy * dy) || 1;
      e.x += dx / L * e.spdPx * 0.55 * dt;
      e.y += dy / L * e.spdPx * 0.55 * dt;
    } else {
      e.x = e.homeX + Math.sin(e.at * e.freq * TAU * 0.5) * e.amp * 0.2;
      e.y = e.homeY + Math.sin(e.at * e.freq * TAU) * e.amp;
    }
    var r = stompTest(e, 0.6);
    if (r === 'stomp'){
      stompKill(e, 360);
      fxBurst(e.x + DW(e) / 2, e.y + DH(e) / 2, ['#e8dcff', '#b9a2ff'], 12, 150, { life: 0.5, gravity: 160 });
    } else if (r === 'hit'){
      hurt('flyer');
    }
    if (Math.random() < 0.06){
      fxBurst(e.x + DW(e) / 2, e.y + DH(e) * 0.8, ['rgba(180,160,255,0.7)'], 1, 20, { life: 0.5, gravity: -30, size: 2 });
    }
  },
  onReset: function(e){
    e.alive = true; e.squashT = 0;
    if (!e.hasPath){ e.x = e.homeX; e.y = e.homeY; }
  },
  draw: function(e, g){
    if (!e.alive && e.squashT <= 0) return;
    var w = DW(e), h = DH(e), cx = e.x + w / 2, cy = e.y + h / 2, i;
    if (!e.alive){
      g.globalAlpha = clamp(e.squashT / 0.45, 0, 1);
      g.translate(cx, cy);
      g.rotate(Math.PI * (1 - clamp(e.squashT / 0.45, 0, 1)));
      g.translate(-cx, -cy);
    }
    var flap = Math.sin(e.at * 13);
    /* wings */
    for (i = 0; i < 2; i++){
      var s = i ? 1 : -1;
      g.save();
      g.translate(cx + s * w * 0.20, cy - 1);
      g.rotate(s * (0.5 + flap * 0.55));
      g.beginPath();
      g.moveTo(0, 0);
      g.quadraticCurveTo(s * w * 0.55, -h * 0.34, s * w * 0.72, h * 0.10);
      g.quadraticCurveTo(s * w * 0.42, h * 0.16, 0, h * 0.08);
      g.closePath();
      g.fillStyle = 'rgba(150,126,230,0.85)';
      g.fill();
      g.strokeStyle = 'rgba(44,24,80,0.6)'; g.lineWidth = 1.3; g.stroke();
      g.strokeStyle = 'rgba(70,40,120,0.5)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(s * 3, h * 0.02); g.lineTo(s * w * 0.55, -h * 0.12); g.stroke();
      g.restore();
    }
    /* body */
    var br = Math.min(w, h) * 0.34;
    circle(g, cx, cy, br);
    g.fillStyle = rgrad(g, cx - br * 0.3, cy - br * 0.4, br * 0.2, br * 1.2, [[0, '#9c81e8'], [0.6, e.body], [1, '#3b2a6b']]);
    g.fill();
    g.strokeStyle = 'rgba(30,16,58,0.7)'; g.lineWidth = 1.6; g.stroke();
    /* horns */
    g.fillStyle = '#3b2a6b';
    poly(g, [cx - br * 0.6, cy - br * 0.7, cx - br * 0.15, cy - br * 1.35, cx - br * 0.05, cy - br * 0.75]); g.fill();
    poly(g, [cx + br * 0.6, cy - br * 0.7, cx + br * 0.15, cy - br * 1.35, cx + br * 0.05, cy - br * 0.75]); g.fill();
    /* single big eye tracking the player */
    var ea = eyeAim(e, br * 0.28);
    fillCircle(g, cx, cy, br * 0.56, '#fffdf6');
    fillCircle(g, cx + ea.x, cy + ea.y, br * 0.28, '#1b0f2e');
    fillCircle(g, cx + ea.x - br * 0.1, cy + ea.y - br * 0.12, br * 0.09, 'rgba(255,255,255,0.95)');
    g.strokeStyle = 'rgba(30,16,58,0.8)'; g.lineWidth = 1.2;
    circle(g, cx, cy, br * 0.56); g.stroke();
    /* tail */
    g.strokeStyle = '#3b2a6b'; g.lineWidth = 2; g.lineCap = 'round';
    g.beginPath();
    g.moveTo(cx, cy + br * 0.9);
    g.quadraticCurveTo(cx + Math.sin(e.at * 5) * 5, cy + br * 1.5, cx + Math.sin(e.at * 5) * 8, cy + br * 1.9);
    g.stroke();
  }
});

/* =========================================================================
 *  6. THWOMP - shakes 0.3 s, slams, rests 0.6 s, rises
 * ========================================================================= */
function moveSolidY(e, dy){
  var w = DW(e), h = DH(e);
  if (!(w > 0) || !(h > 0)){ e.y += dy; return dy; }
  var remain = dy, moved = 0, guard = 0;
  var s = dy > 0 ? 4 : -4;
  while (Math.abs(remain) > 0.001 && guard++ < 500){
    var amt = (Math.abs(remain) < Math.abs(s)) ? remain : s;
    if (rectSolidAt(e.x, e.y + amt, w, h)) break;
    e.y += amt; moved += amt; remain -= amt;
  }
  return moved;
}

E('thwomp', {
  layer: 'main',
  solid: true,
  keep: ['timer', 'mvy', 'fallen', 'face'],
  init: function(e, d){
    e.triggerW = tpx(d.triggerW, 3);
    e.fallSpeed = spd(d.fallSpeed, 34);
    e.riseSpeed = spd(d.riseSpeed, 3.2);
    e.maxDrop = tpx(d.drop, 14);
    e.rest = num(d.rest, 0.6);
    e.shakeT = num(d.shake, 0.3);
    e.homeY = e.y; e.homeX = e.x;
    e.timer = 0; e.mvy = 0; e.fallen = 0;
    e.face = 0;   /* 0 idle, 1 angry, 2 dizzy */
    e.state = 'idle';
  },
  update: function(e, dt){
    e.vx = 0; e.vy = 0;
    var w = DW(e), h = DH(e);
    if (e.state === 'idle'){
      e.face = 0;
      if (pAlive()){
        var dx = Math.abs(pCx() - (e.x + w / 2));
        if (dx < e.triggerW / 2 + pW() / 2 && RT.player.y + pH() > e.y + h * 0.3){
          e.state = 'shake';
          e.timer = e.shakeT;
          e.face = 1;
          sfx('tick');
        }
      }
      return;
    }
    if (e.state === 'shake'){
      e.timer -= dt;
      e.face = 1;
      if (e.timer <= 0){
        e.state = 'fall';
        e.mvy = e.fallSpeed;
        e.fallen = 0;
        fxBurst(e.x + w / 2, e.y + h, ['#c9d1dc', '#9aa3ae'], 6, 90, { life: 0.4, gravity: 300 });
      }
      return;
    }
    if (e.state === 'fall'){
      e.face = 1;
      var want = e.mvy * dt;
      var got = moveSolidY(e, want);
      e.fallen += Math.abs(got);
      if (hitP(e.x - 1, e.y - 1, w + 2, h + 3, 2)) hurt('thwomp');
      if (Math.abs(got) < Math.abs(want) - 0.01 || e.fallen >= e.maxDrop){
        e.state = 'rest';
        e.timer = e.rest;
        e.face = 2;
        sfx('thwomp');
        shakeCam(9, 0.3);
        hitStop(3);
        fxBurst(e.x + 2, e.y + h, ['#e3e9f2', '#b6bfcb', '#8a929d'], 12, 220, { life: 0.6, gravity: 620, spread: Math.PI });
        fxBurst(e.x + w - 2, e.y + h, ['#e3e9f2', '#b6bfcb', '#8a929d'], 12, 220, { life: 0.6, gravity: 620, spread: Math.PI });
        fxEmit(e.x + w / 2, e.y + h, 'dust');
      }
      return;
    }
    if (e.state === 'rest'){
      e.timer -= dt;
      e.face = 2;
      if (hitP(e.x - 1, e.y + h * 0.5, w + 2, h * 0.5 + 2, 2) && num(RT.player.vy, 0) >= 0 && RT.player.y > e.y) hurt('thwomp');
      if (e.timer <= 0){ e.state = 'rise'; }
      return;
    }
    if (e.state === 'rise'){
      e.face = 0;
      var up = -e.riseSpeed * dt;
      if (e.y + up <= e.homeY){ e.y = e.homeY; e.state = 'idle'; }
      else e.y += up;
    }
  },
  onReset: function(e){
    e.y = e.homeY; e.x = e.homeX;
    e.state = 'idle'; e.timer = 0; e.mvy = 0; e.fallen = 0; e.face = 0;
  },
  draw: function(e, g){
    var w = DW(e), h = DH(e), i;
    var sx = 0;
    if (e.state === 'shake') sx = Math.sin(e.at * 70) * 2.6;
    g.translate(e.x + sx, e.y);
    /* stone body */
    blockBody(g, 0, 0, w, h, PAL.stone, e.seed, 3);
    /* heavy metal face plate */
    fillRR(g, 3, 3, w - 6, h - 9, 3, vgrad(g, 0, 3, h - 6, [[0, '#8e9aad'], [1, '#5a6475']]));
    g.strokeStyle = 'rgba(12,16,24,0.5)'; g.lineWidth = 1.2;
    strokeRR(g, 3.5, 3.5, w - 7, h - 10, 3, 'rgba(12,16,24,0.5)', 1.2);
    /* corner studs */
    rivet(g, 8, 8, 3); rivet(g, w - 8, 8, 3);
    rivet(g, 8, h - 12, 3); rivet(g, w - 8, h - 12, 3);
    /* spiked bottom edge */
    var teeth = Math.max(3, Math.floor(w / 10));
    g.fillStyle = vgrad(g, 0, h - 8, h, [[0, '#d9e0ea'], [1, '#8b95a4']]);
    g.beginPath();
    g.moveTo(1, h - 7);
    for (i = 0; i < teeth; i++){
      var x0 = 1 + (w - 2) * (i / teeth);
      var x1 = 1 + (w - 2) * ((i + 0.5) / teeth);
      var x2 = 1 + (w - 2) * ((i + 1) / teeth);
      g.lineTo(x1, h - 1);
      g.lineTo(x2, h - 7);
    }
    g.lineTo(w - 1, h - 7);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(20,26,36,0.5)'; g.lineWidth = 1; g.stroke();
    /* face */
    var cx = w / 2, cy = h * 0.42;
    var eyeY = cy - 1;
    for (i = 0; i < 2; i++){
      var ex = cx + (i ? 1 : -1) * w * 0.17;
      if (e.face === 2){
        g.strokeStyle = '#1b2230'; g.lineWidth = 2; g.lineCap = 'round';
        g.beginPath();
        g.moveTo(ex - 4, eyeY - 3); g.lineTo(ex + 4, eyeY + 3);
        g.moveTo(ex + 4, eyeY - 3); g.lineTo(ex - 4, eyeY + 3);
        g.stroke();
      } else {
        var open = e.face === 1 ? 5.6 : 4.2;
        fillCircle(g, ex, eyeY, open, '#f4f7fb');
        var look = e.face === 1 ? 1.6 : 0;
        fillCircle(g, ex, eyeY + look, open * 0.5, '#171d29');
        fillCircle(g, ex - 1.2, eyeY - 1.4, open * 0.2, 'rgba(255,255,255,0.9)');
        if (e.face === 1){
          g.strokeStyle = '#171d29'; g.lineWidth = 2.4;
          g.beginPath();
          g.moveTo(ex - 6 * (i ? -1 : 1), eyeY - 8);
          g.lineTo(ex + 5 * (i ? -1 : 1), eyeY - 5);
          g.stroke();
        }
      }
    }
    /* mouth */
    g.strokeStyle = '#171d29'; g.lineWidth = 2; g.lineCap = 'round';
    g.beginPath();
    if (e.face === 1){
      g.moveTo(cx - 6, cy + 11); g.quadraticCurveTo(cx, cy + 6, cx + 6, cy + 11);
    } else if (e.face === 2){
      g.moveTo(cx - 5, cy + 9); g.quadraticCurveTo(cx, cy + 13, cx + 5, cy + 9);
    } else {
      g.moveTo(cx - 5, cy + 10); g.lineTo(cx + 5, cy + 10);
    }
    g.stroke();
    /* charge aura while shaking */
    if (e.state === 'shake'){
      g.save();
      g.globalAlpha = 0.3 + 0.3 * Math.sin(e.at * 30);
      g.strokeStyle = '#ff9d5c'; g.lineWidth = 2.5;
      strokeRR(g, -2, -2, w + 4, h + 4, 5, '#ff9d5c', 2.5);
      g.restore();
    }
  }
});

/* =========================================================================
 *  7. CANNON - fires ball projectiles
 * ========================================================================= */
/* spawn helper: RT.spawn takes a level descriptor (tiles); we also write the
 * pixel fields straight onto the instance so the result is right whichever
 * unit the engine used. */
function spawnAt(descriptor, pxX, pxY, pxW, pxH){
  if (!isFn(RT.spawn)) return null;
  var o = null;
  try { o = RT.spawn(descriptor); } catch (err) { logErr('spawn:' + descriptor.type, err); }
  /* descriptors are in tiles, but the exact pixel muzzle matters - so the
   * instance gets the pixel values written straight onto it as well */
  if (o){
    o.x = pxX; o.y = pxY;
    if (pxW != null){ o.w = pxW; o.h = pxH; }
  }
  return o;
}

E('cannon', {
  layer: 'main',
  solid: false,
  keep: ['timer', 'recoil', 'ang'],
  init: function(e, d){
    e.dirn = dirName(d.dir, 'right');
    e.every = Math.max(0.15, num(d.every, 2));
    e.ballSpd = spd(d.speed, 6);
    e.aim = !!d.aim;
    e.kind = str(d.kind, 'fire');
    e.ballR = tpx(d.r, 0.28);
    e.timer = e.every - clamp(num(d.phase, 0) % e.every, 0, e.every);
    e.recoil = 0;
    var v = dirVec(e.dirn);
    e.ang = Math.atan2(v.y, v.x);
    e.baseAng = e.ang;
  },
  update: function(e, dt){
    var w = DW(e), h = DH(e);
    var cx = e.x + w / 2, cy = e.y + h / 2;
    if (e.recoil > 0) e.recoil = Math.max(0, e.recoil - dt * 4);
    if (e.aim && pAlive()){
      var want = Math.atan2(pCy() - cy, pCx() - cx);
      var diff = Math.atan2(Math.sin(want - e.ang), Math.cos(want - e.ang));
      e.ang += clamp(diff, -2.2 * dt, 2.2 * dt);
    }
    e.timer += dt;
    if (e.timer < e.every) return;
    e.timer -= e.every;
    var mlen = Math.max(w, h) * 0.62;
    var mx = cx + Math.cos(e.ang) * mlen, my = cy + Math.sin(e.ang) * mlen;
    spawnAt({
      type: 'ball',
      x: (mx - e.ballR) / T, y: (my - e.ballR) / T,
      w: (e.ballR * 2) / T, h: (e.ballR * 2) / T,
      vx: Math.cos(e.ang) * e.ballSpd, vy: Math.sin(e.ang) * e.ballSpd,
      kind: e.kind, r: e.ballR / T
    }, mx - e.ballR, my - e.ballR, e.ballR * 2, e.ballR * 2);
    e.recoil = 1;
    sfx('pop');
    shakeCam(2, 0.08);
    fxBurst(mx, my, ['#fff3c4', '#ffb457', '#ff7a3d'], 10, 170, {
      life: 0.35, gravity: 60, size: 3
    });
    fxEmit(mx, my, 'embers');
  },
  draw: function(e, g){
    var w = DW(e), h = DH(e), cx = e.x + w / 2, cy = e.y + h / 2, i;
    /* mount base */
    fillRR(g, e.x + w * 0.12, cy - h * 0.12, w * 0.76, h * 0.5, 4, vgrad(g, 0, cy, cy + h * 0.4, [[0, '#6b7482'], [1, '#3a414d']]));
    strokeRR(g, e.x + w * 0.12, cy - h * 0.12, w * 0.76, h * 0.5, 4, 'rgba(10,14,20,0.6)', 1.3);
    for (i = 0; i < 3; i++) rivet(g, e.x + w * (0.25 + i * 0.25), cy + h * 0.28, 2);
    /* barrel */
    g.save();
    g.translate(cx, cy);
    g.rotate(e.ang);
    var back = -e.recoil * 4;
    var bl = Math.max(w, h) * 0.66, bw = Math.min(w, h) * 0.5;
    fillRR(g, back - bl * 0.28, -bw / 2, bl, bw, bw * 0.28,
      vgrad(g, 0, -bw / 2, bw / 2, [[0, '#a8b3c2'], [0.45, '#78828f'], [1, '#434b57']]));
    strokeRR(g, back - bl * 0.28, -bw / 2, bl, bw, bw * 0.28, 'rgba(8,12,18,0.7)', 1.4);
    /* bands */
    g.fillStyle = 'rgba(30,36,46,0.55)';
    g.fillRect(back + bl * 0.10, -bw / 2, 3, bw);
    g.fillRect(back + bl * 0.26, -bw / 2, 3, bw);
    /* muzzle */
    fillRR(g, back + bl * 0.30, -bw * 0.62, bw * 0.42, bw * 1.24, 3, '#59626f');
    fillCircle(g, back + bl * 0.36, 0, bw * 0.30, '#15181f');
    /* charge glow just before firing */
    var k = clamp(1 - (e.every - e.timer) / 0.35, 0, 1);
    if (k > 0){
      g.save();
      g.globalAlpha = k * 0.85;
      fillCircle(g, back + bl * 0.36, 0, bw * (0.16 + 0.22 * k), '#ffd27a');
      g.restore();
    }
    g.restore();
    /* pivot */
    fillCircle(g, cx, cy, Math.min(w, h) * 0.20, '#5b6472');
    fillCircle(g, cx - 1, cy - 1, Math.min(w, h) * 0.08, 'rgba(255,255,255,0.35)');
  }
});

/* =========================================================================
 *  8. SAW - spinning blade, kills
 * ========================================================================= */
E('saw', {
  layer: 'main',
  solid: false,
  keep: ['node', 'nextNode', 'pdir', 'waitT', 'spin'],
  init: function(e, d){
    e.r = tpx(d.r, 0.75);
    if (d.w == null){ e.w = e.r * 2; }
    if (d.h == null){ e.h = e.r * 2; }
    buildPath(e, d);
    e.spdPx = spd(d.speed, 2.6);
    e.spin = 0;
    e.showPath = d.ghost !== false;
    e.teeth = Math.max(8, Math.round(num(d.teeth, e.r / 3)));
  },
  update: function(e, dt){
    pathStep(e, dt, e.spdPx);
    e.spin += dt * (6 + e.spdPx * 0.02);
    var cx = e.x + DW(e) / 2, cy = e.y + DH(e) / 2;
    if (hitPCircle(cx, cy, e.r * 0.86)) hurt('saw');
    /* sparks when the blade grinds a wall */
    if (Math.random() < 0.25){
      var a = Math.random() * TAU;
      var sx = cx + Math.cos(a) * e.r, sy = cy + Math.sin(a) * e.r;
      if (solidPx(sx, sy)){
        fxBurst(sx, sy, ['#fff6c9', '#ffc45c', '#ff8a3d'], 4, 210, { life: 0.3, gravity: 700, size: 2 });
      }
    }
  },
  draw: function(e, g){
    var w = DW(e), h = DH(e), cx = e.x + w / 2, cy = e.y + h / 2, r = e.r, i;
    if (e.showPath) drawPathGhost(g, e, '#ffb4a2');
    g.translate(cx, cy);
    g.rotate(e.spin);
    /* teeth */
    var n = e.teeth;
    g.beginPath();
    for (i = 0; i < n; i++){
      var a0 = (i / n) * TAU, a1 = ((i + 0.5) / n) * TAU;
      var r0 = r, r1 = r * 0.80;
      if (i === 0) g.moveTo(Math.cos(a0) * r0, Math.sin(a0) * r0);
      else g.lineTo(Math.cos(a0) * r0, Math.sin(a0) * r0);
      g.lineTo(Math.cos(a1) * r1, Math.sin(a1) * r1);
    }
    g.closePath();
    g.fillStyle = rgrad(g, -r * 0.3, -r * 0.3, r * 0.1, r * 1.2, [[0, '#f2f6fb'], [0.55, '#b9c3d1'], [1, '#6e7a8a']]);
    g.fill();
    g.strokeStyle = 'rgba(20,26,36,0.65)'; g.lineWidth = 1.4; g.stroke();
    /* disc face */
    fillCircle(g, 0, 0, r * 0.62, rgrad(g, -r * 0.2, -r * 0.2, r * 0.05, r * 0.7, [[0, '#dfe6ef'], [1, '#8f9aa9']]));
    g.strokeStyle = 'rgba(20,26,36,0.4)'; g.lineWidth = 1; circle(g, 0, 0, r * 0.62); g.stroke();
    /* bolt holes */
    for (i = 0; i < 6; i++){
      var a = (i / 6) * TAU;
      fillCircle(g, Math.cos(a) * r * 0.42, Math.sin(a) * r * 0.42, r * 0.085, 'rgba(40,48,60,0.55)');
    }
    /* hub */
    fillCircle(g, 0, 0, r * 0.22, '#4b5462');
    fillCircle(g, -r * 0.05, -r * 0.06, r * 0.09, 'rgba(255,255,255,0.5)');
    /* motion glint */
    g.save();
    g.globalAlpha = 0.22;
    g.strokeStyle = '#ffffff'; g.lineWidth = r * 0.16;
    g.beginPath(); g.arc(0, 0, r * 0.88, -0.5, 0.5); g.stroke();
    g.restore();
  }
});

/* =========================================================================
 *  9. LASER - kills while on, 0.3 s charge warning
 * ========================================================================= */
E('laser', {
  layer: 'main',
  solid: false,
  keep: ['len', 'phase'],
  init: function(e, d){
    e.onT = Math.max(0.1, num(d.on, 1.2));
    e.offT = Math.max(0.1, num(d.off, 1.6));
    e.charge = 0.3;
    e.axis = (e.w >= e.h) ? 'h' : 'v';
    e.dirn = dirName(d.dir, e.axis === 'h' ? 'right' : 'down');
    if (e.dirn === 'up' || e.dirn === 'down') e.axis = 'v'; else e.axis = 'h';
    e.span = e.axis === 'h' ? e.w : e.h;
    e.thick = tpx(d.thick, 0.34);
    e.len = e.span;
    e.color = str(d.color, '#ff4d6d');
    e.phase = num(d.phase, 0);
    e.live = false;
    e.warned = false;
  },
  update: function(e, dt){
    var cycle = e.onT + e.offT;
    var t = (e.at + e.phase) % cycle;
    var prevLive = e.live;
    e.live = t < e.onT;
    e.warn = !e.live && (e.onT + e.offT - t) <= e.charge;
    if (e.warn && !e.warned){ e.warned = true; sfx('charge'); }
    if (!e.warn) e.warned = false;
    if (e.live && !prevLive){
      sfx('laser');
      shakeCam(2, 0.08);
    }
    /* the beam stops at the first solid, so toggle blocks really block it */
    var v = dirVec(e.dirn);
    var ox = e.x + (v.x > 0 ? 0 : (v.x < 0 ? e.w : e.w / 2));
    var oy = e.y + (v.y > 0 ? 0 : (v.y < 0 ? e.h : e.h / 2));
    var d = 6, max = e.span;
    while (d < max){
      if (solidPx(ox + v.x * d, oy + v.y * d)) break;
      d += 6;
    }
    e.len = Math.min(max, d);
    if (!e.live) return;
    var b = laserRect(e);
    if (hitP(b.x, b.y, b.w, b.h, 2)) hurt('laser');
  },
  draw: function(e, g){
    var v = dirVec(e.dirn);
    var b = laserRect(e);
    var i;
    /* emitter pod */
    var ex = e.x + (v.x > 0 ? 0 : (v.x < 0 ? e.w - 10 : (e.w - 12) / 2));
    var ey = e.y + (v.y > 0 ? 0 : (v.y < 0 ? e.h - 10 : (e.h - 12) / 2));
    var ew = (e.axis === 'h') ? 10 : 12, eh = (e.axis === 'h') ? 12 : 10;
    if (e.live){
      g.save();
      g.globalAlpha = 0.85;
      /* outer glow */
      var gx0 = b.x - (e.axis === 'h' ? 0 : 6), gy0 = b.y - (e.axis === 'h' ? 6 : 0);
      var gw = b.w + (e.axis === 'h' ? 0 : 12), gh = b.h + (e.axis === 'h' ? 12 : 0);
      var grad = (e.axis === 'h')
        ? vgrad(g, 0, gy0, gy0 + gh, [[0, 'rgba(255,77,109,0)'], [0.5, 'rgba(255,77,109,0.42)'], [1, 'rgba(255,77,109,0)']])
        : hgrad(g, gx0, gx0 + gw, 0, [[0, 'rgba(255,77,109,0)'], [0.5, 'rgba(255,77,109,0.42)'], [1, 'rgba(255,77,109,0)']]);
      g.fillStyle = grad;
      g.fillRect(gx0, gy0, gw, gh);
      g.restore();
      /* beam body + white core, flickering */
      var fl = 0.9 + 0.1 * Math.sin(e.at * 44);
      g.globalAlpha = fl;
      fillRR(g, b.x, b.y, b.w, b.h, Math.min(b.w, b.h) / 2, e.color);
      var cw = (e.axis === 'h') ? b.w : b.w * 0.42;
      var ch = (e.axis === 'h') ? b.h * 0.42 : b.h;
      fillRR(g, b.x + (b.w - cw) / 2, b.y + (b.h - ch) / 2, cw, ch, Math.min(cw, ch) / 2, 'rgba(255,255,255,0.92)');
      g.globalAlpha = 1;
      /* impact splash at the far end */
      var hx = b.x + (v.x > 0 ? b.w : (v.x < 0 ? 0 : b.w / 2));
      var hy = b.y + (v.y > 0 ? b.h : (v.y < 0 ? 0 : b.h / 2));
      g.save();
      g.globalAlpha = 0.5 + 0.3 * Math.sin(e.at * 30);
      fillCircle(g, hx, hy, 6, 'rgba(255,190,200,0.85)');
      g.restore();
      if (Math.random() < 0.3) fxBurst(hx, hy, ['#ffd0d8', '#ff5470'], 2, 130, { life: 0.25, gravity: 200, size: 2 });
    } else if (e.warn){
      /* charge warning: dashed ghost of the beam */
      g.save();
      g.globalAlpha = 0.28 + 0.3 * Math.abs(Math.sin(e.at * 26));
      g.strokeStyle = e.color;
      g.lineWidth = 2;
      if (isFn(g.setLineDash)) g.setLineDash([6, 6]);
      g.beginPath();
      if (e.axis === 'h'){ g.moveTo(b.x, b.y + b.h / 2); g.lineTo(b.x + b.w, b.y + b.h / 2); }
      else { g.moveTo(b.x + b.w / 2, b.y); g.lineTo(b.x + b.w / 2, b.y + b.h); }
      g.stroke();
      if (isFn(g.setLineDash)) g.setLineDash([]);
      g.restore();
    }
    /* pods at both ends */
    drawPod(g, ex, ey, ew, eh, e, true);
    var fx2 = ex + v.x * (e.len - (e.axis === 'h' ? 10 : 0));
    var fy2 = ey + v.y * (e.len - (e.axis === 'v' ? 10 : 0));
    drawPod(g, fx2, fy2, ew, eh, e, false);
  }
});
function laserRect(e){
  var v = dirVec(e.dirn), th = e.thick;
  if (e.axis === 'h'){
    var x0 = (v.x > 0) ? e.x : (e.x + e.w - e.len);
    return { x: x0 + 8 * (v.x > 0 ? 1 : 0), y: e.y + (e.h - th) / 2, w: Math.max(0, e.len - 8), h: th };
  }
  var y0 = (v.y > 0) ? e.y : (e.y + e.h - e.len);
  return { x: e.x + (e.w - th) / 2, y: y0 + 8 * (v.y > 0 ? 1 : 0), w: th, h: Math.max(0, e.len - 8) };
}
function drawPod(g, x, y, w, h, e, emitter){
  fillRR(g, x, y, w, h, 3, vgrad(g, 0, y, y + h, [[0, '#8b96a6'], [1, '#414957']]));
  strokeRR(g, x + 0.5, y + 0.5, w - 1, h - 1, 3, 'rgba(8,12,18,0.7)', 1.2);
  rivet(g, x + w * 0.5, y + h * 0.22, 1.6);
  rivet(g, x + w * 0.5, y + h * 0.78, 1.6);
  var lit = e.live ? 1 : (e.warn ? (0.4 + 0.5 * Math.abs(Math.sin(e.at * 26))) : 0.16);
  g.save();
  g.globalAlpha = lit;
  fillCircle(g, x + w / 2, y + h / 2, Math.min(w, h) * 0.26, emitter ? '#ff6b82' : '#ffd0d8');
  g.restore();
}

/* =========================================================================
 * 10. BEATBLOCK - alternating solid blocks, 0.25 s warning flash
 * ========================================================================= */
function groupsObj(){ return RT.groups || (RT.groups = {}); }
function keysObj(){ return RT.keys || (RT.keys = {}); }

E('beatblock', {
  layer: 'main',
  solid: true,
  keep: ['on'],
  init: function(e, d){
    e.group = String(str(d.group, 'A')).toUpperCase().charAt(0);
    e.period = Math.max(0.2, num(d.period, 1.6));
    e.phase = num(d.phase, 0);
    e.col = groupColor(e.group);
    e.on = true;
    e.warn = 0;
    beatSync(e, 0);
    setSolid(e, e.on);
    e.popped = 0;
  },
  update: function(e, dt){
    var was = e.on;
    beatSync(e, dt);
    if (e.on !== was){
      setSolid(e, e.on);
      e.popped = 1;
      sfx(e.on ? 'bonk' : 'pop');
      var cx = e.x + DW(e) / 2, cy = e.y + DH(e) / 2;
      fxBurst(cx, cy, [e.col, '#ffffff'], e.on ? 10 : 8, e.on ? 140 : 90, { life: 0.35, gravity: 120 });
      /* being inside a block when it comes back is not a death, the engine
       * pushes the player out; a nudge upward keeps it readable */
      if (e.on && hitPE(e, 2)){
        var p = RT.player;
        if (p && p.y + pH() / 2 < e.y + DH(e) / 2) p.y = e.y - pH() - 0.5;
      }
    }
    if (e.popped > 0) e.popped = Math.max(0, e.popped - dt * 3.5);
  },
  onReset: function(e){
    e.at = 0;
    beatSync(e, 0);
    setSolid(e, e.on);
    e.popped = 0;
  },
  draw: function(e, g){
    var w = DW(e), h = DH(e), x = e.x, y = e.y, i;
    var pulse = e.popped;
    if (e.on){
      var sc = 1 + pulse * 0.06;
      g.translate(x + w / 2, y + h / 2);
      g.scale(sc, 1 / sc);
      g.translate(-(x + w / 2), -(y + h / 2));
      blockBody(g, x, y, w, h, {
        face: e.col, side: shade(e.col, -0.22), dark: shade(e.col, -0.45),
        rim: 'rgba(255,255,255,0.45)', line: 'rgba(0,0,0,0.55)'
      }, e.seed, 4);
      /* group badge */
      drawLabel(g, e.group, x + w / 2, y + h / 2 + 1, {
        size: Math.min(18, Math.min(w, h) * 0.5), color: 'rgba(255,255,255,0.92)',
        outline: 'rgba(0,0,0,0.35)', outlineWidth: 3
      });
      if (e.warn > 0){
        g.save();
        g.globalAlpha = 0.35 + 0.45 * Math.abs(Math.sin(e.at * 34));
        strokeRR(g, x + 1, y + 1, w - 2, h - 2, 4, '#ffffff', 2.5);
        g.restore();
      }
    } else {
      /* ghost: dashed outline + faint fill so the beat stays readable */
      g.save();
      g.globalAlpha = 0.16 + (e.warn > 0 ? 0.24 * Math.abs(Math.sin(e.at * 34)) : 0);
      fillRR(g, x + 2, y + 2, w - 4, h - 4, 4, e.col);
      g.restore();
      g.save();
      g.globalAlpha = 0.55;
      g.strokeStyle = e.col;
      g.lineWidth = 2;
      if (isFn(g.setLineDash)) g.setLineDash([6, 5]);
      strokeRR(g, x + 2, y + 2, w - 4, h - 4, 4, e.col, 2);
      if (isFn(g.setLineDash)) g.setLineDash([]);
      g.restore();
      g.save();
      g.globalAlpha = 0.4;
      drawLabel(g, e.group, x + w / 2, y + h / 2 + 1, {
        size: Math.min(18, Math.min(w, h) * 0.5), color: e.col
      });
      g.restore();
    }
  }
});
function beatSync(e, dt){
  var t = (e.at + e.phase) % (e.period * 2);
  var first = t < e.period;
  e.on = (e.group === 'B') ? !first : first;
  var toSwitch = e.period - (t % e.period);
  e.warn = (toSwitch <= 0.25) ? 1 : 0;
}
/* lighten (amt>0) / darken (amt<0) a #rrggbb colour */
function shade(hex, amt){
  var h = String(hex).replace('#', '');
  if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
  var r = parseInt(h.substring(0, 2), 16), g2 = parseInt(h.substring(2, 4), 16), b = parseInt(h.substring(4, 6), 16);
  if (isNaN(r) || isNaN(g2) || isNaN(b)) return hex;
  function f(v){ return Math.round(clamp(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt, 0, 255)); }
  return 'rgb(' + f(r) + ',' + f(g2) + ',' + f(b) + ')';
}

/* =========================================================================
 * 11. SWITCH - toggles RT.groups[group], emits 'switch'
 * ========================================================================= */
E('switch', {
  layer: 'main',
  solid: false,
  keep: ['cool', 'flip', 'used'],
  init: function(e, d){
    e.group = String(str(d.group, 'A')).toUpperCase().charAt(0);
    e.once = !!d.once;
    e.alsoOnOff = !!d.onoff;
    e.col = groupColor(e.group);
    e.cool = 0;
    e.used = false;
    e.flip = 0;
    e.gInit = !!groupsObj()[e.group];
    if (groupsObj()[e.group] === undefined) groupsObj()[e.group] = false;
  },
  update: function(e, dt){
    if (e.cool > 0) e.cool -= dt;
    var on = !!groupsObj()[e.group];
    e.flip += ((on ? 1 : 0) - e.flip) * Math.min(1, dt * 14);
    if (e.used && e.once){ groupsObj()[e.group] = true; return; }
    if (e.cool > 0 || !pAlive()) return;
    if (!hitP(e.x - 2, e.y - 2, DW(e) + 4, DH(e) + 4, 2)) return;
    groupsObj()[e.group] = !on;
    e.cool = 0.4;
    e.used = true;
    if (e.once) e.persistent = true;
    if (e.alsoOnOff && isFn(RT.toggleOnOff)){ try { RT.toggleOnOff(); } catch (err) {} }
    sfx('switch');
    shakeCam(2.5, 0.1);
    hitStop(2);
    var cx = e.x + DW(e) / 2, cy = e.y + DH(e) / 2;
    fxBurst(cx, cy, [e.col, '#ffffff'], 16, 180, { life: 0.45, gravity: 300 });
    emitEvt('switch', e.group, !on, e);
  },
  onReset: function(e){
    if (e.once && e.used){ groupsObj()[e.group] = true; return; }
    groupsObj()[e.group] = e.gInit;
    e.cool = 0; e.used = false;
    e.flip = e.gInit ? 1 : 0;
  },
  draw: function(e, g){
    var w = DW(e), h = DH(e), x = e.x, y = e.y;
    var on = e.flip;
    /* base */
    fillRR(g, x + w * 0.12, y + h * 0.52, w * 0.76, h * 0.44, 4, vgrad(g, 0, y + h * 0.5, y + h, [[0, '#6c7584'], [1, '#39404c']]));
    strokeRR(g, x + w * 0.12, y + h * 0.52, w * 0.76, h * 0.44, 4, 'rgba(8,12,18,0.65)', 1.3);
    rivet(g, x + w * 0.24, y + h * 0.86, 2);
    rivet(g, x + w * 0.76, y + h * 0.86, 2);
    /* lever */
    var px1 = x + w / 2, py1 = y + h * 0.56;
    var ang = lerp(-0.85, 0.85, on);
    g.save();
    g.translate(px1, py1);
    g.rotate(ang);
    g.strokeStyle = '#cbd3df'; g.lineWidth = 4; g.lineCap = 'round';
    g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -h * 0.42); g.stroke();
    g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -h * 0.42); g.stroke();
    fillCircle(g, 0, -h * 0.44, 4.6, on > 0.5 ? e.col : '#8c96a5');
    fillCircle(g, -1.2, -h * 0.44 - 1.4, 1.8, 'rgba(255,255,255,0.65)');
    g.restore();
    fillCircle(g, px1, py1, 3.4, '#242a34');
    /* state bulb + group letter */
    g.save();
    g.globalAlpha = 0.35 + (on > 0.5 ? 0.5 : 0.1);
    fillCircle(g, x + w * 0.5, y + h * 0.78, 3.2, on > 0.5 ? e.col : '#3f4652');
    g.restore();
    drawLabel(g, e.group, x + w * 0.5, y + h * 0.78 + 0.5, {
      size: 9, color: on > 0.5 ? '#ffffff' : 'rgba(255,255,255,0.45)'
    });
    if (e.once && e.used){
      g.save(); g.globalAlpha = 0.5;
      drawLabel(g, 'LOCKED', x + w / 2, y - 6, { size: 7, color: '#ffd7a0', outline: 'rgba(0,0,0,0.5)' });
      g.restore();
    }
  }
});

/* =========================================================================
 * 12. TOGGLEBLOCK - solid when its group is on
 * ========================================================================= */
E('toggleblock', {
  layer: 'main',
  solid: true,
  keep: ['on', 'anim'],
  init: function(e, d){
    e.group = String(str(d.group, 'A')).toUpperCase().charAt(0);
    e.invert = !!d.invert;
    e.col = groupColor(e.group);
    e.on = !!groupsObj()[e.group] !== e.invert;
    e.anim = e.on ? 1 : 0;
    setSolid(e, e.on);
  },
  update: function(e, dt){
    var want = (!!groupsObj()[e.group]) !== e.invert;
    if (want !== e.on){
      e.on = want;
      setSolid(e, want);
      sfx(want ? 'bonk' : 'pop');
      var cx = e.x + DW(e) / 2, cy = e.y + DH(e) / 2;
      fxBurst(cx, cy, [e.col, '#ffffff'], 12, 150, { life: 0.4, gravity: 200 });
      if (want && hitPE(e, 2)){
        var p = RT.player;
        if (p && p.y + pH() / 2 < e.y + DH(e) / 2) p.y = e.y - pH() - 0.5;
      }
    }
    e.anim += ((e.on ? 1 : 0) - e.anim) * Math.min(1, dt * 10);
  },
  onReset: function(e){
    e.on = (!!groupsObj()[e.group]) !== e.invert;
    e.anim = e.on ? 1 : 0;
    setSolid(e, e.on);
  },
  draw: function(e, g){
    var w = DW(e), h = DH(e), x = e.x, y = e.y;
    var k = clamp(e.anim, 0, 1);
    if (k > 0.02){
      g.save();
      g.globalAlpha = clamp(k * 1.1, 0, 1);
      var s = lerp(0.82, 1, k);
      g.translate(x + w / 2, y + h / 2); g.scale(s, s); g.translate(-(x + w / 2), -(y + h / 2));
      blockBody(g, x, y, w, h, {
        face: e.col, side: shade(e.col, -0.25), dark: shade(e.col, -0.48),
        rim: 'rgba(255,255,255,0.42)', line: 'rgba(0,0,0,0.55)'
      }, e.seed, 4);
      /* filled dot marker */
      fillCircle(g, x + w / 2, y + h / 2, Math.min(w, h) * 0.16, 'rgba(255,255,255,0.85)');
      g.restore();
    }
    if (k < 0.98){
      g.save();
      g.globalAlpha = (1 - k) * 0.75;
      g.strokeStyle = e.col; g.lineWidth = 2;
      if (isFn(g.setLineDash)) g.setLineDash([5, 5]);
      strokeRR(g, x + 2.5, y + 2.5, w - 5, h - 5, 4, e.col, 2);
      if (isFn(g.setLineDash)) g.setLineDash([]);
      circle(g, x + w / 2, y + h / 2, Math.min(w, h) * 0.16); g.stroke();
      g.restore();
    }
  }
});

/* =========================================================================
 * 13. DOOR - solid until unlocked
 * ========================================================================= */
E('door', {
  layer: 'main',
  solid: true,
  keep: ['open', 'opened'],
  init: function(e, d){
    e.keyName = str(d.key, null);
    e.group = d.group ? String(d.group).toUpperCase().charAt(0) : null;
    e.col = e.keyName ? keyColor(e.keyName) : (e.group ? groupColor(e.group) : '#ffd54f');
    e.open = 0;
    e.opened = false;
    setSolid(e, true);
  },
  update: function(e, dt){
    var unlocked = e.keyName ? !!keysObj()[e.keyName] : (e.group ? !!groupsObj()[e.group] : false);
    if (unlocked && !e.opened){
      e.opened = true;
      sfx('door');
      shakeCam(3, 0.2);
      var cx = e.x + DW(e) / 2;
      fxBurst(cx, e.y + DH(e) / 2, [e.col, '#ffffff', '#ffe9a8'], 22, 200, { life: 0.6, gravity: 240 });
    }
    if (!unlocked && e.opened){ e.opened = false; }
    var want = e.opened ? 1 : 0;
    if (e.open !== want){
      e.open += (want - e.open) * Math.min(1, dt * 5.5);
      if (Math.abs(want - e.open) < 0.01) e.open = want;
    }
    setSolid(e, e.open < 0.08);
  },
  onReset: function(e){
    var unlocked = e.keyName ? !!keysObj()[e.keyName] : (e.group ? !!groupsObj()[e.group] : false);
    e.opened = unlocked;
    e.open = unlocked ? 1 : 0;
    setSolid(e, !unlocked);
  },
  draw: function(e, g){
    var w = DW(e), h = DH(e), x = e.x, y = e.y, i;
    /* frame (always drawn) */
    fillRR(g, x - 2, y - 3, w + 4, 5, 2, '#4a4038');
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(x - 2, y + h - 2, w + 4, 3);
    /* the leaf slides up into the frame */
    var lift = e.open * (h - 4);
    g.save();
    g.beginPath();
    g.rect(x - 3, y - 3, w + 6, h + 4);
    g.clip();
    g.translate(0, -lift);
    blockBody(g, x, y, w, h, PAL.wood, e.seed, 3);
    /* metal bands */
    for (i = 0; i < 2; i++){
      var by = y + h * (0.22 + i * 0.5);
      g.fillStyle = vgrad(g, 0, by, by + 7, [[0, '#9aa4b2'], [1, '#5c6574']]);
      g.fillRect(x + 1, by, w - 2, 7);
      g.fillStyle = 'rgba(255,255,255,0.22)';
      g.fillRect(x + 1, by, w - 2, 1.5);
      rivet(g, x + 6, by + 3.5, 2);
      rivet(g, x + w - 6, by + 3.5, 2);
    }
    /* plank seams */
    g.strokeStyle = 'rgba(40,22,10,0.45)'; g.lineWidth = 1;
    for (i = 1; i < 3; i++){
      g.beginPath();
      g.moveTo(x + (w / 3) * i, y + 2);
      g.lineTo(x + (w / 3) * i, y + h - 2);
      g.stroke();
    }
    /* lock plate + keyhole */
    var lx = x + w / 2, ly = y + h * 0.5;
    fillRR(g, lx - 9, ly - 11, 18, 22, 4, vgrad(g, 0, ly - 11, ly + 11, [[0, '#cfd6e0'], [1, '#79828f']]));
    strokeRR(g, lx - 9, ly - 11, 18, 22, 4, 'rgba(10,14,20,0.6)', 1.2);
    g.fillStyle = e.opened ? e.col : '#1c222c';
    circle(g, lx, ly - 2, 3.4); g.fill();
    poly(g, [lx - 2.2, ly - 1, lx + 2.2, ly - 1, lx + 1.2, ly + 7, lx - 1.2, ly + 7]);
    g.fill();
    if (!e.opened){
      g.save();
      g.globalAlpha = 0.35 + 0.35 * Math.sin(e.at * 3);
      circle(g, lx, ly - 2, 5.6);
      g.strokeStyle = e.col; g.lineWidth = 1.6; g.stroke();
      g.restore();
    }
    g.restore();
    /* frame posts on top */
    g.fillStyle = '#3c352e';
    g.fillRect(x - 3, y - 3, 3, h + 4);
    g.fillRect(x + w, y - 3, 3, h + 4);
  }
});

/* =========================================================================
 * 14. KEY - collectable, sets RT.keys[key]
 * ========================================================================= */
E('key', {
  layer: 'main',
  solid: false,
  keep: ['got', 'pop'],
  init: function(e, d){
    e.keyName = str(d.key, 'gold');
    e.col = keyColor(e.keyName);
    e.got = false;
    e.pop = 0;
    e.homeY = e.y;
  },
  update: function(e, dt){
    if (e.got){
      keysObj()[e.keyName] = true;     /* stays unlocked across respawns */
      if (e.pop > 0){ e.pop -= dt; e.y -= 54 * dt; }
      return;
    }
    e.y = e.homeY + Math.sin(e.at * 2.4) * 3.2;
    if (Math.random() < 0.05){
      fxBurst(e.x + DW(e) / 2 + rrange(-7, 7), e.y + DH(e) / 2 + rrange(-7, 7), [e.col, '#ffffff'], 1, 12,
        { life: 0.5, gravity: -20, size: 2 });
    }
    if (!hitP(e.x - 2, e.y - 2, DW(e) + 4, DH(e) + 4, 2)) return;
    e.got = true;
    e.pop = 0.6;
    e.persistent = true;
    keysObj()[e.keyName] = true;
    sfx('key');
    flashScreen('rgba(255,225,150,0.25)', 0.12);
    fxBurst(e.x + DW(e) / 2, e.y + DH(e) / 2, [e.col, '#ffffff', '#fff3c4'], 26, 230, { life: 0.7, gravity: 120 });
    toastMsg(String(e.keyName).toUpperCase() + ' KEY', 1.4);
    emitEvt('key', e.keyName, e);
  },
  onReset: function(e){
    if (e.got){ e.persistent = true; return; }
    e.y = e.homeY;
  },
  draw: function(e, g){
    if (e.got && e.pop <= 0) return;
    var w = DW(e), h = DH(e), cx = e.x + w / 2, cy = e.y + h / 2;
    if (e.got){ g.globalAlpha = clamp(e.pop / 0.6, 0, 1); }
    /* halo */
    g.save();
    g.globalAlpha = (g.globalAlpha || 1) * 0.30;
    fillCircle(g, cx, cy, w * 0.62 + Math.sin(e.at * 4) * 1.5, rgrad(g, cx, cy, 1, w * 0.7, [[0, e.col], [1, 'rgba(0,0,0,0)']]));
    g.restore();
    g.translate(cx, cy);
    g.rotate(Math.sin(e.at * 1.6) * 0.25);
    /* bow (ring) */
    g.strokeStyle = e.col; g.lineWidth = 4;
    circle(g, 0, -w * 0.20, w * 0.19); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 1.4;
    circle(g, 0, -w * 0.20, w * 0.19); g.stroke();
    /* shaft */
    g.fillStyle = e.col;
    fillRR(g, -1.9, -w * 0.05, 3.8, h * 0.44, 1.6, e.col);
    /* teeth */
    g.fillRect(1.6, h * 0.22, 5.5, 3.2);
    g.fillRect(1.6, h * 0.32, 4, 3.2);
    /* shine */
    g.fillStyle = 'rgba(255,255,255,0.6)';
    g.fillRect(-1.6, -w * 0.03, 1.2, h * 0.3);
  }
});

/* =========================================================================
 * 15. PORTAL - teleports with FX
 * ========================================================================= */
E('portal', {
  layer: 'main',
  solid: false,
  keep: ['glow'],
  init: function(e, d){
    var to = d.to;
    e.tx = (to && to.length >= 2) ? to[0] * T : e.x;
    e.ty = (to && to.length >= 2) ? to[1] * T : e.y;
    e.col = str(d.color, '#9b6bff');
    e.glow = 0;
    e.keepV = d.keepMomentum !== false;
  },
  update: function(e, dt){
    if (e.glow > 0) e.glow = Math.max(0, e.glow - dt * 2.2);
    if (Math.random() < 0.35){
      var a = Math.random() * TAU, rr = DW(e) * 0.55;
      fxBurst(e.x + DW(e) / 2 + Math.cos(a) * rr, e.y + DH(e) / 2 + Math.sin(a) * rr,
        [e.col, '#ffffff'], 1, 30, { life: 0.5, gravity: -40, size: 2 });
    }
    if (now() < Portal.until || !pAlive()) return;
    if (!hitP(e.x + 3, e.y + 3, DW(e) - 6, DH(e) - 6, 4)) return;
    var p = RT.player;
    var fromX = p.x, fromY = p.y;
    p.x = e.tx + (T - pW()) / 2;
    p.y = e.ty + (T - pH()) / 2;
    if (!e.keepV){ p.vx = 0; p.vy = 0; }
    else { p.vy = Math.min(num(p.vy, 0), 120); }
    Portal.until = now() + 0.5;
    e.glow = 1;
    sfx('portal');
    flashScreen('rgba(155,107,255,0.28)', 0.14);
    shakeCam(4, 0.18);
    fxBurst(fromX + pW() / 2, fromY + pH() / 2, [e.col, '#ffffff', '#d7bcff'], 26, 240, { life: 0.6, gravity: 0 });
    fxBurst(p.x + pW() / 2, p.y + pH() / 2, [e.col, '#ffffff', '#d7bcff'], 26, 240, { life: 0.6, gravity: 0 });
    emitEvt('portal', e);
  },
  draw: function(e, g){
    var w = DW(e), h = DH(e), cx = e.x + w / 2, cy = e.y + h / 2, i;
    var rx = w * 0.42, ry = h * 0.48;
    /* outer haze */
    g.save();
    g.globalAlpha = 0.35 + e.glow * 0.4;
    ellipse(g, cx, cy, rx * 1.35, ry * 1.25);
    g.fillStyle = rgrad(g, cx, cy, rx * 0.3, rx * 1.4, [[0, e.col], [1, 'rgba(0,0,0,0)']]);
    g.fill();
    g.restore();
    /* swirl rings */
    for (i = 0; i < 4; i++){
      var t = (e.at * 1.4 + i * 0.25) % 1;
      var k = 1 - t;
      g.save();
      g.globalAlpha = 0.22 + 0.5 * k * (0.6 + e.glow * 0.4);
      g.translate(cx, cy);
      g.rotate(e.at * (1.4 + i * 0.35) + i);
      ellipse(g, 0, 0, rx * (0.25 + t * 0.85), ry * (0.2 + t * 0.9));
      g.strokeStyle = i % 2 ? '#ffffff' : e.col;
      g.lineWidth = 1.5 + k * 1.6;
      g.stroke();
      g.restore();
    }
    /* core */
    ellipse(g, cx, cy, rx * 0.42, ry * 0.42);
    g.fillStyle = rgrad(g, cx, cy - 2, 1, rx * 0.5, [[0, '#ffffff'], [0.55, e.col], [1, 'rgba(20,0,40,0.9)']]);
    g.fill();
    /* frame arcs */
    g.save();
    g.strokeStyle = shade(e.col, -0.3);
    g.lineWidth = 2.4;
    g.beginPath(); g.arc(cx, cy, Math.max(rx, ry) * 1.05, -2.5, -0.65); g.stroke();
    g.beginPath(); g.arc(cx, cy, Math.max(rx, ry) * 1.05, 0.65, 2.5); g.stroke();
    g.restore();
    /* exit direction pip */
    var dx = e.tx - e.x, dy = e.ty - e.y, L = Math.sqrt(dx * dx + dy * dy);
    if (L > 8){
      g.save();
      g.globalAlpha = 0.65;
      g.translate(cx + dx / L * (rx + 6), cy + dy / L * (ry + 6));
      g.rotate(Math.atan2(dy, dx));
      g.fillStyle = e.col;
      poly(g, [-3, -3.5, 4, 0, -3, 3.5]);
      g.fill();
      g.restore();
    }
  }
});

/* =========================================================================
 * 16. WIND - push zone
 * ========================================================================= */
E('wind', {
  layer: 'back',
  solid: false,
  init: function(e, d){
    e.fx = spd(d.fx, 0);
    e.fy = spd(d.fy, 0);
    e.col = str(d.color, '#cfeaff');
    e.gust = num(d.gust, 0);
    e.parts = [];
    var n = Math.min(40, Math.max(8, Math.floor(DW(e) * DH(e) / 2200)));
    for (var i = 0; i < n; i++){
      e.parts.push({ x: srand(e.seed + i) * DW(e), y: srand(e.seed + i * 2.7) * DH(e), s: 0.6 + srand(e.seed + i * 3.1) * 0.9 });
    }
  },
  update: function(e, dt){
    var mul = 1;
    if (e.gust > 0) mul = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(e.at * TAU / e.gust));
    e.mul = mul;
    var p = RT.player;
    if (p && !p.dead && hitP(e.x, e.y, DW(e), DH(e), 4)){
      p.vx = num(p.vx, 0) + e.fx * mul * dt;
      p.vy = num(p.vy, 0) + e.fy * mul * dt;
      if (e.fy < 0) p.vy = Math.max(p.vy, -420);
    }
    /* drift the streak particles */
    var vx = e.fx * mul, vy = e.fy * mul, i, q;
    var L = Math.sqrt(vx * vx + vy * vy) || 1;
    for (i = 0; i < e.parts.length; i++){
      q = e.parts[i];
      q.x += (vx / L) * 90 * q.s * dt;
      q.y += (vy / L) * 90 * q.s * dt;
      if (q.x < -6) q.x += DW(e) + 12;
      if (q.x > DW(e) + 6) q.x -= DW(e) + 12;
      if (q.y < -6) q.y += DH(e) + 12;
      if (q.y > DH(e) + 6) q.y -= DH(e) + 12;
    }
  },
  draw: function(e, g){
    var w = DW(e), h = DH(e), i, q;
    var mul = num(e.mul, 1);
    var vx = e.fx, vy = e.fy;
    var L = Math.sqrt(vx * vx + vy * vy) || 1;
    var ux = vx / L, uy = vy / L;
    g.save();
    g.globalAlpha = 0.10 + 0.06 * mul;
    fillRR(g, e.x, e.y, w, h, 6, e.col);
    g.restore();
    g.save();
    g.globalAlpha = 0.34;
    g.strokeStyle = e.col;
    g.lineCap = 'round';
    for (i = 0; i < e.parts.length; i++){
      q = e.parts[i];
      var len = 9 + q.s * 13 * mul;
      g.lineWidth = 1 + q.s;
      g.beginPath();
      g.moveTo(e.x + q.x, e.y + q.y);
      g.lineTo(e.x + q.x + ux * len, e.y + q.y + uy * len);
      g.stroke();
    }
    g.restore();
    /* border arrows */
    g.save();
    g.globalAlpha = 0.30;
    g.strokeStyle = e.col; g.lineWidth = 2;
    if (isFn(g.setLineDash)) g.setLineDash([7, 6]);
    strokeRR(g, e.x + 1, e.y + 1, w - 2, h - 2, 6, e.col, 2);
    if (isFn(g.setLineDash)) g.setLineDash([]);
    g.restore();
    var ax = e.x + w / 2, ay = e.y + h / 2;
    g.save();
    g.globalAlpha = 0.45 + 0.2 * Math.sin(e.at * 5);
    g.translate(ax, ay);
    g.rotate(Math.atan2(uy, ux));
    g.strokeStyle = e.col; g.lineWidth = 2.6; g.lineCap = 'round';
    for (i = 0; i < 2; i++){
      var ox = i * 9 - 5;
      g.beginPath();
      g.moveTo(ox - 5, -6); g.lineTo(ox + 3, 0); g.lineTo(ox - 5, 6);
      g.stroke();
    }
    g.restore();
  }
});

/* =========================================================================
 * 17. CONVEYOR - solid moving surface
 * ========================================================================= */
E('conveyor', {
  layer: 'main',
  solid: true,
  keep: ['scroll'],
  init: function(e, d){
    e.spdPx = spd(d.speed, 3);
    if (d.speed != null && typeof d.speed === 'number' && d.speed < 0) e.spdPx = -Math.abs(e.spdPx);
    if (d.h == null) e.h = T * 0.5;
    e.scroll = 0;
  },
  update: function(e, dt){
    e.vx = 0; e.vy = 0;
    e.scroll = (e.scroll + e.spdPx * dt) % 1000;
    var p = RT.player;
    if (!p || p.dead) return;
    if (!standingOn(e)) return;
    var dx = e.spdPx * dt;
    var nx = p.x + dx;
    if (!rectSolidAt(nx + 2, p.y + 3, pW() - 4, pH() - 6)) p.x = nx;
    if (Math.random() < 0.08){
      fxBurst(p.x + pW() / 2 - sgn(dx) * 6, e.y + 1, ['#d9e3ef'], 1, 30, { life: 0.3, gravity: 180, size: 2 });
    }
  },
  draw: function(e, g){
    var w = DW(e), h = DH(e), x = e.x, y = e.y, i;
    var dir = sgn(e.spdPx) || 1;
    /* frame */
    fillRR(g, x, y, w, h, Math.min(h / 2, 7), vgrad(g, 0, y, y + h, [[0, '#58616f'], [1, '#2f353f']]));
    /* rollers at the ends */
    var rr = h * 0.36;
    for (i = 0; i < 2; i++){
      var rx = i ? x + w - h * 0.5 : x + h * 0.5;
      fillCircle(g, rx, y + h / 2, rr, '#8d97a6');
      g.save();
      g.translate(rx, y + h / 2);
      g.rotate(e.scroll / rr * dir);
      g.strokeStyle = 'rgba(30,36,46,0.6)'; g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(-rr * 0.7, 0); g.lineTo(rr * 0.7, 0); g.stroke();
      g.beginPath(); g.moveTo(0, -rr * 0.7); g.lineTo(0, rr * 0.7); g.stroke();
      g.restore();
      fillCircle(g, rx, y + h / 2, rr * 0.22, '#3b424e');
    }
    /* belt surface with moving chevrons */
    g.save();
    rrPath(g, x + 1, y + 1, w - 2, h * 0.52, 3);
    g.clip();
    g.fillStyle = vgrad(g, 0, y, y + h * 0.55, [[0, '#454d5a'], [1, '#2b313b']]);
    g.fillRect(x, y, w, h * 0.6);
    g.strokeStyle = 'rgba(255,214,120,0.75)';
    g.lineWidth = 2.4;
    var spacing = 14;
    var off = ((e.scroll % spacing) + spacing) % spacing;
    for (i = -1; i < w / spacing + 1; i++){
      var cxp = x + i * spacing + (dir > 0 ? off : (spacing - off));
      g.beginPath();
      g.moveTo(cxp - 4 * dir, y + 2);
      g.lineTo(cxp + 3 * dir, y + h * 0.26);
      g.lineTo(cxp - 4 * dir, y + h * 0.5);
      g.stroke();
    }
    g.restore();
    /* top edge highlight */
    g.fillStyle = 'rgba(255,255,255,0.22)';
    g.fillRect(x + 2, y + 1, w - 4, 1.5);
    strokeRR(g, x + 0.5, y + 0.5, w - 1, h - 1, Math.min(h / 2, 7), 'rgba(8,12,18,0.6)', 1.3);
  }
});

/* =========================================================================
 * 18. TRAPSPIKE - hidden spikes that pop out  (troll toolkit)
 * -------------------------------------------------------------------------
 * The tell is deliberately quiet: four vent holes in the plate and a slow
 * 3 s glint. Look closely and you can read it; run blind and you cannot.
 * ========================================================================= */
E('trapspike', {
  layer: 'main',
  solid: false,
  keep: ['ext', 'timer'],
  init: function(e, d){
    e.dirn = dirName(d.dir, 'up');
    e.trigger = str(d.trigger, 'near');
    e.delay = num(d.delay, 0.25);
    e.nearR = tpx(d.near, 1.4);
    e.retract = num(d.retract, 0);
    e.ext = 0;
    e.timer = 0;
    e.state = 'hidden';
    e.col = str(d.color, '#d7dde6');
  },
  update: function(e, dt){
    var w = DW(e), h = DH(e);
    if (e.state === 'hidden'){
      var fire = false;
      if (pAlive()){
        if (e.trigger === 'stand'){
          fire = hitP(e.x, e.y - 6, w, h + 6, 2) ||
                 (Math.abs(pCx() - (e.x + w / 2)) < w / 2 + pW() / 2 &&
                  Math.abs((RT.player.y + pH()) - e.y) < 10);
        } else {
          var dx = pCx() - (e.x + w / 2), dy = pCy() - (e.y + h / 2);
          fire = (dx * dx + dy * dy) < e.nearR * e.nearR;
        }
      }
      if (fire){
        e.state = 'arm';
        e.timer = e.delay;
        sfx('tick');
        fxBurst(e.x + w / 2, e.y + h / 2, ['#cbd3de'], 3, 30, { life: 0.3, gravity: 140, size: 2 });
      }
      return;
    }
    if (e.state === 'arm'){
      e.timer -= dt;
      if (e.timer <= 0){
        e.state = 'out';
        e.timer = 0;
        sfx('spike');
        shakeCam(3, 0.12);
        var v = dirVec(e.dirn);
        fxBurst(e.x + w / 2 + v.x * w * 0.4, e.y + h / 2 + v.y * h * 0.4,
          ['#ffffff', '#cbd3de', '#8f98a4'], 12, 200, { life: 0.4, gravity: 420 });
      }
      return;
    }
    if (e.state === 'out'){
      e.ext = Math.min(1, e.ext + dt / 0.07);
      if (e.ext > 0.3){
        var r = spikeRect(e);
        if (hitP(r.x, r.y, r.w, r.h, 2)) hurt('spike');
      }
      if (e.retract > 0){
        e.timer += dt;
        if (e.timer > e.retract){ e.state = 'back'; e.timer = 0; }
      }
      return;
    }
    if (e.state === 'back'){
      e.ext = Math.max(0, e.ext - dt / 0.18);
      if (e.ext <= 0){ e.state = 'hidden'; sfx('tick'); }
    }
  },
  onReset: function(e){ e.state = 'hidden'; e.ext = 0; e.timer = 0; },
  draw: function(e, g){
    var w = DW(e), h = DH(e), x = e.x, y = e.y, i;
    var v = dirVec(e.dirn);
    /* anchor plate sits on the far side from the pointing direction */
    var plate = 6;
    var px1 = x, py1 = y, pw = w, ph = h;
    if (e.dirn === 'up'){ py1 = y + h - plate; ph = plate; }
    else if (e.dirn === 'down'){ ph = plate; }
    else if (e.dirn === 'left'){ px1 = x + w - plate; pw = plate; }
    else { pw = plate; }
    /* spikes (drawn behind the plate) */
    if (e.ext > 0.001){
      var n = Math.max(2, Math.round((e.dirn === 'up' || e.dirn === 'down' ? w : h) / 10));
      var len = ((e.dirn === 'up' || e.dirn === 'down') ? h : w) - plate + 2;
      var reach = len * e.ext;
      g.save();
      g.translate(x + w / 2, y + h / 2);
      if (e.dirn === 'down') g.rotate(Math.PI);
      else if (e.dirn === 'left') g.rotate(Math.PI / 2);
      else if (e.dirn === 'right') g.rotate(-Math.PI / 2);
      var span = (e.dirn === 'up' || e.dirn === 'down') ? w : h;
      var baseY = ((e.dirn === 'up' || e.dirn === 'down') ? h : w) / 2 - plate;
      g.beginPath();
      for (i = 0; i < n; i++){
        var x0 = -span / 2 + (span / n) * i;
        var x1 = x0 + (span / n) * 0.5;
        var x2 = x0 + (span / n);
        g.moveTo(x0 + 0.5, baseY);
        g.lineTo(x1, baseY - reach);
        g.lineTo(x2 - 0.5, baseY);
        g.closePath();
      }
      g.fillStyle = vgrad(g, 0, baseY - reach, baseY, [[0, '#ffffff'], [0.45, e.col], [1, '#7f8894']]);
      g.fill();
      g.strokeStyle = 'rgba(20,26,36,0.55)'; g.lineWidth = 1; g.stroke();
      /* gleam on the tips */
      g.save();
      g.globalAlpha = 0.6 + 0.4 * Math.sin(e.at * 8);
      g.fillStyle = '#ffffff';
      for (i = 0; i < n; i++){
        var gx = -span / 2 + (span / n) * (i + 0.5);
        fillCircle(g, gx, baseY - reach + 1.5, 1.2, '#ffffff');
      }
      g.restore();
      g.restore();
    }
    /* plate with vent holes - the tell */
    fillRR(g, px1, py1, pw, ph, 2, vgrad(g, 0, py1, py1 + ph, [[0, '#6d7684'], [1, '#3d434e']]));
    strokeRR(g, px1 + 0.5, py1 + 0.5, pw - 1, ph - 1, 2, 'rgba(8,12,18,0.6)', 1);
    var holes = 4;
    for (i = 0; i < holes; i++){
      var hx, hy;
      if (e.dirn === 'up' || e.dirn === 'down'){
        hx = px1 + pw * ((i + 0.5) / holes);
        hy = py1 + ph * 0.5;
      } else {
        hx = px1 + pw * 0.5;
        hy = py1 + ph * ((i + 0.5) / holes);
      }
      fillCircle(g, hx, hy, 1.5, 'rgba(10,14,20,0.75)');
      if (e.state === 'hidden'){
        g.save();
        g.globalAlpha = 0.10 + 0.10 * Math.sin(e.at * 2.1 + i);
        fillCircle(g, hx, hy - 0.4, 1.1, '#ffffff');
        g.restore();
      }
    }
    /* arming rattle */
    if (e.state === 'arm'){
      g.save();
      g.globalAlpha = 0.5 + 0.4 * Math.sin(e.at * 50);
      g.strokeStyle = '#ffb347'; g.lineWidth = 1.6;
      strokeRR(g, px1 - 1, py1 - 1, pw + 2, ph + 2, 3, '#ffb347', 1.6);
      g.restore();
    }
  }
});
function spikeRect(e){
  var w = DW(e), h = DH(e), plate = 6;
  var len = ((e.dirn === 'up' || e.dirn === 'down') ? h : w) - plate + 2;
  var reach = len * e.ext;
  if (e.dirn === 'up') return { x: e.x + 6, y: e.y + h - plate - reach, w: w - 12, h: reach };
  if (e.dirn === 'down') return { x: e.x + 6, y: e.y + plate, w: w - 12, h: reach };
  if (e.dirn === 'left') return { x: e.x + w - plate - reach, y: e.y + 6, w: reach, h: h - 12 };
  return { x: e.x + plate, y: e.y + 6, w: reach, h: h - 12 };
}

/* =========================================================================
 * 19. FALLINGCEILING - drops when the player passes below (troll toolkit)
 * ========================================================================= */
E('fallingceiling', {
  layer: 'main',
  solid: true,
  keep: ['timer', 'mvy'],
  init: function(e, d){
    e.triggerW = tpx(d.triggerW, 3);
    e.homeY = e.y; e.homeX = e.x;
    e.timer = 0; e.mvy = 0;
    e.state = 'idle';
    e.pal = PAL[str(d.pal, 'stone')] || PAL.stone;
    e.chain = d.chain !== false;
  },
  update: function(e, dt){
    e.vx = 0; e.vy = 0;
    var w = DW(e), h = DH(e);
    if (e.state === 'idle'){
      /* the tell: an occasional trickle of dust from the underside */
      if (Math.random() < 0.012){
        fxBurst(e.x + rrange(3, w - 3), e.y + h, ['#cbd3de'], 1, 12, { life: 0.8, gravity: 260, size: 1.6 });
      }
      if (pAlive()){
        var dx = Math.abs(pCx() - (e.x + w / 2));
        if (dx < e.triggerW / 2 + pW() / 2 && RT.player.y > e.y + h - 4){
          e.state = 'shake'; e.timer = 0.25; sfx('tick');
        }
      }
      return;
    }
    if (e.state === 'shake'){
      e.timer -= dt;
      if (Math.random() < 0.6) fxBurst(e.x + rrange(2, w - 2), e.y + h, ['#cbd3de', '#9aa3ae'], 1, 25, { life: 0.5, gravity: 320, size: 2 });
      if (e.timer <= 0){ e.state = 'fall'; e.mvy = 120; }
      return;
    }
    if (e.state === 'fall'){
      e.mvy = Math.min(1400, e.mvy + 2600 * dt);
      var want = e.mvy * dt;
      var got = moveSolidY(e, want);
      if (hitP(e.x - 1, e.y, w + 2, h + 2, 2)) hurt('crush');
      if (Math.abs(got) < Math.abs(want) - 0.01 || e.y > levelH() + 96){
        e.state = 'landed';
        sfx('thwomp');
        shakeCam(10, 0.34);
        hitStop(4);
        fxBurst(e.x + 3, e.y + h, ['#e3e9f2', '#b6bfcb', '#8a929d'], 14, 240, { life: 0.7, gravity: 700, spread: Math.PI });
        fxBurst(e.x + w - 3, e.y + h, ['#e3e9f2', '#b6bfcb', '#8a929d'], 14, 240, { life: 0.7, gravity: 700, spread: Math.PI });
        fxEmit(e.x + w / 2, e.y + h, 'dust');
      }
      return;
    }
    if (e.state === 'landed'){
      if (hitP(e.x + 2, e.y + 2, w - 4, h - 4, 3) && num(RT.player.vy, 0) >= 0 && RT.player.y + pH() > e.y + 4) hurt('crush');
    }
  },
  onReset: function(e){
    e.x = e.homeX; e.y = e.homeY;
    e.state = 'idle'; e.timer = 0; e.mvy = 0;
    setSolid(e, true);
  },
  draw: function(e, g){
    var w = DW(e), h = DH(e), i;
    var sx = (e.state === 'shake') ? Math.sin(e.at * 72) * 2.4 : 0;
    /* chains while it still hangs */
    if (e.chain && (e.state === 'idle' || e.state === 'shake')){
      g.save();
      g.globalAlpha = 0.75;
      g.strokeStyle = '#6d7684'; g.lineWidth = 2;
      for (i = 0; i < 2; i++){
        var cx = e.x + (i ? w - 7 : 7) + sx;
        g.beginPath();
        g.moveTo(cx, e.y - 22);
        g.lineTo(cx, e.y + 1);
        g.stroke();
        for (var k = 0; k < 3; k++){
          circle(g, cx, e.y - 4 - k * 6, 2.4);
          g.stroke();
        }
      }
      g.restore();
    }
    g.translate(sx, 0);
    blockBody(g, e.x, e.y, w, h, e.pal, e.seed, 3);
    /* hairline cracks */
    g.save();
    g.globalAlpha = 0.5;
    g.strokeStyle = 'rgba(20,24,32,0.7)'; g.lineWidth = 1;
    for (i = 0; i < 3; i++){
      var x0 = e.x + 5 + srand(e.seed + i * 4.2) * (w - 10);
      g.beginPath();
      g.moveTo(x0, e.y + 3);
      g.lineTo(x0 + (srand(e.seed + i) - 0.5) * 12, e.y + h * 0.5);
      g.lineTo(x0 + (srand(e.seed + i * 2.5) - 0.5) * 18, e.y + h - 3);
      g.stroke();
    }
    g.restore();
    /* heavy studded underside */
    g.fillStyle = 'rgba(0,0,0,0.30)';
    g.fillRect(e.x + 2, e.y + h - 5, w - 4, 4);
    for (i = 0; i < Math.max(2, Math.floor(w / 16)); i++){
      rivet(g, e.x + 8 + i * 16, e.y + h - 3, 2);
    }
    if (e.state === 'shake'){
      g.save();
      g.globalAlpha = 0.3 + 0.35 * Math.sin(e.at * 40);
      strokeRR(g, e.x + 1, e.y + 1, w - 2, h - 2, 3, '#ff8a5c', 2.2);
      g.restore();
    }
  }
});

/* =========================================================================
 * 20. FAKEGOAL - looks like G, trolls the player back 6 tiles
 * -------------------------------------------------------------------------
 * The tell: the light beam pulses slightly out of step and the frame is a
 * touch colder than a real goal. You are meant to notice one run too late.
 * ========================================================================= */
function safeSpot(x, y){
  var i, ty;
  for (i = 0; i < 40; i++){
    ty = y - 3 * T + i * 6;
    if (ty > levelH()) break;
    if (!rectSolidAt(x, ty, pW(), pH()) && rectSolidAt(x, ty + 7, pW(), pH())) return { x: x, y: ty };
  }
  for (i = 0; i < 40; i++){
    ty = y - 3 * T + i * 6;
    if (ty > levelH()) break;
    if (!rectSolidAt(x, ty, pW(), pH())) return { x: x, y: ty };
  }
  return { x: x, y: y };
}

E('fakegoal', {
  layer: 'main',
  solid: false,
  keep: ['timer', 'grin'],
  init: function(e, d){
    if (d.w == null) e.w = T * 1.5;
    if (d.h == null) e.h = T * 2;
    e.timer = 0;
    e.grin = 0;
    e.back = tpx(d.back, 6);
    e.state = 'idle';
  },
  update: function(e, dt){
    var w = DW(e), h = DH(e);
    if (e.state === 'troll'){
      e.timer -= dt;
      e.grin = clamp(e.grin + dt * 4, 0, 1);
      if (e.timer <= 0){ e.state = 'idle'; }
      return;
    }
    if (e.grin > 0) e.grin = Math.max(0, e.grin - dt * 1.5);
    if (!pAlive()) return;
    if (!hitP(e.x + 4, e.y + 2, w - 8, h - 4, 3)) return;
    /* the punchline */
    var p = RT.player;
    e.state = 'troll';
    e.timer = 1.4;
    e.grin = 0.3;
    sfx('fake');
    sfx('troll');
    flashScreen('rgba(255,255,255,0.55)', 0.18);
    shakeCam(7, 0.4);
    slowMo(0.35, 0.25);
    fxBurst(e.x + w / 2, e.y + h / 2, ['#ffffff', '#ffd54f', '#ff5252'], 30, 260, { life: 0.7, gravity: 300 });
    toastMsg('NOT THE EXIT', 1.6);
    speechMsg(e.x + w / 2, e.y - 10, 'HA.', 1.2);
    var spot = safeSpot(clamp(p.x - e.back, 8, levelW() - pW() - 8), p.y);
    p.x = spot.x; p.y = spot.y;
    p.vx = 0; p.vy = 0;
    fxBurst(p.x + pW() / 2, p.y + pH() / 2, ['#ffffff', '#b39ddb'], 18, 180, { life: 0.5, gravity: 120 });
    emitEvt('fakegoal', e);
  },
  onReset: function(e){ e.state = 'idle'; e.timer = 0; e.grin = 0; },
  draw: function(e, g){
    var w = DW(e), h = DH(e), x = e.x, y = e.y, i;
    var beat = Math.sin(e.at * 2.35);   /* honest goals breathe at 2.0 */
    /* light beam */
    g.save();
    g.globalAlpha = 0.20 + 0.10 * beat;
    g.fillStyle = vgrad(g, 0, y - h * 1.6, y + h, [[0, 'rgba(255,240,170,0)'], [1, 'rgba(255,240,170,0.75)']]);
    poly(g, [x + w * 0.5 - w * 0.75, y - h * 1.5, x + w * 0.5 + w * 0.75, y - h * 1.5, x + w - 2, y + h, x + 2, y + h]);
    g.fill();
    g.restore();
    /* stone arch frame - a shade colder than the real one */
    fillRR(g, x - 3, y - 5, w + 6, h + 6, 5, '#5b6270');
    fillRR(g, x - 1, y - 3, w + 2, h + 3, 4, '#454c58');
    /* door leaf */
    var dx = e.state === 'troll' ? Math.sin(e.at * 40) * 2 : 0;
    g.save();
    g.translate(dx, 0);
    blockBody(g, x + 2, y, w - 4, h - 1, PAL.wood, e.seed, 4);
    g.strokeStyle = 'rgba(40,22,10,0.4)'; g.lineWidth = 1;
    for (i = 1; i < 3; i++){
      g.beginPath();
      g.moveTo(x + 2 + (w - 4) / 3 * i, y + 3);
      g.lineTo(x + 2 + (w - 4) / 3 * i, y + h - 4);
      g.stroke();
    }
    /* handle */
    fillCircle(g, x + w - 10, y + h * 0.55, 3, '#e0c070');
    /* EXIT sign */
    drawLabel(g, 'EXIT', x + w / 2, y + h * 0.22, {
      size: 9, color: '#fff3c4', outline: 'rgba(60,30,0,0.7)', outlineWidth: 3
    });
    g.restore();
    /* the grin, only while trolling (and a 0.15 s ghost every 4 s) */
    var ghost = (e.at % 4 < 0.15) ? 0.16 : 0;
    var grin = Math.max(e.grin, ghost);
    if (grin > 0.01){
      g.save();
      g.globalAlpha = grin;
      var cx = x + w / 2, cy = y + h * 0.55;
      g.strokeStyle = '#1a0d0d'; g.lineWidth = 2.4; g.lineCap = 'round';
      g.beginPath();
      g.moveTo(cx - w * 0.26, cy);
      g.quadraticCurveTo(cx, cy + h * 0.24, cx + w * 0.26, cy);
      g.stroke();
      for (i = 0; i < 4; i++){
        var tx = cx - w * 0.19 + (w * 0.38 / 3) * i;
        g.fillStyle = '#fffdf6';
        poly(g, [tx - 2, cy + 2, tx + 2, cy + 2, tx, cy + 7]);
        g.fill();
      }
      /* eyes */
      fillCircle(g, cx - w * 0.2, cy - h * 0.18, 3.2, '#ff5252');
      fillCircle(g, cx + w * 0.2, cy - h * 0.18, 3.2, '#ff5252');
      g.restore();
    }
  }
});

/* =========================================================================
 * 21. SIGN - speech bubble within 2 tiles
 * ========================================================================= */
E('sign', {
  layer: 'front',
  solid: false,
  keep: ['show'],
  init: function(e, d){
    e.text = str(d.text, '...');
    e.show = 0;
    e.bubbleW = tpx(d.w, 0);
    e.range = tpx(d.range, 2);
  },
  update: function(e, dt){
    var near = false;
    if (pAlive()){
      var dx = pCx() - (e.x + DW(e) / 2), dy = pCy() - (e.y + DH(e) / 2);
      near = Math.sqrt(dx * dx + dy * dy) < e.range + 16;
    }
    var want = near ? 1 : 0;
    e.show += (want - e.show) * Math.min(1, dt * 9);
    if (e.show < 0.002) e.show = 0;
  },
  draw: function(e, g){
    var w = DW(e), h = DH(e), x = e.x, y = e.y, i;
    /* the post fades if the player is behind it */
    var over = hitP(x, y, w, h, 2);
    g.save();
    g.globalAlpha = over ? 0.55 : 1;
    /* post */
    fillRR(g, x + w / 2 - 3, y + h * 0.35, 6, h * 0.65, 2, '#7a5533');
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(x + w / 2 + 1, y + h * 0.35, 2, h * 0.65);
    /* board */
    var bw = w * 0.92, bh = h * 0.46, bx = x + (w - bw) / 2, by = y + h * 0.04;
    blockBody(g, bx, by, bw, bh, PAL.wood, e.seed, 3);
    g.strokeStyle = 'rgba(40,22,10,0.35)'; g.lineWidth = 1;
    for (i = 1; i < 3; i++){
      g.beginPath(); g.moveTo(bx + 2, by + bh * (i / 3)); g.lineTo(bx + bw - 2, by + bh * (i / 3)); g.stroke();
    }
    rivet(g, bx + 4, by + 4, 1.8);
    rivet(g, bx + bw - 4, by + 4, 1.8);
    rivet(g, bx + 4, by + bh - 4, 1.8);
    rivet(g, bx + bw - 4, by + bh - 4, 1.8);
    /* "!" glyph */
    drawLabel(g, '!', bx + bw / 2, by + bh / 2 + 0.5, {
      size: Math.min(15, bh * 0.7), color: '#ffe6ae', outline: 'rgba(50,26,8,0.8)', outlineWidth: 3
    });
    g.restore();
    if (e.show <= 0.01) return;
    /* speech bubble */
    var size = 11;
    var maxW = e.bubbleW > 0 ? e.bubbleW : clamp(measureW(g, e.text, size) + 4, 70, 190);
    var lines = wrapText(g, e.text, size, maxW);
    var lh = size * 1.28;
    var bw2 = maxW + 16, bh2 = lines.length * lh + 14;
    var bx2 = x + w / 2 - bw2 / 2;
    var by2 = y - bh2 - 12 - e.show * 4;
    g.save();
    g.globalAlpha = clamp(e.show, 0, 1);
    g.translate(x + w / 2, by2 + bh2);
    g.scale(lerp(0.85, 1, e.show), lerp(0.7, 1, e.show));
    g.translate(-(x + w / 2), -(by2 + bh2));
    fillRR(g, bx2 + 2, by2 + 3, bw2, bh2, 8, 'rgba(0,0,0,0.25)');
    fillRR(g, bx2, by2, bw2, bh2, 8, '#fffbf0');
    strokeRR(g, bx2 + 0.5, by2 + 0.5, bw2 - 1, bh2 - 1, 8, '#3a2b1c', 2);
    poly(g, [x + w / 2 - 7, by2 + bh2 - 1, x + w / 2 + 7, by2 + bh2 - 1, x + w / 2, by2 + bh2 + 10]);
    g.fillStyle = '#fffbf0'; g.fill();
    g.strokeStyle = '#3a2b1c'; g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x + w / 2 - 7, by2 + bh2 - 0.5);
    g.lineTo(x + w / 2, by2 + bh2 + 10);
    g.lineTo(x + w / 2 + 7, by2 + bh2 - 0.5);
    g.stroke();
    for (i = 0; i < lines.length; i++){
      drawLabel(g, lines[i], x + w / 2, by2 + 9 + lh * (i + 0.5), {
        size: size, color: '#2b2118', align: 'center'
      });
    }
    g.restore();
  }
});

/* =========================================================================
 * 22. TEXT - world-space decorative text
 * ========================================================================= */
E('text', {
  layer: 'back',
  solid: false,
  init: function(e, d){
    e.text = str(d.text, '');
    var s = num(d.size, 0.75);
    e.size = (s < 8) ? s * T : s;
    e.col = str(d.color, '#ffffff');
    e.outline = (d.outline === false) ? null : str(d.outline, 'rgba(0,0,0,0.55)');
    e.wave = num(d.wave, 0);
    e.align = str(d.align, 'center');
    e.alpha = num(d.alpha, 1);
    e.rot = num(d.rot, 0) * Math.PI / 180;
    e.shadow = d.shadow !== false;
  },
  update: function(){ },
  draw: function(e, g){
    if (!e.text) return;
    var w = DW(e), h = DH(e);
    var x = e.x + (e.align === 'left' ? 0 : (e.align === 'right' ? w : w / 2));
    var y = e.y + h / 2;
    g.globalAlpha = clamp(e.alpha, 0, 1);
    g.translate(x, y);
    if (e.rot) g.rotate(e.rot);
    if (e.wave > 0){
      /* per-character wave, still one measured line */
      var chars = e.text.split('');
      var total = measureW(g, e.text, e.size);
      var cx = (e.align === 'left') ? 0 : (e.align === 'right' ? -total : -total / 2);
      for (var i = 0; i < chars.length; i++){
        var cw = measureW(g, chars[i], e.size);
        var off = Math.sin(e.at * 3 + i * 0.5) * e.wave;
        if (e.shadow) drawLabel(g, chars[i], cx + cw / 2 + 1.5, off + 2, { size: e.size, color: 'rgba(0,0,0,0.30)' });
        drawLabel(g, chars[i], cx + cw / 2, off, { size: e.size, color: e.col, outline: e.outline });
        cx += cw;
      }
    } else {
      if (e.shadow) drawLabel(g, e.text, 1.5, 2, { size: e.size, color: 'rgba(0,0,0,0.30)', align: e.align });
      drawLabel(g, e.text, 0, 0, { size: e.size, color: e.col, outline: e.outline, align: e.align });
    }
  }
});

/* =========================================================================
 * 23. DECO - tree bush rock torch skull crystal pipe flag grave cloud
 *            girder lamp                       (all 12, all hand-drawn)
 * ========================================================================= */
var DECO = {
  tree: function(g, e, w, h){
    var sway = Math.sin(e.at * 0.9 + e.seed) * 2.2;
    var tw = w * 0.16, tx = w / 2 - tw / 2;
    /* trunk */
    g.beginPath();
    g.moveTo(tx - 2, h);
    g.quadraticCurveTo(tx + tw * 0.2, h * 0.6, tx + sway * 0.4, h * 0.32);
    g.lineTo(tx + tw + sway * 0.4, h * 0.32);
    g.quadraticCurveTo(tx + tw * 0.9, h * 0.6, tx + tw + 2, h);
    g.closePath();
    g.fillStyle = vgrad(g, 0, h * 0.3, h, [[0, '#8a6034'], [1, '#54381d']]);
    g.fill();
    g.strokeStyle = 'rgba(30,18,8,0.5)'; g.lineWidth = 1; g.stroke();
    /* bark lines */
    g.strokeStyle = 'rgba(40,24,10,0.35)'; g.lineWidth = 1;
    for (var i = 0; i < 3; i++){
      g.beginPath();
      g.moveTo(tx + 1 + i * (tw / 3), h - 4);
      g.lineTo(tx + 2 + i * (tw / 3) + sway * 0.3, h * 0.42);
      g.stroke();
    }
    /* canopy */
    var cy = h * 0.30, cx = w / 2 + sway;
    var blobs = [[0, 0, w * 0.34], [-w * 0.24, h * 0.08, w * 0.26], [w * 0.24, h * 0.07, w * 0.27], [0, -h * 0.14, w * 0.25]];
    for (i = 0; i < blobs.length; i++){
      var b = blobs[i];
      fillCircle(g, cx + b[0], cy + b[1], b[2], i === 0 ? '#3f8f4a' : '#357c40');
    }
    for (i = 0; i < blobs.length; i++){
      var b2 = blobs[i];
      g.save();
      g.globalAlpha = 0.5;
      fillCircle(g, cx + b2[0] - b2[2] * 0.25, cy + b2[1] - b2[2] * 0.3, b2[2] * 0.42, '#5cb85f');
      g.restore();
    }
    g.save();
    g.globalAlpha = 0.25;
    fillCircle(g, cx + w * 0.12, cy + h * 0.14, w * 0.26, '#1d5a2b');
    g.restore();
  },
  bush: function(g, e, w, h){
    var sway = Math.sin(e.at * 1.3 + e.seed) * 1.2;
    var base = h * 0.98;
    var blobs = [[-w * 0.24, 0, w * 0.26], [w * 0.24, 0.02, w * 0.25], [0, -h * 0.16, w * 0.30]];
    var i;
    for (i = 0; i < blobs.length; i++){
      fillCircle(g, w / 2 + blobs[i][0] + sway * (i === 2 ? 1 : 0.4), base - h * 0.28 + blobs[i][1] * h, blobs[i][2], '#3a7f43');
    }
    for (i = 0; i < blobs.length; i++){
      g.save(); g.globalAlpha = 0.55;
      fillCircle(g, w / 2 + blobs[i][0] - 3 + sway * 0.4, base - h * 0.36 + blobs[i][1] * h, blobs[i][2] * 0.5, '#59a95c');
      g.restore();
    }
    /* berries */
    for (i = 0; i < 3; i++){
      fillCircle(g, w / 2 + (srand(e.seed + i) - 0.5) * w * 0.6, base - h * 0.25 - srand(e.seed + i * 2) * h * 0.25, 1.8, '#e2574c');
    }
  },
  rock: function(g, e, w, h){
    var pts = [], i, n = 7;
    for (i = 0; i < n; i++){
      var a = -Math.PI + (i / (n - 1)) * Math.PI;
      var rr = (0.42 + srand(e.seed + i * 3.1) * 0.12);
      pts.push(w / 2 + Math.cos(a) * w * rr);
      pts.push(h * 0.98 + Math.sin(a) * h * rr * 1.25);
    }
    poly(g, pts);
    g.fillStyle = vgrad(g, 0, h * 0.3, h, [[0, '#9aa2ad'], [0.55, '#767e8a'], [1, '#4e5661']]);
    g.fill();
    g.strokeStyle = 'rgba(20,26,34,0.55)'; g.lineWidth = 1.3; g.stroke();
    /* light facet */
    g.save();
    g.globalAlpha = 0.35;
    poly(g, [w * 0.30, h * 0.62, w * 0.46, h * 0.38, w * 0.62, h * 0.60, w * 0.44, h * 0.72]);
    g.fillStyle = '#d3d9e1'; g.fill();
    g.restore();
    /* moss */
    g.save();
    g.globalAlpha = 0.6;
    g.fillStyle = '#4f8c4a';
    for (i = 0; i < 4; i++){
      ellipse(g, w * (0.30 + i * 0.14), h * (0.44 + srand(e.seed + i) * 0.08), w * 0.08, h * 0.04);
      g.fill();
    }
    g.restore();
  },
  torch: function(g, e, w, h){
    var cx = w / 2;
    /* bracket */
    fillRR(g, cx - 4, h * 0.42, 8, h * 0.5, 2, '#4a4a52');
    fillRR(g, cx - 7, h * 0.40, 14, 5, 2, '#5c5c66');
    rivet(g, cx - 4, h * 0.42 + 3, 1.6);
    rivet(g, cx + 4, h * 0.42 + 3, 1.6);
    /* handle wrap */
    g.strokeStyle = '#6d4a28'; g.lineWidth = 2;
    for (var i = 0; i < 3; i++){
      g.beginPath();
      g.moveTo(cx - 4, h * (0.55 + i * 0.1));
      g.lineTo(cx + 4, h * (0.58 + i * 0.1));
      g.stroke();
    }
    /* flame - three layers, each with its own flicker */
    var t = e.at;
    var fy = h * 0.40;
    var flick = Math.sin(t * 11 + e.seed) * 0.12 + Math.sin(t * 17.3) * 0.06;
    var layers = [
      { r: w * 0.30, hh: h * 0.46, c: 'rgba(255,120,40,0.85)' },
      { r: w * 0.21, hh: h * 0.34, c: 'rgba(255,190,70,0.92)' },
      { r: w * 0.11, hh: h * 0.20, c: 'rgba(255,248,214,0.95)' }
    ];
    for (i = 0; i < layers.length; i++){
      var L = layers[i];
      var sc = 1 + flick * (1 - i * 0.25);
      g.beginPath();
      g.moveTo(cx - L.r, fy);
      g.quadraticCurveTo(cx - L.r * 0.9, fy - L.hh * 0.55 * sc, cx + Math.sin(t * 7 + i) * 2, fy - L.hh * sc);
      g.quadraticCurveTo(cx + L.r * 0.9, fy - L.hh * 0.55 * sc, cx + L.r, fy);
      g.quadraticCurveTo(cx, fy + L.r * 0.35, cx - L.r, fy);
      g.closePath();
      g.fillStyle = L.c;
      g.fill();
    }
    /* light pool */
    g.save();
    g.globalAlpha = 0.22 + 0.05 * Math.sin(t * 9);
    fillCircle(g, cx, fy - h * 0.1, w * 0.95, rgrad(g, cx, fy - h * 0.1, 2, w, [[0, 'rgba(255,190,90,0.8)'], [1, 'rgba(255,150,40,0)']]));
    g.restore();
  },
  skull: function(g, e, w, h){
    var cx = w / 2, cy = h * 0.55;
    g.translate(cx, cy);
    g.rotate(Math.sin(e.at * 0.6 + e.seed) * 0.04 - 0.06);
    g.translate(-cx, -cy);
    /* cranium */
    ellipse(g, cx, cy - h * 0.06, w * 0.33, h * 0.30);
    g.fillStyle = vgrad(g, 0, cy - h * 0.34, cy + h * 0.2, [[0, '#f3efe2'], [1, '#c3bda9']]);
    g.fill();
    g.strokeStyle = 'rgba(60,52,38,0.5)'; g.lineWidth = 1.2; g.stroke();
    /* jaw */
    fillRR(g, cx - w * 0.18, cy + h * 0.16, w * 0.36, h * 0.16, 3, '#e6e0d0');
    g.strokeStyle = 'rgba(60,52,38,0.45)'; g.lineWidth = 1;
    strokeRR(g, cx - w * 0.18, cy + h * 0.16, w * 0.36, h * 0.16, 3, 'rgba(60,52,38,0.45)', 1);
    for (var i = 0; i < 4; i++){
      g.beginPath();
      g.moveTo(cx - w * 0.135 + i * w * 0.09, cy + h * 0.16);
      g.lineTo(cx - w * 0.135 + i * w * 0.09, cy + h * 0.32);
      g.stroke();
    }
    /* sockets */
    g.fillStyle = '#241f18';
    ellipse(g, cx - w * 0.13, cy - h * 0.05, w * 0.10, h * 0.10); g.fill();
    ellipse(g, cx + w * 0.13, cy - h * 0.05, w * 0.10, h * 0.10); g.fill();
    /* glint deep in the sockets */
    g.save();
    g.globalAlpha = 0.35 + 0.3 * Math.sin(e.at * 2 + e.seed);
    fillCircle(g, cx - w * 0.13, cy - h * 0.04, 1.6, '#ff8a5c');
    fillCircle(g, cx + w * 0.13, cy - h * 0.04, 1.6, '#ff8a5c');
    g.restore();
    /* nose + crack */
    g.fillStyle = '#241f18';
    poly(g, [cx, cy + h * 0.02, cx + w * 0.045, cy + h * 0.12, cx - w * 0.045, cy + h * 0.12]);
    g.fill();
    g.strokeStyle = 'rgba(80,70,52,0.6)'; g.lineWidth = 1;
    g.beginPath();
    g.moveTo(cx - w * 0.06, cy - h * 0.30);
    g.lineTo(cx - w * 0.02, cy - h * 0.18);
    g.lineTo(cx - w * 0.09, cy - h * 0.12);
    g.stroke();
  },
  crystal: function(g, e, w, h){
    var specs = [
      { x: 0.50, s: 1.00, c: '#7fe3ff', d: '#2b7fa8' },
      { x: 0.28, s: 0.62, c: '#9becff', d: '#347f9e' },
      { x: 0.72, s: 0.72, c: '#6fd8f5', d: '#2a6f92' }
    ];
    for (var i = 0; i < specs.length; i++){
      var s = specs[i];
      var bx = w * s.x, by = h * 0.98, ht = h * 0.82 * s.s, wd = w * 0.20 * s.s;
      poly(g, [bx, by, bx - wd, by - ht * 0.45, bx - wd * 0.55, by - ht, bx + wd * 0.55, by - ht, bx + wd, by - ht * 0.45]);
      g.fillStyle = vgrad(g, 0, by - ht, by, [[0, '#e8fbff'], [0.4, s.c], [1, s.d]]);
      g.fill();
      g.strokeStyle = 'rgba(12,44,60,0.55)'; g.lineWidth = 1.1; g.stroke();
      /* inner facet */
      g.save();
      g.globalAlpha = 0.5;
      poly(g, [bx, by - ht * 0.06, bx - wd * 0.35, by - ht * 0.5, bx, by - ht * 0.92, bx + wd * 0.1, by - ht * 0.5]);
      g.fillStyle = '#ffffff'; g.fill();
      g.restore();
      /* pulse glow */
      g.save();
      g.globalAlpha = 0.18 + 0.16 * Math.sin(e.at * 1.8 + i * 1.3 + e.seed);
      fillCircle(g, bx, by - ht * 0.5, wd * 2.4, rgrad(g, bx, by - ht * 0.5, 1, wd * 2.6, [[0, '#9fefff'], [1, 'rgba(0,0,0,0)']]));
      g.restore();
    }
    /* sparkles */
    for (i = 0; i < 3; i++){
      var tw = (e.at * 0.8 + i * 0.33) % 1;
      g.save();
      g.globalAlpha = Math.max(0, 1 - Math.abs(tw - 0.5) * 4);
      var sx = w * (0.2 + srand(e.seed + i) * 0.6), sy = h * (0.2 + srand(e.seed + i * 2) * 0.5);
      g.strokeStyle = '#ffffff'; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(sx - 3, sy); g.lineTo(sx + 3, sy);
      g.moveTo(sx, sy - 3); g.lineTo(sx, sy + 3); g.stroke();
      g.restore();
    }
  },
  pipe: function(g, e, w, h){
    var rimH = Math.min(14, h * 0.28), over = w * 0.08;
    /* body */
    g.fillStyle = hgrad(g, 0, w, 0, [[0, '#1f7a3a'], [0.25, '#49c463'], [0.55, '#2f9a49'], [1, '#175c2c']]);
    g.fillRect(w * 0.08, rimH, w * 0.84, h - rimH);
    g.strokeStyle = 'rgba(8,40,18,0.65)'; g.lineWidth = 1.4;
    g.strokeRect(w * 0.08, rimH, w * 0.84, h - rimH);
    /* rim */
    fillRR(g, -over, 0, w + over * 2, rimH, 3, hgrad(g, 0, w, 0, [[0, '#1f7a3a'], [0.25, '#55d470'], [0.6, '#2f9a49'], [1, '#175c2c']]));
    strokeRR(g, -over + 0.5, 0.5, w + over * 2 - 1, rimH - 1, 3, 'rgba(8,40,18,0.7)', 1.4);
    /* dark mouth */
    fillRR(g, w * 0.14, 2.5, w * 0.72, rimH * 0.42, 2, 'rgba(6,26,12,0.75)');
    /* highlight */
    g.save();
    g.globalAlpha = 0.35;
    g.fillStyle = '#c9ffd8';
    g.fillRect(w * 0.20, rimH + 2, 3, h - rimH - 4);
    g.fillRect(w * 0.20, 3, 3, rimH - 5);
    g.restore();
  },
  flag: function(g, e, w, h){
    var px1 = w * 0.22;
    /* pole */
    fillRR(g, px1 - 2, 0, 4, h, 2, '#b9c2cd');
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(px1, 0, 1.6, h);
    fillCircle(g, px1, -1, 3.4, '#ffd76a');
    /* cloth */
    var cw = w * 0.62, ch = h * 0.34;
    var t = e.at * 3.4 + e.seed;
    g.beginPath();
    g.moveTo(px1, 4);
    var i, steps = 8;
    for (i = 0; i <= steps; i++){
      var f = i / steps;
      g.lineTo(px1 + cw * f, 4 + Math.sin(t + f * 5) * 3.2 * f);
    }
    for (i = steps; i >= 0; i--){
      var f2 = i / steps;
      g.lineTo(px1 + cw * f2, 4 + ch + Math.sin(t + f2 * 5) * 3.2 * f2);
    }
    g.closePath();
    g.fillStyle = hgrad(g, px1, px1 + cw, 0, [[0, '#e8564c'], [1, '#b2322c']]);
    g.fill();
    g.strokeStyle = 'rgba(70,14,12,0.5)'; g.lineWidth = 1; g.stroke();
    g.save();
    g.globalAlpha = 0.3;
    g.fillStyle = '#ffd7d2';
    g.fillRect(px1 + 2, 6, cw * 0.18, ch - 4);
    g.restore();
  },
  grave: function(g, e, w, h){
    /* mound */
    g.beginPath();
    g.moveTo(w * 0.04, h);
    g.quadraticCurveTo(w * 0.5, h * 0.74, w * 0.96, h);
    g.closePath();
    g.fillStyle = '#5c4a33'; g.fill();
    /* stone */
    var sw = w * 0.56, sx = w / 2 - sw / 2, sy = h * 0.16, sh = h * 0.70;
    g.beginPath();
    g.moveTo(sx, sy + sh);
    g.lineTo(sx, sy + sw * 0.45);
    g.quadraticCurveTo(sx, sy, sx + sw / 2, sy);
    g.quadraticCurveTo(sx + sw, sy, sx + sw, sy + sw * 0.45);
    g.lineTo(sx + sw, sy + sh);
    g.closePath();
    g.fillStyle = vgrad(g, 0, sy, sy + sh, [[0, '#b7bfc9'], [0.6, '#8d95a1'], [1, '#626a76']]);
    g.fill();
    g.strokeStyle = 'rgba(20,26,34,0.55)'; g.lineWidth = 1.3; g.stroke();
    drawLabel(g, 'RIP', w / 2, sy + sh * 0.34, { size: Math.min(13, sw * 0.42), color: '#4a515c' });
    g.strokeStyle = 'rgba(60,66,76,0.5)'; g.lineWidth = 1;
    g.beginPath();
    g.moveTo(sx + sw * 0.2, sy + sh * 0.56); g.lineTo(sx + sw * 0.8, sy + sh * 0.56);
    g.moveTo(sx + sw * 0.25, sy + sh * 0.70); g.lineTo(sx + sw * 0.75, sy + sh * 0.70);
    g.stroke();
    /* grass tufts */
    g.strokeStyle = '#4f8c4a'; g.lineWidth = 1.6; g.lineCap = 'round';
    for (var i = 0; i < 5; i++){
      var gx = w * (0.1 + i * 0.2) + Math.sin(e.at + i) * 0.6;
      g.beginPath();
      g.moveTo(gx, h - 1);
      g.lineTo(gx + (i % 2 ? 3 : -3), h - 6 - srand(e.seed + i) * 3);
      g.stroke();
    }
  },
  cloud: function(g, e, w, h){
    var drift = Math.sin(e.at * 0.25 + e.seed) * w * 0.05;
    var cx = w / 2 + drift, cy = h * 0.55;
    var puffs = [[-0.28, 0.06, 0.26], [0, -0.06, 0.34], [0.26, 0.04, 0.28], [0.06, 0.14, 0.24]];
    g.save();
    g.globalAlpha = 0.92;
    for (var i = 0; i < puffs.length; i++){
      fillCircle(g, cx + w * puffs[i][0], cy + h * puffs[i][1], w * puffs[i][2],
        rgrad(g, cx + w * puffs[i][0], cy + h * puffs[i][1] - w * puffs[i][2] * 0.4, 1, w * puffs[i][2] * 1.3,
          [[0, 'rgba(255,255,255,0.98)'], [1, 'rgba(226,236,248,0.92)']]));
    }
    g.globalAlpha = 0.35;
    for (i = 0; i < 3; i++){
      fillCircle(g, cx + w * puffs[i][0], cy + h * (puffs[i][1] + 0.16), w * puffs[i][2] * 0.8, 'rgba(198,212,232,0.8)');
    }
    g.restore();
  },
  girder: function(g, e, w, h){
    var fl = Math.min(8, h * 0.22);
    var pal = PAL.rust;
    /* flanges */
    fillRR(g, 0, 0, w, fl, 2, vgrad(g, 0, 0, fl, [[0, pal.face], [1, pal.side]]));
    fillRR(g, 0, h - fl, w, fl, 2, vgrad(g, 0, h - fl, h, [[0, pal.side], [1, pal.dark]]));
    /* web */
    g.fillStyle = vgrad(g, 0, fl, h - fl, [[0, pal.side], [1, pal.dark]]);
    g.fillRect(w * 0.18, fl, w * 0.64, h - fl * 2);
    /* bolts */
    var n = Math.max(2, Math.floor(w / 22));
    for (var i = 0; i < n; i++){
      var bx = w * ((i + 0.5) / n);
      rivet(g, bx, fl * 0.5, 2.2);
      rivet(g, bx, h - fl * 0.5, 2.2);
    }
    /* rust streaks */
    g.save();
    g.globalAlpha = 0.25;
    g.fillStyle = '#7a3b1c';
    for (i = 0; i < 4; i++){
      var rx = w * srand(e.seed + i * 2.2);
      g.fillRect(rx, fl, 2 + srand(e.seed + i) * 3, h - fl * 2);
    }
    g.restore();
    strokeRR(g, 0.5, 0.5, w - 1, h - 1, 2, pal.line, 1.2);
  },
  lamp: function(g, e, w, h){
    var px1 = w * 0.5;
    /* base */
    fillRR(g, px1 - 7, h - 6, 14, 6, 2, '#3b4149');
    /* post */
    fillRR(g, px1 - 2.5, h * 0.12, 5, h - 16, 2, vgrad(g, 0, 0, h, [[0, '#6c7481'], [1, '#3b4149']]));
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.fillRect(px1 - 2, h * 0.12, 1.4, h - 18);
    /* arm */
    g.strokeStyle = '#59616d'; g.lineWidth = 4; g.lineCap = 'round';
    g.beginPath();
    g.moveTo(px1, h * 0.14);
    g.quadraticCurveTo(px1, h * 0.03, px1 + w * 0.22, h * 0.05);
    g.stroke();
    /* lantern */
    var lx = px1 + w * 0.22, ly = h * 0.08;
    fillRR(g, lx - 7, ly - 2, 14, 4, 2, '#4a515b');
    poly(g, [lx - 7, ly + 2, lx + 7, ly + 2, lx + 5, ly + 14, lx - 5, ly + 14]);
    g.fillStyle = 'rgba(255,224,150,0.9)'; g.fill();
    g.strokeStyle = '#3f464f'; g.lineWidth = 1.4; g.stroke();
    /* glow + cone */
    var pulse = 0.85 + 0.15 * Math.sin(e.at * 2.2 + e.seed);
    g.save();
    g.globalAlpha = 0.35 * pulse;
    fillCircle(g, lx, ly + 8, 16, rgrad(g, lx, ly + 8, 1, 17, [[0, 'rgba(255,224,150,0.95)'], [1, 'rgba(255,200,90,0)']]));
    g.globalAlpha = 0.14 * pulse;
    poly(g, [lx - 5, ly + 13, lx + 5, ly + 13, lx + w * 0.42, h, lx - w * 0.42, h]);
    g.fillStyle = 'rgba(255,224,150,0.8)'; g.fill();
    g.restore();
  }
};

E('deco', {
  layer: 'back',
  solid: false,
  init: function(e, d){
    e.kind = str(d.kind, 'rock');
    if (!DECO[e.kind]) e.kind = 'rock';
    e.scale = num(d.scale, 1);
    e.flip = !!d.flip;
    e.alpha = num(d.alpha, 1);
    e.tint = str(d.color, null);
    if (d.w == null && (e.kind === 'tree' || e.kind === 'cloud' || e.kind === 'lamp')) e.w = T * 2;
    if (d.h == null && (e.kind === 'tree' || e.kind === 'lamp')) e.h = T * 2.5;
    if (d.h == null && e.kind === 'cloud') e.h = T * 1.2;
    e.emits = (e.kind === 'torch');
  },
  update: function(e){
    if (e.emits && Math.random() < 0.10){
      fxEmit(e.x + DW(e) / 2, e.y + DH(e) * 0.35, 'embers');
      fxBurst(e.x + DW(e) / 2 + rrange(-3, 3), e.y + DH(e) * 0.32, ['#ffd27a', '#ff9a4a'], 1, 26,
        { life: 0.8, gravity: -70, size: 2 });
    }
  },
  draw: function(e, g){
    var w = DW(e), h = DH(e);
    g.globalAlpha = clamp(e.alpha, 0, 1);
    g.translate(e.x + w / 2, e.y + h);
    g.scale((e.flip ? -1 : 1) * e.scale, e.scale);
    g.translate(-w / 2, -h);
    if (e.tint) g.fillStyle = e.tint;
    DECO[e.kind](g, e, w, h);
  }
});

/* =========================================================================
 * 24. LAUNCHER - THE FLINGING MACHINE (level 7)
 * -------------------------------------------------------------------------
 * Touching it captures the player: entities.js writes RT.player.x/y every
 * fixed step, zeroes the velocity and eats the movement input, so the hold
 * is real whether or not the engine honours the advisory RT.player.held /
 * RT.player.frozen flags it also sets (see Amendments in CONTRACT.md).
 * ACTION or JUMP fires along the barrel; with rotate the barrel sweeps, so
 * the shot is a timing problem. While held it draws a dotted preview built
 * from the REAL player physics (1550 rising / 2200 falling, apex hang,
 * 900 terminal) - the preview never lies.
 *
 * angle: degrees, 0 = due right, 90 = straight up (maths convention).
 * ========================================================================= */
function launchDir(deg){
  var a = deg * Math.PI / 180;
  return { x: Math.cos(a), y: -Math.sin(a) };
}
/* integrate the contract's player physics; calls back per sample point */
function simArc(x, y, vx, vy, steps, cb){
  var dt = 1 / 60, i, gy, hitX = null;
  for (i = 0; i < steps; i++){
    gy = (vy < 0) ? G_RISE : G_FALL;
    if (vy < 0 && Math.abs(vy) < HANG_V) gy *= HANG_M;
    vy += gy * dt;
    if (vy > V_TERM) vy = V_TERM;
    x += vx * dt;
    y += vy * dt;
    if (x < 0 || x > levelW() || y > levelH() + 64) return { x: x, y: y, hit: true, i: i };
    if (solidPx(x, y)) return { x: x, y: y, hit: true, i: i };
    if (cb) cb(x, y, i, vx, vy);
  }
  return { x: x, y: y, hit: false, i: steps };
}

E('launcher', {
  layer: 'main',
  solid: false,
  keep: ['ang', 'rotDir', 'cool', 'holdT', 'flash', 'autoT', 'charge', 'post', 'wantFire'],
  init: function(e, d){
    if (d.w == null) e.w = T * 1.5;
    if (d.h == null) e.h = T * 1.5;
    e.baseAng = num(d.angle, 60);
    e.power = spd(d.power, 1000 / T);
    e.auto = !!d.auto;
    e.autoDelay = num(d.autoDelay, 0.85);
    var rot = d.rotate;
    e.rotSpeed = 0;
    e.minA = e.baseAng; e.maxA = e.baseAng;
    if (rot){
      if (typeof rot === 'number'){ e.rotSpeed = Math.abs(rot); }
      else if (rot === true){ e.rotSpeed = 55; }
      else if (rot.length >= 2){ e.rotSpeed = num(d.rotateSpeed, 55); e.minA = rot[0]; e.maxA = rot[1]; }
      var sweep = num(d.sweep, 40);
      if (e.minA === e.maxA){ e.minA = e.baseAng - sweep; e.maxA = e.baseAng + sweep; }
      if (d.minAngle != null) e.minA = num(d.minAngle, e.minA);
      if (d.maxAngle != null) e.maxA = num(d.maxAngle, e.maxA);
      if (e.minA > e.maxA){ var t = e.minA; e.minA = e.maxA; e.maxA = t; }
    }
    e.ang = clamp(e.baseAng, e.minA, e.maxA);
    e.rotDir = 1;
    e.cool = 0;
    e.holdT = 0;
    e.autoT = 0;
    e.flash = 0;
    e.charge = 0;
    e.post = 0;
    e.wantFire = false;
    e.lvx = 0; e.lvy = 0;
    e.col = str(d.color, '#ffb03a');
    e.state = 'idle';
    e.prevAct = true;
    e.prevJmp = true;
  },
  update: function(e, dt){
    var w = DW(e), h = DH(e);
    var cx = e.x + w / 2, cy = e.y + h / 2;
    if (e.flash > 0) e.flash = Math.max(0, e.flash - dt * 5);
    if (e.cool > 0) e.cool -= dt;
    /* --- the few frames after the shot belong to the launcher --------------
     * engine.js cuts a rising jump on release and can spend a buffered double
     * jump; either one would make the player land somewhere the dotted
     * preview never promised. Hold them off until the shot is clearly away. */
    if (e.post > 0){
      e.post--;
      var pp = RT.player;
      if (pp && !pp.dead){
        if (num(pp.vy, 0) < 0 && RT.input) RT.input.jumpReleased = false;
        if (pp.jumpsLeft != null){
          if (e.post > 6) pp.jumpsLeft = 0;
          else if (e.post === 6) pp.jumpsLeft = (pp.abilities && pp.abilities.doubleJump) ? 1 : 0;
        }
        if (e.post === 15 && !pp.onGround && num(pp.vy, 0) > e.lvy + 80) pp.vy = e.lvy + 30;
      }
    }
    /* barrel sweep - constant angular rate so timing is learnable */
    if (e.rotSpeed > 0 && e.maxA > e.minA){
      e.ang += e.rotDir * e.rotSpeed * dt;
      if (e.ang >= e.maxA){ e.ang = e.maxA; e.rotDir = -1; }
      else if (e.ang <= e.minA){ e.ang = e.minA; e.rotDir = 1; }
    }
    var p = RT.player;
    if (e.state === 'held'){
      if (!p || p.dead){ releaseLauncher(e); return; }
      e.holdT += dt;
      e.charge = Math.min(1, e.charge + dt * 4);
      /* THE HOLD: position is written every step, input is eaten */
      p.x = cx - pW() / 2;
      p.y = cy - pH() / 2;
      p.vx = 0; p.vy = 0;
      p.onGround = false;
      if (p.jumpsLeft != null) p.jumpsLeft = 0;
      p.held = e;
      p.frozen = true;
      var i2 = input();
      var act = !!i2.action, jmp = !!i2.jump;
      var press = (!!i2.actionPressed) || (!!i2.jumpPressed) || (act && !e.prevAct) || (jmp && !e.prevJmp);
      e.prevAct = act; e.prevJmp = jmp;
      if (e.auto){
        e.autoT -= dt;
        if (e.autoT <= 0) press = true;
      }
      /* a press inside the 0.12 s arming window is remembered, not eaten -
       * a single-frame tap must never disappear */
      if (press) e.wantFire = true;
      if (e.wantFire && e.holdT > 0.12) fireLauncher(e);
      return;
    }
    e.charge = Math.max(0, e.charge - dt * 3);
    if (!p || p.dead || e.cool > 0) return;
    if (Hold.e && Hold.e !== e) return;
    if (!hitP(e.x - 3, e.y - 3, w + 6, h + 6, 2)) return;
    /* capture */
    e.state = 'held';
    e.holdT = 0;
    e.wantFire = false;
    e.autoT = e.autoDelay;
    Hold.e = e;
    p.held = e;
    p.frozen = true;
    p.vx = 0; p.vy = 0;
    var i3 = input();
    e.prevAct = !!i3.action;
    e.prevJmp = !!i3.jump;
    sfx('charge');
    fxBurst(cx, cy, [e.col, '#ffffff'], 14, 130, { life: 0.4, gravity: 0 });
    hudSet('launcher', 'ACTION = FIRE');
  },
  onPlayerDeath: function(e){ if (e.state === 'held') releaseLauncher(e); },
  onReset: function(e){
    if (e.state === 'held') releaseLauncher(e);
    e.state = 'idle';
    e.ang = clamp(e.baseAng, e.minA, e.maxA);
    e.rotDir = 1;
    e.cool = 0; e.holdT = 0; e.flash = 0; e.charge = 0;
  },
  onRemove: function(e){ if (e.state === 'held') releaseLauncher(e); },
  draw: function(e, g){
    var w = DW(e), h = DH(e), cx = e.x + w / 2, cy = e.y + h / 2, i;
    var dir = launchDir(e.ang);
    var barrelLen = Math.max(w, h) * 0.72;
    var mx = cx + dir.x * barrelLen, my = cy + dir.y * barrelLen;

    /* ---- trajectory preview (only while it holds you) ----
     * it starts exactly where fireLauncher() will put the player, not at the
     * muzzle tip, so the dotted line is the flight and not an approximation */
    if (e.state === 'held'){
      var dots = [];
      var sx0 = cx + dir.x * (barrelLen * 0.55), sy0 = cy + dir.y * (barrelLen * 0.55);
      var res = simArc(sx0, sy0, dir.x * e.power, dir.y * e.power, 320, function(x, y, i2){
        if (i2 % 4 === 0) dots.push(x, y);
      });
      var phase = Math.floor(e.at * 22) % 3;
      g.save();
      for (i = 0; i < dots.length; i += 2){
        var idx = i / 2;
        var fade = clamp(1 - idx / (dots.length / 2 + 4), 0.12, 1);
        var lit = (idx % 3 === phase);
        g.globalAlpha = fade * (lit ? 0.95 : 0.42);
        fillCircle(g, dots[i], dots[i + 1], lit ? 2.9 : 2.0, lit ? '#ffffff' : e.col);
      }
      /* impact marker */
      if (res.hit){
        g.globalAlpha = 0.85;
        g.strokeStyle = '#ffffff';
        g.lineWidth = 2;
        var r = 6 + Math.sin(e.at * 8) * 1.2;
        circle(g, res.x, res.y, r); g.stroke();
        g.beginPath();
        g.moveTo(res.x - r * 0.7, res.y - r * 0.7); g.lineTo(res.x + r * 0.7, res.y + r * 0.7);
        g.moveTo(res.x + r * 0.7, res.y - r * 0.7); g.lineTo(res.x - r * 0.7, res.y + r * 0.7);
        g.stroke();
      }
      g.restore();
    }

    /* ---- sweep arc guide ---- */
    if (e.rotSpeed > 0 && e.maxA > e.minA){
      g.save();
      g.globalAlpha = 0.22;
      g.strokeStyle = e.col;
      g.lineWidth = 3;
      var r2 = barrelLen + 8;
      g.beginPath();
      g.arc(cx, cy, r2, -e.maxA * Math.PI / 180, -e.minA * Math.PI / 180);
      g.stroke();
      g.globalAlpha = 0.5;
      for (i = 0; i <= 4; i++){
        var a2 = lerp(e.minA, e.maxA, i / 4) * Math.PI / 180;
        fillCircle(g, cx + Math.cos(a2) * r2, cy - Math.sin(a2) * r2, 1.8, e.col);
      }
      g.restore();
    }

    /* ---- mount ---- */
    var baseR = Math.min(w, h) * 0.46;
    fillCircle(g, cx, cy + 2, baseR * 1.02, 'rgba(0,0,0,0.25)');
    fillRR(g, cx - baseR, cy + baseR * 0.25, baseR * 2, baseR * 0.8, 4,
      vgrad(g, 0, cy, cy + baseR, [[0, '#6f7a86'], [1, '#343b45']]));
    strokeRR(g, cx - baseR, cy + baseR * 0.25, baseR * 2, baseR * 0.8, 4, 'rgba(8,12,18,0.7)', 1.4);
    for (i = 0; i < 3; i++) rivet(g, cx - baseR * 0.6 + i * baseR * 0.6, cy + baseR * 0.85, 2.2);

    /* ---- barrel ---- */
    g.save();
    g.translate(cx, cy);
    g.rotate(-e.ang * Math.PI / 180);
    var bw = Math.min(w, h) * 0.56;
    var recoil = -e.flash * 5;
    /* body */
    fillRR(g, recoil - bw * 0.35, -bw / 2, barrelLen + bw * 0.2, bw, bw * 0.24,
      vgrad(g, 0, -bw / 2, bw / 2, [[0, '#c3cbd6'], [0.42, '#8b95a3'], [1, '#4c5563']]));
    strokeRR(g, recoil - bw * 0.35, -bw / 2, barrelLen + bw * 0.2, bw, bw * 0.24, 'rgba(8,12,18,0.75)', 1.5);
    /* warning stripes */
    g.save();
    rrPath(g, recoil - bw * 0.35, -bw / 2, barrelLen + bw * 0.2, bw, bw * 0.24);
    g.clip();
    g.globalAlpha = 0.75;
    for (i = 0; i < 6; i++){
      g.fillStyle = (i % 2) ? e.col : 'rgba(30,34,42,0.85)';
      poly(g, [recoil + i * 9 - 4, -bw / 2, recoil + i * 9 + 1, -bw / 2, recoil + i * 9 - 4, bw / 2, recoil + i * 9 - 9, bw / 2]);
      g.fill();
    }
    g.restore();
    /* muzzle ring */
    fillRR(g, recoil + barrelLen * 0.72, -bw * 0.66, bw * 0.34, bw * 1.32, 3, '#59626f');
    strokeRR(g, recoil + barrelLen * 0.72, -bw * 0.66, bw * 0.34, bw * 1.32, 3, 'rgba(8,12,18,0.75)', 1.3);
    fillCircle(g, recoil + barrelLen * 0.88, 0, bw * 0.30, '#11141a');
    /* charge glow in the bore */
    if (e.charge > 0.01){
      g.save();
      g.globalAlpha = clamp(e.charge, 0, 1) * (0.55 + 0.45 * Math.sin(e.at * 14));
      fillCircle(g, recoil + barrelLen * 0.88, 0, bw * (0.10 + 0.20 * e.charge), '#fff3c4');
      g.restore();
    }
    /* muzzle flash */
    if (e.flash > 0.02){
      g.save();
      g.globalAlpha = e.flash;
      var fl = bw * (0.9 + e.flash * 1.5);
      poly(g, [recoil + barrelLen * 0.9, -bw * 0.5, recoil + barrelLen * 0.9 + fl, 0, recoil + barrelLen * 0.9, bw * 0.5]);
      g.fillStyle = '#fff0c0'; g.fill();
      g.globalAlpha = e.flash * 0.6;
      fillCircle(g, recoil + barrelLen * 0.95, 0, fl * 0.5, '#ffb03a');
      g.restore();
    }
    g.restore();

    /* ---- pivot cap + power gauge ---- */
    fillCircle(g, cx, cy, Math.min(w, h) * 0.22, '#5b6472');
    fillCircle(g, cx - 1.5, cy - 1.8, Math.min(w, h) * 0.08, 'rgba(255,255,255,0.45)');
    if (e.state === 'held'){
      g.save();
      g.globalAlpha = 0.55 + 0.35 * Math.sin(e.at * 12);
      circle(g, cx, cy, Math.min(w, h) * 0.52);
      g.strokeStyle = e.col; g.lineWidth = 2.4; g.stroke();
      g.restore();
      /* auto timer ring */
      if (e.auto){
        var k = clamp(e.autoT / Math.max(0.01, e.autoDelay), 0, 1);
        g.save();
        g.strokeStyle = '#ff5c5c'; g.lineWidth = 3;
        g.beginPath();
        g.arc(cx, cy, Math.min(w, h) * 0.62, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - k));
        g.stroke();
        g.restore();
      }
      drawLabel(g, e.auto ? 'HOLD ON' : 'FIRE!', cx, e.y - 10, {
        size: 9, color: '#fff3c4', outline: 'rgba(0,0,0,0.6)', outlineWidth: 3
      });
    }
  }
});
function fireLauncher(e){
  var p = RT.player;
  var w = DW(e), h = DH(e);
  var cx = e.x + w / 2, cy = e.y + h / 2;
  var dir = launchDir(e.ang);
  var barrelLen = Math.max(w, h) * 0.72;
  releaseLauncher(e);
  if (p && !p.dead){
    p.x = cx + dir.x * (barrelLen * 0.55) - pW() / 2;
    p.y = cy + dir.y * (barrelLen * 0.55) - pH() / 2;
    p.vx = dir.x * e.power;
    p.vy = dir.y * e.power;
    p.onGround = false;
    p.rideEnt = null;
    if (p.jumpsLeft != null) p.jumpsLeft = 0;   /* restored by the post window */
    if (p.facing != null) p.facing = dir.x < 0 ? -1 : 1;
  }
  e.wantFire = false;
  e.lvx = dir.x * e.power;
  e.lvy = dir.y * e.power;
  e.post = 16;
  e.state = 'idle';
  e.cool = 0.5;
  e.flash = 1;
  e.charge = 0;
  sfx('launch');
  shakeCam(7, 0.25);
  hitStop(2);
  var mx = cx + dir.x * barrelLen, my = cy + dir.y * barrelLen;
  fxBurst(mx, my, ['#fff3c4', '#ffb03a', '#ff7a3d', '#ffffff'], 26, 320, { life: 0.5, gravity: 280 });
  fxBurst(mx, my, ['#ffffff'], 10, 90, { life: 0.35, gravity: -40, size: 4 });
  fxEmit(mx, my, 'dust');
  emitEvt('launch', e);
}
function releaseLauncher(e){
  var p = RT.player;
  if (p && p.held === e){ p.held = null; p.frozen = false; }
  if (Hold.e === e) Hold.e = null;
  e.state = 'idle';
  e.wantFire = false;
  hudClear('launcher');
}

/* =========================================================================
 * 25. COIN - level score and tycoon cash, at fractional coords
 * ========================================================================= */
E('coin', {
  layer: 'main',
  solid: false,
  keep: ['got', 'pop'],
  init: function(e, d){
    e.value = Math.max(1, Math.round(num(d.value, 1)));
    e.got = false;
    e.pop = 0;
    e.homeY = e.y;
    if (d.w == null){ e.w = T * 0.75; e.x += T * 0.125; }
    if (d.h == null){ e.h = T * 0.75; e.y += T * 0.125; e.homeY = e.y; }
  },
  update: function(e, dt){
    if (e.got){
      if (e.pop > 0){ e.pop -= dt; e.y -= 46 * dt; }
      return;
    }
    e.y = e.homeY + Math.sin(e.at * 3 + e.seed) * 2.4;
    if (!hitP(e.x - 2, e.y - 2, DW(e) + 4, DH(e) + 4, 2)) return;
    e.got = true;
    e.pop = 0.55;
    e.persistent = true;
    RT.coins = num(RT.coins, 0) + e.value;
    if (RT.Tycoon && isFn(RT.Tycoon.add)){ try { RT.Tycoon.add(e.value); } catch (err) {} }
    sfx('coin');
    fxBurst(e.x + DW(e) / 2, e.y + DH(e) / 2, ['#ffe27a', '#ffffff', '#ffb43a'], 14, 170, { life: 0.45, gravity: 180 });
    emitEvt('coin', e.value, e);
  },
  onReset: function(e){
    if (e.got){ e.persistent = true; return; }
    e.y = e.homeY;
  },
  draw: function(e, g){
    var w = DW(e), h = DH(e), cx = e.x + w / 2, cy = e.y + h / 2;
    if (e.got){
      if (e.pop <= 0) return;
      g.globalAlpha = clamp(e.pop / 0.55, 0, 1);
      drawLabel(g, '+' + e.value, cx, cy, {
        size: 12, color: '#ffe27a', outline: 'rgba(60,36,0,0.75)', outlineWidth: 3
      });
      return;
    }
    var spin = Math.cos(e.at * 3.6 + e.seed);
    var rw = Math.max(1.5, Math.abs(spin) * w * 0.40);
    var rh = h * 0.42;
    /* glow */
    g.save();
    g.globalAlpha = 0.25;
    fillCircle(g, cx, cy, w * 0.55, rgrad(g, cx, cy, 1, w * 0.6, [[0, '#ffe27a'], [1, 'rgba(0,0,0,0)']]));
    g.restore();
    /* body */
    ellipse(g, cx, cy, rw, rh);
    g.fillStyle = (spin >= 0)
      ? vgrad(g, 0, cy - rh, cy + rh, [[0, '#fff0b0'], [0.45, '#f6c93c'], [1, '#c98b12']])
      : vgrad(g, 0, cy - rh, cy + rh, [[0, '#f2c23a'], [0.5, '#d9a52f'], [1, '#9c6f14']]);
    g.fill();
    g.strokeStyle = 'rgba(90,58,4,0.7)'; g.lineWidth = 1.3; g.stroke();
    /* face detail only when wide enough to read */
    if (rw > w * 0.20){
      g.save();
      g.globalAlpha = 0.85;
      ellipse(g, cx, cy, rw * 0.62, rh * 0.68);
      g.strokeStyle = 'rgba(255,248,200,0.75)'; g.lineWidth = 1.2; g.stroke();
      if (e.value > 1){
        drawLabel(g, String(e.value), cx, cy + 0.5, { size: Math.min(11, rw * 1.3), color: '#8a5c08' });
      } else {
        drawLabel(g, '$', cx, cy + 0.5, { size: Math.min(11, rw * 1.5), color: '#8a5c08' });
      }
      g.restore();
    }
    /* sparkle */
    var tw = (e.at * 1.6 + e.seed) % 1;
    if (tw < 0.22){
      g.save();
      g.globalAlpha = 1 - tw / 0.22;
      g.strokeStyle = '#fffbe6'; g.lineWidth = 1.4;
      var sx = cx + w * 0.22, sy = cy - h * 0.26;
      g.beginPath();
      g.moveTo(sx - 3.5, sy); g.lineTo(sx + 3.5, sy);
      g.moveTo(sx, sy - 3.5); g.lineTo(sx, sy + 3.5);
      g.stroke();
      g.restore();
    }
  }
});

/* =========================================================================
 * 26. CHECKPOINT - same as the C tile
 * ========================================================================= */
E('checkpoint', {
  layer: 'main',
  solid: false,
  keep: ['active', 'raise'],
  init: function(e, d){
    if (d.w == null) e.w = T;
    if (d.h == null) e.h = T * 2;
    e.active = false;
    e.raise = 0;
    e.col = str(d.color, '#4fd67f');
  },
  update: function(e, dt){
    if (e.active){
      e.raise = Math.min(1, e.raise + dt * 3);
      if (Math.random() < 0.06){
        fxBurst(e.x + DW(e) * 0.5 + rrange(-8, 8), e.y + rrange(2, DH(e) * 0.5),
          [e.col, '#ffffff'], 1, 26, { life: 0.7, gravity: -30, size: 2 });
      }
      return;
    }
    if (!pAlive()) return;
    if (!hitP(e.x - 6, e.y, DW(e) + 12, DH(e), 2)) return;
    /* only one flag flies at a time */
    var others = findAll('checkpoint'), i;
    for (i = 0; i < others.length; i++){
      if (others[i] !== e){ others[i].active = false; others[i].raise = 0; }
    }
    e.active = true;
    e.persistent = true;
    var px1 = e.x + DW(e) / 2 - pW() / 2;
    var py1 = e.y + DH(e) - pH();
    if (isFn(RT.setCheckpoint)){ try { RT.setCheckpoint(px1, py1); } catch (err) { logErr('setCheckpoint', err); } }
    sfx('checkpoint');
    flashScreen('rgba(120,255,170,0.20)', 0.14);
    shakeCam(3, 0.16);
    fxBurst(e.x + DW(e) / 2, e.y + DH(e) * 0.4, [e.col, '#ffffff', '#c9ffdd'], 28, 230, { life: 0.8, gravity: 120 });
    toastMsg('CHECKPOINT', 1.2);
    emitEvt('checkpoint', e);
  },
  onReset: function(e){ if (e.active) e.persistent = true; },
  draw: function(e, g){
    var w = DW(e), h = DH(e), x = e.x, y = e.y, i;
    var px1 = x + w * 0.28;
    /* base */
    fillRR(g, px1 - 8, y + h - 7, 16, 7, 2, '#4a515c');
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.fillRect(px1 - 7, y + h - 7, 14, 1.5);
    if (e.active){
      g.save();
      g.globalAlpha = 0.20 + 0.10 * Math.sin(e.at * 3);
      fillCircle(g, px1, y + h - 4, 20, rgrad(g, px1, y + h - 4, 1, 22, [[0, e.col], [1, 'rgba(0,0,0,0)']]));
      g.restore();
    }
    /* pole */
    fillRR(g, px1 - 2, y + 2, 4, h - 8, 2, vgrad(g, 0, y, y + h, [[0, '#d5dbe4'], [1, '#79818d']]));
    fillCircle(g, px1, y + 2, 3.4, e.active ? e.col : '#8b939f');
    /* cloth */
    var flyY = y + 6 + (1 - e.raise) * (h * 0.4);
    var cw = w * 0.85, ch = h * 0.26;
    var t = e.at * (e.active ? 4.2 : 1.1);
    var amp = e.active ? 3.4 : 1.0;
    g.beginPath();
    g.moveTo(px1, flyY);
    var steps = 8;
    for (i = 0; i <= steps; i++){
      var f = i / steps;
      g.lineTo(px1 + cw * f, flyY + Math.sin(t + f * 5) * amp * f);
    }
    for (i = steps; i >= 0; i--){
      var f2 = i / steps;
      g.lineTo(px1 + cw * f2, flyY + ch + Math.sin(t + f2 * 5) * amp * f2);
    }
    g.closePath();
    g.fillStyle = e.active
      ? hgrad(g, px1, px1 + cw, 0, [[0, '#6ef2a0'], [1, '#22a85f']])
      : hgrad(g, px1, px1 + cw, 0, [[0, '#9aa3ae'], [1, '#6c757f']]);
    g.fill();
    g.strokeStyle = 'rgba(10,40,24,0.45)'; g.lineWidth = 1; g.stroke();
    /* star on the cloth once active */
    if (e.active){
      g.save();
      g.globalAlpha = 0.85;
      var sx = px1 + cw * 0.5, sy = flyY + ch * 0.5;
      g.fillStyle = '#eafff2';
      g.beginPath();
      for (i = 0; i < 10; i++){
        var a = -Math.PI / 2 + i * Math.PI / 5;
        var rr = (i % 2 === 0) ? ch * 0.36 : ch * 0.16;
        var vx2 = sx + Math.cos(a) * rr, vy2 = sy + Math.sin(a) * rr;
        if (i === 0) g.moveTo(vx2, vy2); else g.lineTo(vx2, vy2);
      }
      g.closePath(); g.fill();
      g.restore();
    }
  }
});

/* =========================================================================
 * 27. BALL - cannon projectile (vx, vy in px/s)
 * ========================================================================= */
E('ball', {
  layer: 'main',
  solid: false,
  init: function(e, d){
    e.mvx = num(d.vx, 0);
    e.mvy = num(d.vy, 0);
    e.grav = spd(d.gravity, 0);
    e.r = d.r != null ? tpx(d.r, 0.28) : Math.max(4, Math.min(DW(e), DH(e)) / 2);
    e.kind = str(d.kind, 'fire');
    e.life = num(d.life, 7);
    e.trail = [];
    e.col = (e.kind === 'rock') ? '#a08b74' : ((e.kind === 'energy') ? '#8ad8ff' : '#ff9a3c');
    e.col2 = (e.kind === 'rock') ? '#6b5a48' : ((e.kind === 'energy') ? '#2f8fd0' : '#ff4d2d');
  },
  update: function(e, dt){
    /* if the engine integrates entity velocity itself, do not move twice */
    if (e._lx != null && (e.x !== e._lx || e.y !== e._ly)) e._engineMoves = true;
    e.mvy += e.grav * dt;
    if (!e._engineMoves){
      e.x += e.mvx * dt;
      e.y += e.mvy * dt;
    }
    e.vx = e.mvx; e.vy = e.mvy;
    e._lx = e.x; e._ly = e.y;
    var cx = e.x + DW(e) / 2, cy = e.y + DH(e) / 2;
    e.trail.push(cx, cy);
    if (e.trail.length > 16) e.trail.splice(0, 2);
    e.life -= dt;
    var gone = (e.life <= 0) || cx < -64 || cx > levelW() + 64 || cy > levelH() + 96 || cy < -400;
    if (!gone && solidPx(cx, cy)) gone = 'hit';
    if (hitPCircle(cx, cy, e.r * 0.92)){
      hurt(e.kind === 'energy' ? 'laser' : 'ball');
      gone = 'hit';
    }
    if (!gone) return;
    if (gone === 'hit'){
      sfx('pop');
      fxBurst(cx, cy, [e.col, e.col2, '#ffffff'], 12, 160, { life: 0.35, gravity: 240 });
    }
    /* flagged, not spliced: the engine reaps dead entities after the update
     * pass, so the list is never mutated underneath its own loop */
    e.dead = true;
  },
  onReset: function(e){
    if (isFn(RT.remove)){ try { RT.remove(e); } catch (err) {} }
    e.dead = true;
  },
  draw: function(e, g){
    if (e.dead) return;
    var cx = e.x + DW(e) / 2, cy = e.y + DH(e) / 2, r = e.r, i;
    /* trail */
    for (i = 0; i < e.trail.length; i += 2){
      var f = (i / 2) / Math.max(1, e.trail.length / 2);
      g.save();
      g.globalAlpha = f * 0.42;
      fillCircle(g, e.trail[i], e.trail[i + 1], r * (0.25 + f * 0.62), e.col);
      g.restore();
    }
    /* glow */
    g.save();
    g.globalAlpha = 0.45;
    fillCircle(g, cx, cy, r * 2.1, rgrad(g, cx, cy, 1, r * 2.2, [[0, e.col], [1, 'rgba(0,0,0,0)']]));
    g.restore();
    if (e.kind === 'rock'){
      var pts = [], n = 7;
      for (i = 0; i < n; i++){
        var a = (i / n) * TAU + e.at * 2;
        var rr = r * (0.82 + srand(e.seed + i) * 0.3);
        pts.push(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      }
      poly(g, pts);
      g.fillStyle = vgrad(g, 0, cy - r, cy + r, [[0, e.col], [1, e.col2]]);
      g.fill();
      g.strokeStyle = 'rgba(30,22,14,0.6)'; g.lineWidth = 1.2; g.stroke();
    } else {
      fillCircle(g, cx, cy, r, rgrad(g, cx - r * 0.3, cy - r * 0.3, r * 0.1, r * 1.15,
        [[0, '#ffffff'], [0.4, e.col], [1, e.col2]]));
      g.save();
      g.globalAlpha = 0.6 + 0.3 * Math.sin(e.at * 18);
      fillCircle(g, cx, cy, r * 0.42, '#fffbe6');
      g.restore();
    }
  }
});

/* =========================================================================
 * 28. BALLOON - P-balloon: gravity 0.15x, jump = flap
 * ========================================================================= */
E('balloon', {
  layer: 'main',
  solid: false,
  keep: ['timer', 'flap'],
  init: function(e, d){
    e.dur = num(d.dur, 8);
    e.timer = e.dur;
    e.flap = 0;
    e.homeY = e.y;
    e.col = str(d.color, '#ff6fae');
    e.state = 'idle';
    e.prevJmp = true;
  },
  update: function(e, dt){
    if (e.state === 'idle'){
      e.y = e.homeY + Math.sin(e.at * 1.8 + e.seed) * 4;
      if (!pAlive()) return;
      if (!hitP(e.x - 2, e.y - 2, DW(e) + 4, DH(e) + 4, 2)) return;
      e.state = 'carried';
      e.timer = e.dur;
      Float.attach(e);
      sfx('balloon');
      sfx('powerup');
      flashScreen('rgba(255,150,200,0.18)', 0.12);
      fxBurst(e.x + DW(e) / 2, e.y + DH(e) / 2, [e.col, '#ffffff'], 20, 180, { life: 0.6, gravity: -40 });
      var i0 = input();
      e.prevJmp = !!i0.jump;
      return;
    }
    if (e.state === 'carried'){
      var p = RT.player;
      if (!p || p.dead){ popBalloon(e, true); return; }
      Float.step();
      e.timer -= dt;
      hudSet('balloon', 'BALLOON ' + Math.max(0, e.timer).toFixed(1) + 's');
      /* ride above the player */
      e.x = p.x + pW() / 2 - DW(e) / 2;
      e.y = p.y - DH(e) * 0.85;
      /* flap */
      var i2 = input();
      var jmp = !!i2.jump;
      if ((!!i2.jumpPressed || (jmp && !e.prevJmp))){
        p.vy = -270;
        p.onGround = false;
        e.flap = 1;
        sfx('balloon');
        fxBurst(p.x + pW() / 2, p.y + pH(), ['#ffffff', e.col], 5, 90, { life: 0.35, gravity: 160, size: 2 });
      }
      e.prevJmp = jmp;
      if (e.flap > 0) e.flap = Math.max(0, e.flap - dt * 4);
      if (e.timer <= 2 && Math.floor(e.timer * 6) % 2 === 0 && Math.random() < 0.3){
        fxBurst(e.x + DW(e) / 2, e.y + DH(e) / 2, [e.col], 1, 40, { life: 0.3, gravity: -20, size: 2 });
      }
      if (e.timer <= 0) popBalloon(e, false);
    }
  },
  onPlayerDeath: function(e){ if (e.state === 'carried') popBalloon(e, true); },
  onRemove: function(e){ Float.detach(e); },
  onReset: function(e){
    Float.detach(e);
    e.state = 'idle';
    e.timer = e.dur;
    e.y = e.homeY;
    hudClear('balloon');
  },
  draw: function(e, g){
    if (e.state === 'spent') return;
    var w = DW(e), h = DH(e), cx = e.x + w / 2, cy = e.y + h * 0.45;
    var rw = w * 0.46 * (1 + e.flap * 0.10), rh = h * 0.50 * (1 - e.flap * 0.10);
    var blink = (e.state === 'carried' && e.timer <= 2 && Math.floor(e.timer * 8) % 2 === 0);
    g.globalAlpha = blink ? 0.45 : 1;
    /* string */
    g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(cx, cy + rh);
    g.quadraticCurveTo(cx + Math.sin(e.at * 3) * 3, cy + rh + h * 0.28, cx, cy + rh + h * 0.5);
    g.stroke();
    /* body */
    ellipse(g, cx, cy, rw, rh);
    g.fillStyle = rgrad(g, cx - rw * 0.3, cy - rh * 0.35, rw * 0.1, rw * 1.4,
      [[0, '#ffffff'], [0.35, e.col], [1, shade(e.col, -0.35)]]);
    g.fill();
    g.strokeStyle = 'rgba(90,20,55,0.45)'; g.lineWidth = 1.2; g.stroke();
    /* knot */
    poly(g, [cx - 3, cy + rh, cx + 3, cy + rh, cx, cy + rh + 4]);
    g.fillStyle = shade(e.col, -0.25); g.fill();
    /* highlight */
    g.save();
    g.globalAlpha = 0.55;
    ellipse(g, cx - rw * 0.34, cy - rh * 0.38, rw * 0.2, rh * 0.28);
    g.fillStyle = '#ffffff'; g.fill();
    g.restore();
    /* face while carried + timer ring */
    if (e.state === 'carried'){
      fillCircle(g, cx - rw * 0.22, cy - rh * 0.05, 2.2, '#3a1024');
      fillCircle(g, cx + rw * 0.22, cy - rh * 0.05, 2.2, '#3a1024');
      g.strokeStyle = '#3a1024'; g.lineWidth = 1.4;
      g.beginPath();
      g.arc(cx, cy + rh * 0.18, rw * 0.26, 0.25, Math.PI - 0.25);
      g.stroke();
      var k = clamp(e.timer / Math.max(0.01, e.dur), 0, 1);
      g.save();
      g.globalAlpha = 0.8;
      g.strokeStyle = k < 0.25 ? '#ff5c5c' : '#ffffff';
      g.lineWidth = 2.4;
      g.beginPath();
      g.arc(cx, cy, rw + 5, -Math.PI / 2, -Math.PI / 2 + TAU * k);
      g.stroke();
      g.restore();
    }
  }
});
function popBalloon(e, silent){
  var cx = e.x + DW(e) / 2, cy = e.y + DH(e) / 2;
  Float.detach(e);
  e.state = 'spent';
  hudClear('balloon');
  if (!silent){
    sfx('pop');
    shakeCam(2.5, 0.12);
    fxBurst(cx, cy, [e.col, '#ffffff', shade(e.col, 0.3)], 22, 230, { life: 0.5, gravity: 260 });
  }
}

/* =========================================================================
 * 29. MUSHROOM - real = one-hit shield, poison = kills (troll toolkit)
 * -------------------------------------------------------------------------
 * The poison tell: a colder cap, lavender spots instead of white, a narrower
 * stare and one faint wisp every few seconds. Present, but quiet.
 * ========================================================================= */
E('mushroom', {
  layer: 'main',
  solid: false,
  shadow: true,
  keep: ['taken'],
  init: function(e, d){
    e.poison = !!d.poison;
    e.taken = false;
    e.homeY = e.y;
    e.state = 'idle';
  },
  update: function(e, dt){
    if (e.state === 'carried'){
      if (Shield.owner !== e){ e.state = 'spent'; return; }
      Shield.carry();
      return;
    }
    if (e.state !== 'idle') return;
    e.y = e.homeY + Math.sin(e.at * 2.1 + e.seed) * 2.2;
    if (e.poison){
      if (Math.random() < 0.012){
        fxBurst(e.x + DW(e) / 2 + rrange(-5, 5), e.y + DH(e) * 0.25,
          ['rgba(180,120,220,0.75)'], 1, 16, { life: 1.1, gravity: -34, size: 2 });
      }
    } else if (Math.random() < 0.03){
      fxBurst(e.x + DW(e) / 2 + rrange(-7, 7), e.y + rrange(0, DH(e) * 0.6),
        ['#fff3c4', '#ffffff'], 1, 14, { life: 0.7, gravity: -26, size: 2 });
    }
    if (!pAlive()) return;
    if (!hitP(e.x - 1, e.y - 1, DW(e) + 2, DH(e) + 2, 2)) return;
    var cx = e.x + DW(e) / 2, cy = e.y + DH(e) / 2;
    if (e.poison){
      e.state = 'spent';
      e.taken = true;
      sfx('poison');
      flashScreen('rgba(150,60,200,0.35)', 0.16);
      shakeCam(4, 0.2);
      fxBurst(cx, cy, ['#b06cd8', '#6d3f8f', '#2b1436'], 24, 200, { life: 0.6, gravity: 180 });
      hurt('poison');
      return;
    }
    e.state = 'carried';
    e.taken = true;
    Shield.give(e);
    sfx('powerup');
    flashScreen('rgba(255,225,150,0.22)', 0.14);
    fxBurst(cx, cy, ['#ffe27a', '#ffffff', '#ff9a6b'], 26, 210, { life: 0.7, gravity: 60 });
    toastMsg('ONE FREE HIT', 1.4);
  },
  onPlayerDeath: function(e){
    if (Shield.owner === e) Shield.clear();
    if (e.state === 'carried') e.state = 'spent';
  },
  /* respawn despawns non-persistent entities, so drop the shield with it */
  onRemove: function(e){ if (Shield.owner === e) Shield.clear(); },
  onReset: function(e){
    if (Shield.owner === e) Shield.clear();
    e.state = 'idle';
    e.taken = false;
    e.y = e.homeY;
  },
  draw: function(e, g){
    if (e.state === 'spent') return;
    var w = DW(e), h = DH(e), i;
    if (e.state === 'carried'){
      /* the shield aura rides the player */
      var p = RT.player;
      if (!p) return;
      var cx2 = p.x + pW() / 2, cy2 = p.y + pH() / 2, r2 = Math.max(pW(), pH()) * 0.85;
      g.save();
      g.globalAlpha = 0.28 + 0.12 * Math.sin(e.at * 5);
      circle(g, cx2, cy2, r2);
      g.strokeStyle = '#ffe27a'; g.lineWidth = 2.4; g.stroke();
      g.globalAlpha = 0.14;
      fillCircle(g, cx2, cy2, r2, rgrad(g, cx2, cy2, r2 * 0.4, r2, [[0, 'rgba(255,226,122,0)'], [1, '#ffe27a']]));
      g.restore();
      g.save();
      g.globalAlpha = 0.75;
      for (i = 0; i < 6; i++){
        var a = e.at * 1.6 + i * TAU / 6;
        fillCircle(g, cx2 + Math.cos(a) * r2, cy2 + Math.sin(a) * r2, 1.8, '#fff3c4');
      }
      g.restore();
      return;
    }
    /* the pickup */
    var cx = e.x + w / 2, base = e.y + h;
    var capW = w * 0.92, capH = h * 0.56;
    var capC1 = e.poison ? '#c2506f' : '#f05a4a';
    var capC2 = e.poison ? '#6f2646' : '#a8241d';
    var spotC = e.poison ? '#cbb6e0' : '#fff6e2';
    /* stem */
    fillRR(g, cx - w * 0.17, base - h * 0.52, w * 0.34, h * 0.52, w * 0.1, vgrad(g, 0, base - h * 0.5, base, [[0, '#fdf3dd'], [1, '#d9c9a8']]));
    g.strokeStyle = 'rgba(90,70,40,0.4)'; g.lineWidth = 1;
    strokeRR(g, cx - w * 0.17, base - h * 0.52, w * 0.34, h * 0.52, w * 0.1, 'rgba(90,70,40,0.4)', 1);
    /* cap */
    g.beginPath();
    g.moveTo(cx - capW / 2, base - h * 0.42);
    g.quadraticCurveTo(cx - capW / 2, base - h * 0.42 - capH, cx, base - h * 0.42 - capH);
    g.quadraticCurveTo(cx + capW / 2, base - h * 0.42 - capH, cx + capW / 2, base - h * 0.42);
    g.quadraticCurveTo(cx, base - h * 0.30, cx - capW / 2, base - h * 0.42);
    g.closePath();
    g.fillStyle = vgrad(g, 0, base - h * 0.42 - capH, base - h * 0.3, [[0, shade(capC1, 0.18)], [0.55, capC1], [1, capC2]]);
    g.fill();
    g.strokeStyle = 'rgba(60,12,20,0.55)'; g.lineWidth = 1.3; g.stroke();
    /* spots */
    var spots = [[-0.26, -0.55, 0.15], [0.20, -0.62, 0.13], [0.02, -0.38, 0.11], [-0.34, -0.30, 0.09]];
    for (i = 0; i < spots.length; i++){
      g.save();
      g.globalAlpha = e.poison ? 0.82 : 0.95;
      ellipse(g, cx + capW * spots[i][0], base - h * 0.42 + capH * spots[i][1], capW * spots[i][2], capH * spots[i][2] * 1.25);
      g.fillStyle = spotC; g.fill();
      g.restore();
    }
    /* eyes - the poison stare is narrower */
    var ey = base - h * 0.26;
    for (i = 0; i < 2; i++){
      var ex = cx + (i ? 1 : -1) * w * 0.14;
      if (e.poison){
        g.strokeStyle = '#3a2030'; g.lineWidth = 2; g.lineCap = 'round';
        g.beginPath();
        g.moveTo(ex - 2.4, ey - 0.6); g.lineTo(ex + 2.4, ey + 0.8);
        g.stroke();
      } else {
        fillCircle(g, ex, ey, 2.0, '#3a2030');
        fillCircle(g, ex - 0.6, ey - 0.7, 0.7, 'rgba(255,255,255,0.9)');
      }
    }
    /* glow */
    g.save();
    g.globalAlpha = e.poison ? 0.10 : 0.18;
    fillCircle(g, cx, base - h * 0.45, w * 0.8,
      rgrad(g, cx, base - h * 0.45, 1, w * 0.85, [[0, e.poison ? '#b06cd8' : '#ffe27a'], [1, 'rgba(0,0,0,0)']]));
    g.restore();
  }
});

/* =========================================================================
 * 30. LAVABALL - podoboo
 * ========================================================================= */
E('lavaball', {
  layer: 'main',
  solid: false,
  keep: ['timer', 'mvy'],
  init: function(e, d){
    e.every = Math.max(0.4, num(d.every, 2.6));
    e.power = spd(d.power, 900 / T);
    e.grav = spd(d.gravity, 1800 / T);
    e.r = d.r != null ? tpx(d.r, 0.4) : Math.max(8, Math.min(DW(e), DH(e)) / 2);
    e.homeY = e.y; e.homeX = e.x;
    e.timer = Math.max(0, e.every - clamp(num(d.phase, 0), 0, e.every));
    e.mvy = 0;
    e.state = 'wait';
  },
  update: function(e, dt){
    var cx = e.x + DW(e) / 2, cy = e.y + DH(e) / 2;
    if (e.state === 'wait'){
      e.timer -= dt;
      if (Math.random() < 0.10){
        fxBurst(e.homeX + DW(e) / 2 + rrange(-6, 6), e.homeY + DH(e) * 0.4,
          ['#ff9a3c', '#ffd27a'], 1, 24, { life: 0.6, gravity: -60, size: 2 });
      }
      if (e.timer <= 0){
        e.state = 'up';
        e.mvy = -e.power;
        e.x = e.homeX; e.y = e.homeY;
        sfx('pop');
        shakeCam(2.5, 0.14);
        fxBurst(cx, e.homeY + DH(e) * 0.5, ['#ffd27a', '#ff7a3d', '#ff4d2d'], 16, 200, { life: 0.6, gravity: 500, spread: Math.PI });
        fxEmit(cx, e.homeY, 'embers');
      }
      return;
    }
    e.mvy += e.grav * dt;
    e.y += e.mvy * dt;
    if (Math.random() < 0.6){
      fxBurst(e.x + DW(e) / 2 + rrange(-3, 3), e.y + DH(e) * 0.7,
        ['#ff7a3d', '#ffb457'], 1, 20, { life: 0.5, gravity: 240, size: 2 });
    }
    if (hitPCircle(e.x + DW(e) / 2, e.y + DH(e) / 2, e.r * 0.9)) hurt('lava');
    if (e.mvy > 0 && e.y >= e.homeY){
      e.y = e.homeY;
      e.state = 'wait';
      e.timer = e.every;
      sfx('pop');
      shakeCam(2, 0.1);
      fxBurst(e.x + DW(e) / 2, e.homeY + DH(e) * 0.4, ['#ffd27a', '#ff7a3d'], 14, 180, { life: 0.5, gravity: 420, spread: Math.PI });
    }
  },
  onReset: function(e){
    e.x = e.homeX; e.y = e.homeY;
    e.state = 'wait';
    e.timer = e.every;
    e.mvy = 0;
  },
  draw: function(e, g){
    var w = DW(e), h = DH(e), cx = e.x + w / 2, cy = e.y + h / 2, r = e.r, i;
    if (e.state === 'wait'){
      /* a low glow where it will come from */
      g.save();
      g.globalAlpha = 0.18 + 0.10 * Math.sin(e.at * 4);
      fillCircle(g, e.homeX + w / 2, e.homeY + h * 0.5, r * 1.6,
        rgrad(g, e.homeX + w / 2, e.homeY + h * 0.5, 1, r * 1.7, [[0, '#ff9a3c'], [1, 'rgba(0,0,0,0)']]));
      g.restore();
      return;
    }
    /* glow */
    g.save();
    g.globalAlpha = 0.5;
    fillCircle(g, cx, cy, r * 2.2, rgrad(g, cx, cy, 1, r * 2.3, [[0, 'rgba(255,140,50,0.9)'], [1, 'rgba(0,0,0,0)']]));
    g.restore();
    /* wobbling molten blob, stretched along travel */
    var stretch = clamp(Math.abs(e.mvy) / 900, 0, 0.4);
    g.translate(cx, cy);
    g.scale(1 - stretch * 0.35, 1 + stretch * 0.45);
    var n = 12;
    g.beginPath();
    for (i = 0; i <= n; i++){
      var a = (i / n) * TAU;
      var rr = r * (1 + Math.sin(a * 3 + e.at * 6) * 0.06 + Math.sin(a * 5 - e.at * 4) * 0.04);
      var x2 = Math.cos(a) * rr, y2 = Math.sin(a) * rr;
      if (i === 0) g.moveTo(x2, y2); else g.lineTo(x2, y2);
    }
    g.closePath();
    g.fillStyle = rgrad(g, -r * 0.25, -r * 0.3, r * 0.1, r * 1.25,
      [[0, '#fff3c4'], [0.35, '#ffb457'], [0.75, '#ff5c2d'], [1, '#a32410']]);
    g.fill();
    g.strokeStyle = 'rgba(120,30,8,0.55)'; g.lineWidth = 1.2; g.stroke();
    /* core */
    g.save();
    g.globalAlpha = 0.75 + 0.2 * Math.sin(e.at * 10);
    fillCircle(g, -r * 0.1, -r * 0.1, r * 0.34, '#fff7d6');
    g.restore();
    /* drips */
    g.fillStyle = '#ff6a2e';
    for (i = 0; i < 2; i++){
      var dx = (i ? 1 : -1) * r * 0.45;
      var dy = r * (0.75 + Math.sin(e.at * 5 + i) * 0.12);
      fillCircle(g, dx, dy, r * 0.16, '#ff6a2e');
    }
    /* angry face */
    fillCircle(g, -r * 0.28, -r * 0.12, r * 0.13, '#5a1405');
    fillCircle(g, r * 0.28, -r * 0.12, r * 0.13, '#5a1405');
    g.strokeStyle = '#5a1405'; g.lineWidth = Math.max(1.2, r * 0.09); g.lineCap = 'round';
    g.beginPath();
    g.moveTo(-r * 0.30, r * 0.30);
    g.quadraticCurveTo(0, r * 0.12, r * 0.30, r * 0.30);
    g.stroke();
  }
});

/* ======================================================================== */
/* every type in CONTRACT.md section 6 is defined above - 30 of them */
window.__RT_ENTITY_TYPES = DEFINED;

})();
