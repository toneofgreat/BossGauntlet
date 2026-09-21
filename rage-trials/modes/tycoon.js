/* ==========================================================================
   RAGE TRIALS — modes/tycoon.js
   RT.Tycoon: cash, droppers, conveyor chutes, collectors and Roblox-style
   BUY BUTTONS. Used by level 8 (THE ULTIMATE OBBY TYCOON) and level 10.

   Contract: CONTRACT.md §11. Plain browser JS, no modules, no assets.
   engine.js owns window.RT; this file only attaches to it.

   ---------------------------------------------------------------- USAGE ---
   RT.Tycoon.start({
     cash: 0,                       // starting cash
     hudKey: 'cash',                // RT.hud.set key (default 'cash')
     coinValue: 5,                  // cash per coin picked up while active
     buyHold: 0.34,                 // seconds of standing on a pad to buy
     rebirthMult: 2,                // default multiplier for RT.Tycoon.rebirth()
     rebirthCash: 0,                // cash left after a rebirth
     rebirthResetAll: false,        // true also resets platforms and abilities
     mult: 1,                       // starting income multiplier
     coinScale: 1,                  // scales a coin's own value into cash
     onBuy: function(item, RT){},   // fired after every purchase
     onCash: function(n, RT){},     // fired whenever cash is earned
     cashpad: {x:6, y:9},           // optional CASH/INCOME plinth (tiles)
     rebirth: {x:40, y:9, cost:2500, mult:2.5},   // optional PRESTIGE pad
     items: [{
       id:'drop1', name:'Dropper I', price:25, x:12, y:8,  // x,y,w,h in TILES
       w:2, h:1, kind:'dropper', cps:2,
       desc:'+2 cash / second',                   // shown when the player is near
       requires:'bridge',                         // id or [ids]; pad hidden until bought
       mx:12, my:8, flip:false,                   // optional machine placement (tiles)
       collector:{x:15,y:8},                      // optional shared collector (tiles)
       tiles:[[20,9,'#'],[21,9,'#']],             // kind 'platform': painted via RT.setTile
       ability:'doubleJump',                      // kind 'ability': doubleJump | dash
       flag:'goldHat',                            // kind 'cosmetic'
       keepOnRebirth:true,                        // override the rebirth reset rule
       showLocked:true,                           // draw a greyed LOCKED preview pad
       icon:'gate', color:'#67e8f9',              // billboard icon override + tint
       onBuy:function(RT, item){}                 // per-item hook
     }]
   });

   RT.Tycoon.cash / .add(n) / .spend(n) / .has(id) / .state() / .stop()
   RT.Tycoon.rebirth(mult)  — multiplies income, resets purchases (level 10)
   RT.Tycoon.buy(id, {free:true})  — programmatic purchase (routes, tests)

   Entity types defined here: buybutton, dropper, collector, cashpad
   (plus the invisible internal 'tycoonroot' that draws FX and follows the
   player so it is never culled).
   ========================================================================== */
(function(){
'use strict';

var RT = window.RT;
if(!RT){ if(window.console && console.error) console.error('[tycoon] engine.js must load before modes/tycoon.js'); return; }

/* ------------------------------------------------------------- constants -- */
var TILE      = 32;
var FONT      = '"Trebuchet MS","Segoe UI",Verdana,system-ui,sans-serif';
var MONO      = '"Consolas","SFMono-Regular",Menlo,ui-monospace,monospace';
var BUY_HOLD  = 0.34;           // seconds standing on a pad before it buys
var MAX_PARTS = 300;            // hard cap, contract §12 says never go wild
var CUBE_SPEED= 128;            // px/s a cash cube travels down the chute
var MAX_CUBES = 26;             // per dropper; beyond this we bank instantly
var RISE_T    = 0.45;
var SINK_T    = 0.60;

var C = {
  ok:'#4ade80', okLo:'#16a34a', okDk:'#14532d',
  no:'#f87171', noLo:'#dc2626', noDk:'#7f1d1d',
  lk:'#94a3b8', lkLo:'#64748b', lkDk:'#334155',
  gold:'#fbbf24', goldHi:'#fef3c7', goldLo:'#b45309',
  panel:'#141d31', panelLo:'#0a0f1c', edge:'#33415e',
  ink:'#f1f5f9', dim:'#9db0cc',
  m1:'#6d7d98', m2:'#3a4459', m3:'#1b2231', m4:'#0e131d',
  green:'#34d399', cyan:'#67e8f9', purple:'#c084fc', red:'#ef4444'
};

/* ------------------------------------------------------------------ math -- */
function clamp(v,a,b){ return v<a?a:(v>b?b:v); }
function lerp(a,b,t){ return a+(b-a)*t; }
function easeOutCubic(t){ t=clamp(t,0,1); var u=1-t; return 1-u*u*u; }
function easeInCubic(t){ t=clamp(t,0,1); return t*t*t; }
function easeOutBack(t){ t=clamp(t,0,1); var c1=1.70158, c3=c1+1, u=t-1; return 1+c3*u*u*u+c1*u*u; }
function easeOutQuad(t){ t=clamp(t,0,1); return 1-(1-t)*(1-t); }
function pulse(t,period){ return 0.5+0.5*Math.sin(t*Math.PI*2/(period||1)); }
function rnd(){ try{ if(typeof RT.random==='function') return RT.random(); }catch(e){} return Math.random(); }
function rrange(a,b){ return a+(b-a)*rnd(); }

function grp(n){
  var s = String(n), out = '', c = 0, i;
  for(i=s.length-1;i>=0;i--){ out = s.charAt(i)+out; if(++c%3===0 && i>0) out = ','+out; }
  return out;
}
function trimNum(v){
  var s = v.toFixed(v<10?2:1);
  s = s.replace(/\.?0+$/,'');
  return s;
}
function fmtCash(n){
  n = Math.floor(n||0);
  var neg = n<0; if(neg) n = -n;
  var s;
  if(n < 100000)      s = grp(n);
  else if(n < 1e6)    s = Math.floor(n/1000) + 'K';
  else if(n < 1e9)    s = trimNum(n/1e6) + 'M';
  else                s = trimNum(n/1e9) + 'B';
  return (neg?'-':'')+s;
}
function fmtRate(v){
  v = v||0;
  if(v >= 1000) return fmtCash(v);
  if(v >= 10)   return String(Math.round(v));
  return trimNum(Math.round(v*10)/10);
}

/* ------------------------------------------------- defensive engine calls -- */
function sfx(name){ try{ if(RT.Audio && RT.Audio.sfx) RT.Audio.sfx(name); }catch(e){} }
function toast(t,d){ try{ if(RT.toast) RT.toast(t,d); }catch(e){} }
function banner(lines,d){ try{ if(RT.banner) RT.banner(lines,d); }catch(e){} }
function flashFX(c,d){ try{ if(RT.flash) RT.flash(c,d); }catch(e){} }
function shake(p,d){ try{ if(RT.cam && RT.cam.shake) RT.cam.shake(p,d); }catch(e){} }
function hitstop(f){ try{ if(RT.hitstop) RT.hitstop(f); }catch(e){} }
function engineBurst(x,y,o){
  /* engine.js burst() reads {n, color/colors, speed, spread, angle, life, size, gravity} */
  try{
    if(RT.particles && RT.particles.burst){
      o = o||{};
      if(o.n == null) o.n = o.count == null ? 10 : o.count;
      RT.particles.burst(x,y,o);
    }
  }catch(e){}
}
function setTile(tx,ty,ch){ try{ if(RT.setTile) RT.setTile(tx,ty,ch); }catch(e){} }
function getTile(tx,ty){ try{ if(RT.getTile) return RT.getTile(tx,ty); }catch(e){} return null; }
function hudSet(k,t){ try{ if(RT.hud && RT.hud.set) RT.hud.set(k,t); }catch(e){} }
function hudClear(k){ try{ if(RT.hud && RT.hud.clear) RT.hud.clear(k); }catch(e){} }
function overlapRects(a,b){
  try{ if(RT.rectsOverlap) return RT.rectsOverlap(a,b); }catch(e){}
  return a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y;
}
function levelTilesWide(){
  try{ if(RT.level && RT.level.tiles && RT.level.tiles[0]) return RT.level.tiles[0].length; }catch(e){}
  return 400;
}
function playerRect(){
  var p = RT.player;
  if(!p) return null;
  return { x:p.x, y:p.y, w:p.w||20, h:p.h||28 };
}
/* throttled sfx so a wall of cash cubes does not become a wall of noise */
function sfxThrottled(name, gap){
  if(!S) { sfx(name); return; }
  var k = 'c_'+name, now = S.t;
  if(S.sfxAt[k] != null && now - S.sfxAt[k] < (gap||0.22)) return;
  S.sfxAt[k] = now;
  sfx(name);
}

/* ------------------------------------------------------------ canvas kit -- */
function rr(g,x,y,w,h,r){
  r = Math.min(r, Math.abs(w)/2, Math.abs(h)/2);
  g.beginPath();
  g.moveTo(x+r,y);
  g.lineTo(x+w-r,y); g.quadraticCurveTo(x+w,y,x+w,y+r);
  g.lineTo(x+w,y+h-r); g.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  g.lineTo(x+r,y+h); g.quadraticCurveTo(x,y+h,x,y+h-r);
  g.lineTo(x,y+r); g.quadraticCurveTo(x,y,x+r,y);
  g.closePath();
}
function vgrad(g,x,y0,y1,c0,c1){
  var gr = g.createLinearGradient(x,y0,x,y1);
  gr.addColorStop(0,c0); gr.addColorStop(1,c1);
  return gr;
}
function poly(g,pts){
  g.beginPath();
  g.moveTo(pts[0][0],pts[0][1]);
  for(var i=1;i<pts.length;i++) g.lineTo(pts[i][0],pts[i][1]);
  g.closePath();
}
function ellipseFill(g,x,y,rx,ry,style){
  g.save(); g.translate(x,y); g.scale(1, ry/rx);
  g.beginPath(); g.arc(0,0,rx,0,Math.PI*2); g.fillStyle = style; g.fill();
  g.restore();
}
/* soft glow without shadowBlur (contract §12) */
function halo(g,x,y,r,rgb,a){
  var gr = g.createRadialGradient(x,y,0,x,y,r);
  gr.addColorStop(0,'rgba('+rgb+','+(a).toFixed(3)+')');
  gr.addColorStop(0.55,'rgba('+rgb+','+(a*0.35).toFixed(3)+')');
  gr.addColorStop(1,'rgba('+rgb+',0)');
  g.fillStyle = gr;
  g.beginPath(); g.arc(x,y,r,0,Math.PI*2); g.fill();
}
function txt(g,s,x,y,o){
  o = o||{};
  var size = o.size||11, weight = o.weight||900;
  g.font = weight+' '+size+'px '+(o.mono?MONO:FONT);
  g.textAlign = o.align||'center';
  g.textBaseline = o.base||'middle';
  var pa = g.globalAlpha;
  if(o.alpha != null) g.globalAlpha = pa*o.alpha;
  if(o.stroke){ g.lineWidth = o.lw||3; g.lineJoin='round'; g.strokeStyle = o.stroke; g.strokeText(s,x,y); }
  if(o.shadow){ g.fillStyle = o.shadow; g.fillText(s,x+(o.sdx||0),y+(o.sdy||1.4)); }
  g.fillStyle = o.color||C.ink;
  g.fillText(s,x,y);
  g.globalAlpha = pa;
}
/* measureText is expensive and our strings barely change — memoise them */
var _mw = {}, _mwN = 0;
function measureCached(g, s, font){
  var k = font + '' + s;
  var v = _mw[k];
  if(v !== undefined) return v;
  if(_mwN > 600){ _mw = {}; _mwN = 0; }
  g.font = font;
  v = g.measureText(s).width;
  _mw[k] = v; _mwN++;
  return v;
}
function widthOf(g,s,size,weight,mono){
  return measureCached(g, s, (weight||900)+' '+(size||11)+'px '+(mono?MONO:FONT));
}
function trackedWidth(g,s,size,tr){
  var font = '900 '+(size||10)+'px '+FONT;
  var w = 0, i;
  for(i=0;i<s.length;i++) w += measureCached(g, s.charAt(i), font) + tr;
  return Math.max(0, w - tr);
}
/* tracked (letter-spaced) caps — the Roblox-ish label look */
function txtTracked(g,s,x,y,o){
  o = o||{};
  var size = o.size||10, weight = o.weight||900, tr = o.track||1.4;
  var font = weight+' '+size+'px '+FONT;
  g.font = font;
  g.textBaseline = o.base||'middle';
  g.textAlign = 'left';
  var i, w = 0, ch, cw;
  var widths = [];
  for(i=0;i<s.length;i++){ cw = measureCached(g, s.charAt(i), font); widths.push(cw); w += cw + tr; }
  w -= tr;
  g.font = font;                                   /* measureCached may have changed it */
  var cx = (o.align==='left') ? x : (o.align==='right' ? x-w : x-w/2);
  var pa = g.globalAlpha;
  if(o.alpha != null) g.globalAlpha = pa*o.alpha;
  g.fillStyle = o.color||C.ink;
  for(i=0;i<s.length;i++){
    g.fillText(s.charAt(i), cx, y);
    cx += widths[i] + tr;
  }
  g.globalAlpha = pa;
  return w;
}
/* Roblox stud */
function stud(g,x,y,rx,ry,top,side){
  ellipseFill(g,x,y+ry*0.55,rx,ry,side);
  ellipseFill(g,x,y,rx,ry,top);
  ellipseFill(g,x-rx*0.16,y-ry*0.22,rx*0.5,ry*0.45,'rgba(255,255,255,0.35)');
}
/* spinning coin (phase in radians) */
function drawCoin(g,x,y,r,phase){
  /* never fully edge-on: a frozen frame must still read as a coin */
  var k = 0.22 + 0.78*Math.abs(Math.cos(phase));
  var rx = Math.max(0.9, r*k);
  if(r < 4.6){                       /* tiny coin: flat, no gradient, no glyph */
    ellipseFill(g,x,y,rx,r,C.gold);
    ellipseFill(g,x-rx*0.2,y-r*0.25,rx*0.45,r*0.4,'rgba(255,255,255,0.5)');
    return;
  }
  ellipseFill(g,x,y+r*0.35,rx,r*0.28,'rgba(0,0,0,0.22)');
  var gr = g.createLinearGradient(x-rx,y-r,x+rx,y+r);
  gr.addColorStop(0,C.goldHi); gr.addColorStop(0.45,C.gold); gr.addColorStop(1,C.goldLo);
  ellipseFill(g,x,y,rx,r,gr);
  g.save(); g.translate(x,y); g.scale(rx/r,1);
  g.beginPath(); g.arc(0,0,r*0.78,0,Math.PI*2); g.lineWidth = Math.max(0.6, r*0.14);
  g.strokeStyle = 'rgba(180,83,9,0.75)'; g.stroke();
  g.restore();
  if(rx > r*0.45) txt(g,'$',x,y+0.5,{size:r*1.25,color:'#7c4a06',weight:900});
}
/* 2.5D cash cube */
function drawCube(g,x,y,s,rot,c1,c2,c3,label){
  var h = s*0.5, d = s*0.34;
  g.save(); g.translate(x,y); g.rotate(rot||0);
  ellipseFill(g,0,h+d*0.75,s*0.52,s*0.18,'rgba(0,0,0,0.20)');
  poly(g,[[-h,-h],[h-d,-h],[h,-h-d*0.62],[-h+d*0.55,-h-d*0.62]]); g.fillStyle=c1; g.fill();
  poly(g,[[h-d,-h],[h,-h-d*0.62],[h,h-d*0.62],[h-d,h]]); g.fillStyle=c3; g.fill();
  rr(g,-h,-h,s-d,s,2.2); g.fillStyle = vgrad(g,0,-h,h,c2,c3); g.fill();
  rr(g,-h+1,-h+1,(s-d)*0.5,s*0.3,1.4); g.fillStyle='rgba(255,255,255,0.28)'; g.fill();
  if(label !== false) txt(g,'$',(-d*0.18),0.5,{size:s*0.56,color:'rgba(255,255,255,0.92)',weight:900});
  g.restore();
}
/* LED readout plate (kept cheap: it redraws every frame) */
function ledPlate(g,x,y,w,h,text,color,size,align){
  rr(g,x,y,w,h,3); g.fillStyle = '#070d15'; g.fill();
  rr(g,x+0.5,y+0.5,w-1,h-1,3); g.lineWidth=1; g.strokeStyle='rgba(255,255,255,0.10)'; g.stroke();
  var tx = align==='left' ? x+4 : x+w/2;
  txt(g,text,tx,y+h/2+0.3,{size:size||9,color:color||C.green,mono:true,align:align==='left'?'left':'center'});
}

/* ========================================================================== */
/*                               SESSION STATE                                */
/* ========================================================================== */

var S = null;            // the live session, or null
var tickStamp = -1;      // last RT.frame we ran core() for
var sessionToken = 0;    // invalidates old RT.on handlers

function newSession(cfg){
  return {
    token: ++sessionToken,
    cfg: cfg,
    running: true,
    t: 0,
    cash: Math.max(0, cfg.cash||0),
    income: 0,                 // base cash/s from owned items (before mult)
    mult: cfg.mult>0 ? cfg.mult : 1,
    rebirths: 0,
    earned: 0, spent: 0,
    hudKey: cfg.hudKey || 'cash',
    hudLast: null,
    coinValue: cfg.coinValue != null ? cfg.coinValue : 5,
    buyHold: cfg.buyHold != null ? cfg.buyHold : BUY_HOLD,
    items: [], byId: {},
    ents: [], root: null,
    parts: [], builds: [],
    painted: [],               // [[tx,ty,ch]] re-applied after a respawn
    abilities: {}, flags: {},
    lastCoins: (RT.coins|0),
    coinEvent: false,
    needReapply: false,
    pendingFx: null, extAddFrame: -2,
    sfxAt: {},
    cashPop: 0,                // HUD/pad punch animation
    ensureT: 0
  };
}

/* ========================================================================== */
/*                                 PARTICLES                                  */
/* ========================================================================== */

function pAdd(o){
  if(!S) return;
  if(S.parts.length >= MAX_PARTS) S.parts.splice(0, 12);
  S.parts.push(o);
}
function spark(x,y,opts){
  opts = opts||{};
  var n = opts.count||8, i, a, sp;
  for(i=0;i<n;i++){
    a = opts.dir != null ? opts.dir + rrange(-0.7,0.7) : rrange(0,Math.PI*2);
    sp = rrange(opts.speed0||40, opts.speed1||150);
    pAdd({
      kind: opts.kind||'spark',
      x:x+rrange(-(opts.spread||3),(opts.spread||3)),
      y:y+rrange(-(opts.spread||3),(opts.spread||3)),
      vx:Math.cos(a)*sp, vy:Math.sin(a)*sp - (opts.lift||0),
      g:opts.grav!=null?opts.grav:420,
      life:0, max:rrange(opts.life0||0.35, opts.life1||0.75),
      size:rrange(opts.size0||1.6, opts.size1||3.4),
      rot:rrange(0,Math.PI*2), vr:rrange(-9,9),
      color:opts.color||C.gold, color2:opts.color2||C.goldHi,
      drag:opts.drag!=null?opts.drag:0.86
    });
  }
}
function cashBurst(x,y,n,dir){
  spark(x,y,{count:n||14, kind:'cash', color:C.gold, color2:C.goldHi,
             speed0:60, speed1:210, life0:0.5, life1:0.95, size0:3.2, size1:6.2,
             grav:560, lift:80, dir:dir, spread:5});
  engineBurst(x,y,{n:Math.min(24, n||12), colors:[C.gold,C.goldHi,'#ffffff'],
                   speed:170, life:0.7, size:3, gravity:520, glow:true});
}
function ringFX(x,y,r0,r1,color,life){
  pAdd({kind:'ring', x:x, y:y, r0:r0, r1:r1, life:0, max:life||0.45, color:color||C.ok});
}
function floatText(x,y,str,color,size,life){
  pAdd({kind:'text', x:x, y:y, vx:rrange(-8,8), vy:-38, g:0, life:0, max:life||1.05,
        str:str, color:color||C.gold, size:size||12});
}
function updateParts(dt){
  var a = S.parts, i, p;
  for(i=a.length-1;i>=0;i--){
    p = a[i];
    p.life += dt;
    if(p.life >= p.max){ a.splice(i,1); continue; }
    if(p.kind === 'ring') continue;
    p.x += p.vx*dt; p.y += p.vy*dt;
    if(p.g) p.vy += p.g*dt;
    if(p.drag){ var d = Math.pow(p.drag, dt*60); p.vx *= d; if(!p.g) p.vy *= d; }
    if(p.vr) p.rot += p.vr*dt;
  }
}
function drawParts(g){
  var a = S.parts, i, p, k, al;
  for(i=0;i<a.length;i++){
    p = a[i]; k = p.life/p.max; al = 1-k*k;
    g.globalAlpha = clamp(al,0,1);
    if(p.kind === 'ring'){
      var r = lerp(p.r0,p.r1,easeOutCubic(k));
      g.beginPath(); g.arc(p.x,p.y,r,0,Math.PI*2);
      g.lineWidth = Math.max(0.8, 3.2*(1-k)); g.strokeStyle = p.color; g.stroke();
    } else if(p.kind === 'text'){
      var yy = p.y - easeOutCubic(k)*10;
      txt(g,p.str,p.x,yy,{size:p.size,color:p.color,stroke:'rgba(0,0,0,0.65)',lw:3.4,weight:900});
    } else if(p.kind === 'cash'){
      drawCube(g,p.x,p.y,p.size*1.7,p.rot,p.color2,p.color,C.goldLo,false);
    } else if(p.kind === 'dust'){
      g.beginPath(); g.arc(p.x,p.y,p.size,0,Math.PI*2); g.fillStyle = p.color; g.fill();
    } else {
      g.save(); g.translate(p.x,p.y); g.rotate(p.rot);
      g.fillStyle = p.color;
      g.fillRect(-p.size/2,-p.size/2,p.size,p.size*0.62);
      g.restore();
    }
  }
  g.globalAlpha = 1;
}

/* ========================================================================== */
/*                                  ECONOMY                                   */
/* ========================================================================== */

function addCash(n, opts){
  if(!S || !(n>0)) return 0;
  S.cash += n; S.earned += n;
  S.cashPop = 1;
  opts = opts||{};
  if(opts.text !== false && opts.x != null) floatText(opts.x, opts.y, '+$'+fmtCash(n), opts.color||C.gold, opts.size||12);
  if(opts.sfx) sfxThrottled(opts.sfx, opts.sfxGap||0.2);
  if(S.cfg.onCash){ try{ S.cfg.onCash(n, RT); }catch(e){ logErr(e); } }
  return n;
}
function spendCash(n){
  if(!S) return false;
  n = n||0;
  if(S.cash + 1e-9 < n) return false;
  S.cash -= n; S.spent += n;
  if(S.cash < 0) S.cash = 0;
  return true;
}
function recomputeIncome(){
  if(!S) return;
  var total = 0, i, it;
  for(i=0;i<S.items.length;i++){
    it = S.items[i];
    if(it.bought && it.cps > 0) total += it.cps;
  }
  S.income = total;
}
function logErr(e){
  try{
    if(window.__dbg && window.__dbg.errors) window.__dbg.errors.push('[tycoon] '+(e && e.message ? e.message : e));
    if(window.console && console.warn) console.warn('[tycoon]', e);
  }catch(x){}
}

/* ========================================================================== */
/*                                   ITEMS                                    */
/* ========================================================================== */

function normItem(def, idx){
  var it = {
    id:      def.id != null ? String(def.id) : ('item'+idx),
    name:    def.name != null ? String(def.name) : ('ITEM '+(idx+1)),
    desc:    def.desc || def.info || '',
    price:   Math.max(0, def.price||0),
    x:       def.x||0, y: def.y||0,
    w:       def.w||2, h: def.h||1,
    kind:    def.kind || 'cosmetic',
    cps:     def.cps||0,
    tiles:   null,
    ability: def.ability || null,
    flag:    def.flag || null,
    icon:    def.icon || null,
    color:   def.color || null,
    requires: def.requires == null ? [] : (def.requires instanceof Array ? def.requires.slice() : [def.requires]),
    onBuy:   typeof def.onBuy === 'function' ? def.onBuy : null,
    keepOnRebirth: def.keepOnRebirth,
    showLocked: !!def.showLocked,
    mx: def.mx, my: def.my, flip: !!def.flip,
    collectorAt: def.collector || null,
    def: def,
    bought:false, index:idx, btn:null, sim:null, ents:[]
  };
  if(!it.ability && it.kind === 'ability'){
    var low = it.id.toLowerCase() + ' ' + it.name.toLowerCase();
    it.ability = (low.indexOf('dash') >= 0) ? 'dash' : 'doubleJump';
  }
  if(!it.flag && it.kind === 'cosmetic') it.flag = it.id;
  if(def.tiles && def.tiles.length){
    it.tiles = [];
    for(var i=0;i<def.tiles.length;i++){
      var t = def.tiles[i];
      if(t instanceof Array) it.tiles.push([t[0]|0, t[1]|0, t[2] != null ? String(t[2]) : '#']);
      else if(t) it.tiles.push([t.x|0, t.y|0, t.ch != null ? String(t.ch) : '#']);
    }
  }
  return it;
}
function requirementsMet(it){
  for(var i=0;i<it.requires.length;i++){
    var r = S.byId[it.requires[i]];
    if(!r || !r.bought) return false;
  }
  return true;
}
function firstUnmet(it){
  for(var i=0;i<it.requires.length;i++){
    var r = S.byId[it.requires[i]];
    if(!r) return String(it.requires[i]);
    if(!r.bought) return r.name;
  }
  return '';
}
function affordable(it){ return S && S.cash + 1e-9 >= it.price; }

function spawnButton(it, silent, locked){
  if(!S || it.bought || it.btn) return null;
  var e = null;
  try{
    e = RT.spawn({ type:'buybutton', x:it.x, y:it.y, w:it.w, h:it.h,
                   item:it, locked:!!locked, tycoonToken:S.token });
  }catch(err){ logErr(err); return null; }
  if(!e) return null;
  it.btn = e;
  S.ents.push(e);
  if(!silent){
    var cx = it.x*TILE + it.w*TILE/2, cy = it.y*TILE + it.h*TILE;
    ringFX(cx, cy-8, 6, 34, 'rgba(103,232,249,0.85)', 0.5);
    spark(cx, cy-4, {count:10, kind:'dust', color:'rgba(190,210,235,0.75)', speed0:30, speed1:90, grav:120, life0:0.3, life1:0.6, size0:1.5, size1:3});
    sfxThrottled('pop', 0.1);
  }
  return e;
}
function refreshAvailability(silent){
  if(!S) return;
  for(var i=0;i<S.items.length;i++){
    var it = S.items[i];
    if(it.bought || it.btn) continue;
    if(requirementsMet(it)) spawnButton(it, silent, false);
    else if(it.showLocked) spawnButton(it, true, true);   /* a greyed preview pad */
  }
}

/* --------------------------------------------------------- the purchase --- */
function buyItem(it, opts){
  if(!S || !it || it.bought) return false;
  opts = opts||{};
  if(!opts.free && !spendCash(it.price)) return false;
  it.bought = true;

  var cx = it.x*TILE + it.w*TILE/2;
  var cy = it.y*TILE + it.h*TILE*0.5;

  sfx('buy');
  cashBurst(cx, cy, 20);
  ringFX(cx, cy, 8, 56, 'rgba(251,191,36,0.9)', 0.55);
  ringFX(cx, cy, 4, 34, 'rgba(255,255,255,0.8)', 0.35);
  floatText(cx - 30, cy - 26, '-$'+fmtCash(it.price), C.no, 13, 0.9);
  shake(it.price>=500 ? 5 : 3, 0.18);
  hitstop(2);

  applyPurchase(it);
  recomputeIncome();
  refreshAvailability();

  if(it.onBuy){ try{ it.onBuy(RT, it); }catch(e){ logErr(e); } }
  if(S.cfg.onBuy){ try{ S.cfg.onBuy(it, RT); }catch(e){ logErr(e); } }
  try{ if(RT.emit) RT.emit('tycoonBuy', it.id, it); }catch(e){}
  return true;
}

function applyPurchase(it){
  if(it.kind === 'dropper'){
    startDropper(it);
    toast(it.name.toUpperCase()+' ONLINE  +'+fmtRate(it.cps*S.mult)+'/s', 1.9);
  } else if(it.kind === 'platform'){
    if(it.tiles && it.tiles.length) startBuild(it);
    toast(it.name.toUpperCase()+' BUILT', 1.7);
  } else if(it.kind === 'ability'){
    grantAbility(it.ability, it.name);
  } else {
    S.flags[it.flag || it.id] = true;
    var p = playerRect();
    if(p){
      spark(p.x+p.w/2, p.y+p.h/2, {count:16, color:C.cyan, color2:'#ffffff', speed0:60, speed1:170, grav:180, life0:0.4, life1:0.8});
      ringFX(p.x+p.w/2, p.y+p.h/2, 6, 40, 'rgba(103,232,249,0.9)', 0.45);
    }
    sfx('powerup');
    toast(it.name.toUpperCase()+' EQUIPPED', 1.7);
  }
  if(it.kind !== 'dropper' && it.cps > 0) toast(it.name.toUpperCase()+'  +'+fmtRate(it.cps*S.mult)+'/s', 1.6);
}

function grantAbility(name, label){
  if(!name) return;
  S.abilities[name] = true;
  applyAbilities();
  /* a double jump bought in mid-air should be usable immediately */
  if(name === 'doubleJump' && RT.player && !RT.player.onGround && !RT.player.jumpsLeft) RT.player.jumpsLeft = 1;
  var p = playerRect();
  if(p){
    var cx = p.x+p.w/2, cy = p.y+p.h/2;
    ringFX(cx,cy,8,58,'rgba(251,191,36,0.95)',0.5);
    ringFX(cx,cy,4,40,'rgba(255,255,255,0.9)',0.34);
    spark(cx,cy,{count:26, color:C.goldHi, color2:'#ffffff', speed0:70, speed1:230, grav:120, life0:0.45, life1:0.95, size0:2, size1:4.4});
  }
  flashFX('rgba(255,235,160,0.55)', 0.22);
  shake(4,0.2);
  sfx('powerup');
  var pretty = name === 'dash' ? 'DASH' : (name === 'doubleJump' ? 'DOUBLE JUMP' : name.toUpperCase());
  banner([(label||pretty).toUpperCase(), 'UNLOCKED'], 1.5);
}
function applyAbilities(){
  if(!S || !RT.player) return;
  if(!RT.player.abilities) RT.player.abilities = {};
  for(var k in S.abilities){
    if(S.abilities.hasOwnProperty(k) && S.abilities[k]) RT.player.abilities[k] = true;
  }
}

/* ========================================================================== */
/*                       PLATFORM BUILD-IN (staggered)                        */
/* ========================================================================== */

function startBuild(it){
  var list = it.tiles, n = list.length, i;
  /* order by distance from the pad so it grows outward from the button */
  var ox = it.x + it.w/2, oy = it.y + it.h/2;
  var sorted = list.slice().sort(function(a,b){
    var da = (a[0]-ox)*(a[0]-ox) + (a[1]-oy)*(a[1]-oy);
    var db = (b[0]-ox)*(b[0]-ox) + (b[1]-oy)*(b[1]-oy);
    return da-db;
  });
  var stagger = clamp(1.1/Math.max(1,n), 0.022, 0.065);
  var job = { it:it, t:0, done:false, tiles:[] };
  for(i=0;i<n;i++){
    job.tiles.push({ tx:sorted[i][0], ty:sorted[i][1], ch:sorted[i][2],
                     delay:i*stagger, state:0, t2:0, seed:rnd() });
  }
  S.builds.push(job);
  sfx('charge');
}
function updateBuilds(dt){
  var i, j, job, t;
  for(i=S.builds.length-1;i>=0;i--){
    job = S.builds[i];
    job.t += dt;
    var alive = false;
    for(j=0;j<job.tiles.length;j++){
      t = job.tiles[j];
      if(t.state === 2) continue;
      alive = true;
      if(t.state === 0){
        if(job.t >= t.delay) t.state = 1;
      } else {
        t.t2 += dt;
        if(t.t2 >= 0.18){
          t.state = 2;
          setTile(t.tx, t.ty, t.ch);
          S.painted.push([t.tx,t.ty,t.ch]);
          var cx = t.tx*TILE+TILE/2, cy = t.ty*TILE+TILE/2;
          spark(cx, cy, {count:5, kind:'dust', color:'rgba(190,225,255,0.8)', speed0:30, speed1:120, grav:260, life0:0.25, life1:0.5, size0:1.4, size1:3});
          if(j % 3 === 0) sfxThrottled('pop', 0.07);
          if(j % 5 === 0) shake(1.4, 0.07);
        }
      }
    }
    if(!alive){
      job.done = true;
      S.builds.splice(i,1);
      sfx('switch');
      var it2 = job.it;
      if(it2.tiles && it2.tiles.length){
        var lx = 0, ly = 0, k;
        for(k=0;k<it2.tiles.length;k++){ lx += it2.tiles[k][0]; ly += it2.tiles[k][1]; }
        lx = (lx/it2.tiles.length)*TILE + TILE/2; ly = (ly/it2.tiles.length)*TILE + TILE/2;
        ringFX(lx, ly, 10, 70, 'rgba(103,232,249,0.8)', 0.5);
      }
    }
  }
}
function drawBuilds(g){
  var i, j, job, t, k, a, bx, by, sz;
  for(i=0;i<S.builds.length;i++){
    job = S.builds[i];
    for(j=0;j<job.tiles.length;j++){
      t = job.tiles[j];
      if(t.state === 2) continue;
      bx = t.tx*TILE; by = t.ty*TILE;
      if(t.state === 0){
        /* pending: a faint holographic outline so the player sees what is coming */
        a = 0.16 + 0.10*pulse(S.t + t.seed*3, 1.1);
        g.globalAlpha = a;
        g.lineWidth = 1.6; g.strokeStyle = C.cyan;
        rr(g,bx+2.5,by+2.5,TILE-5,TILE-5,4); g.stroke();
        g.globalAlpha = 1;
      } else {
        /* dropping in */
        k = clamp(t.t2/0.18,0,1);
        var e = easeOutCubic(k);
        var oy = (1-e)*46;
        sz = lerp(1.18, 1, e);
        g.globalAlpha = 0.28*(1-k);
        rr(g,bx+3,by+3,TILE-6,TILE-6,4); g.fillStyle = '#000'; g.fill();
        g.globalAlpha = clamp(0.35+e*0.65,0,1);
        g.save();
        g.translate(bx+TILE/2, by+TILE/2-oy);
        g.scale(sz,sz);
        rr(g,-TILE/2+1,-TILE/2+1,TILE-2,TILE-2,4);
        g.fillStyle = vgrad(g,0,-TILE/2,TILE/2,'#cfefff','#63b6e6'); g.fill();
        rr(g,-TILE/2+1,-TILE/2+1,TILE-2,TILE-2,4);
        g.lineWidth = 1.6; g.strokeStyle = 'rgba(255,255,255,0.85)'; g.stroke();
        rr(g,-TILE/2+4,-TILE/2+4,TILE-8,(TILE-8)*0.38,3);
        g.fillStyle = 'rgba(255,255,255,0.4)'; g.fill();
        g.restore();
        g.globalAlpha = 1;
      }
    }
  }
}

/* ========================================================================== */
/*                     DROPPER / CHUTE / COLLECTOR GEOMETRY                   */
/* ========================================================================== */

function layoutDropper(it){
  var padX = it.x*TILE, padY = it.y*TILE, padW = it.w*TILE, padH = it.h*TILE;
  var baseY = padY + padH;                       /* the floor line under the pad */
  if(it.mx != null) padX = it.mx*TILE;
  if(it.my != null) baseY = (it.my + (it.h||1))*TILE;

  var flip = it.flip;
  if(it.mx == null && !flip){
    /* auto-mirror if the machine would run off the right edge of the level */
    if((padX + 118) > (levelTilesWide()*TILE - 8)) flip = true;
  }

  var mw = 46, mh = 46, legs = 18;
  var mx = padX + 3;
  var my = baseY - legs - mh;

  var binW = 40, binH = 30;
  var binX = mx + mw + 24;
  var binY = baseY - binH;

  if(it.collectorAt){
    binX = it.collectorAt.x*TILE;
    binY = it.collectorAt.y*TILE + (it.collectorAt.h ? 0 : TILE - binH);
  }

  var geo = {
    flip: flip,
    mx:mx, my:my, mw:mw, mh:mh, legs:legs, baseY:baseY,
    binX:binX, binY:binY, binW:binW, binH:binH,
    nozzle:{ x: mx + mw*0.70, y: my + mh + 6 },
    mouth:{ x: binX + binW*0.5, y: binY + 5 }
  };
  /* the chute: nozzle -> a short lip -> the bin mouth */
  geo.path = [
    { x: geo.nozzle.x, y: geo.nozzle.y },
    { x: geo.nozzle.x + 4, y: geo.nozzle.y + 9 },
    { x: geo.mouth.x - 3, y: geo.mouth.y - 4 },
    { x: geo.mouth.x, y: geo.mouth.y + 7 }
  ];
  if(flip){
    /* mirror the whole rig around the pad's centre-left anchor */
    var ax = padX + padW;
    geo.mx = ax - (mx - padX) - mw;
    geo.binX = ax - (binX - padX) - binW;
    geo.nozzle.x = geo.mx + mw*0.30;
    geo.mouth.x = geo.binX + binW*0.5;
    geo.path = [
      { x: geo.nozzle.x, y: geo.nozzle.y },
      { x: geo.nozzle.x - 4, y: geo.nozzle.y + 9 },
      { x: geo.mouth.x + 3, y: geo.mouth.y - 4 },
      { x: geo.mouth.x, y: geo.mouth.y + 7 }
    ];
  }
  geo.segLen = []; geo.total = 0;
  for(var i=0;i<geo.path.length-1;i++){
    var dx = geo.path[i+1].x-geo.path[i].x, dy = geo.path[i+1].y-geo.path[i].y;
    var L = Math.sqrt(dx*dx+dy*dy);
    geo.segLen.push(L); geo.total += L;
  }
  geo.x0 = Math.min(geo.mx, geo.binX) - 10;
  geo.y0 = geo.my - 16;
  geo.x1 = Math.max(geo.mx+mw, geo.binX+binW) + 10;
  geo.y1 = geo.baseY + 6;
  return geo;
}
function pathAt(geo, dist){
  var d = clamp(dist, 0, geo.total), i;
  for(i=0;i<geo.segLen.length;i++){
    if(d <= geo.segLen[i] || i === geo.segLen.length-1){
      var k = geo.segLen[i] > 0 ? d/geo.segLen[i] : 1;
      k = clamp(k,0,1);
      return { x: lerp(geo.path[i].x, geo.path[i+1].x, k),
               y: lerp(geo.path[i].y, geo.path[i+1].y, k) };
    }
    d -= geo.segLen[i];
  }
  var last = geo.path[geo.path.length-1];
  return { x:last.x, y:last.y };
}
function pickDenom(cps){
  var ladder = [1,2,5,10,20,25,50,100,200,250,500,1000,2500,5000,10000];
  for(var i=0;i<ladder.length;i++){ if(ladder[i]/cps >= 0.55) return ladder[i]; }
  return Math.max(1, Math.round(cps*0.7));
}
function startDropper(it){
  var geo = layoutDropper(it);
  var cps = Math.max(0.01, it.cps || 1);
  var value = pickDenom(cps);
  var interval = clamp(value/cps, 0.35, 2.2);
  value = cps*interval;                       /* exact throughput, no drift */
  it.sim = {
    geo: geo, cps: cps, value: value, interval: interval,
    timer: interval*0.35, cubes: [], built: 0, total: 0,
    emitFlash: 0, recvFlash: 0, lid: 0, gear: 0, belt: 0, pumped: 0
  };
  var e1 = null, e2 = null;
  try{
    e1 = RT.spawn({ type:'dropper', px:true, x:geo.x0, y:geo.y0,
                    w:(geo.x1-geo.x0), h:(geo.y1-geo.y0),
                    item:it, tycoonToken:S.token });
    e2 = RT.spawn({ type:'collector', px:true, x:geo.binX, y:(geo.binY-10),
                    w:geo.binW, h:(geo.binH+10),
                    item:it, tycoonToken:S.token });
  }catch(err){ logErr(err); }
  if(e1){ it.ents.push(e1); S.ents.push(e1); }
  if(e2){ it.ents.push(e2); S.ents.push(e2); }
  spark(geo.mx+geo.mw/2, geo.my+geo.mh/2, {count:14, kind:'dust', color:'rgba(210,225,245,0.8)', speed0:40, speed1:140, grav:300, life0:0.3, life1:0.65, size0:1.8, size1:3.6});
  ringFX(geo.mx+geo.mw/2, geo.my+geo.mh/2, 8, 46, 'rgba(52,211,153,0.85)', 0.5);
}
function updateDroppers(dt){
  var i, j, it, sim, c, pt;
  for(i=0;i<S.items.length;i++){
    it = S.items[i];
    sim = it.sim;
    if(!it.bought || !sim) continue;
    if(sim.built < 1){ sim.built = clamp(sim.built + dt/0.42, 0, 1); }
    sim.gear += dt*2.6;
    sim.belt += dt*46;
    if(sim.emitFlash > 0) sim.emitFlash = Math.max(0, sim.emitFlash - dt*4.2);
    if(sim.recvFlash > 0) sim.recvFlash = Math.max(0, sim.recvFlash - dt*3.4);
    if(sim.lid > 0) sim.lid = Math.max(0, sim.lid - dt*3.0);

    sim.timer += dt;
    while(sim.timer >= sim.interval){
      sim.timer -= sim.interval;
      if(sim.cubes.length >= MAX_CUBES){
        /* too many in flight (off-screen grind) — bank it straight away */
        collect(it, sim.value, true);
      } else {
        sim.cubes.push({ d:0, spin:rrange(0,Math.PI*2), vs:rrange(-3.4,3.4), wob:rrange(0,6.2) });
        sim.emitFlash = 1; sim.pumped = 1;
        spark(sim.geo.nozzle.x, sim.geo.nozzle.y, {count:3, kind:'dust', color:'rgba(52,211,153,0.7)', speed0:20, speed1:70, grav:200, life0:0.18, life1:0.36, size0:1, size1:2});
      }
    }
    if(sim.pumped > 0) sim.pumped = Math.max(0, sim.pumped - dt*4);

    for(j=sim.cubes.length-1;j>=0;j--){
      c = sim.cubes[j];
      c.d += CUBE_SPEED*dt;
      c.spin += c.vs*dt;
      if(c.d >= sim.geo.total){
        sim.cubes.splice(j,1);
        collect(it, sim.value, false);
      }
    }
    /* cache positions for the renderer */
    for(j=0;j<sim.cubes.length;j++){
      c = sim.cubes[j];
      pt = pathAt(sim.geo, c.d);
      c.x = pt.x; c.y = pt.y;
    }
  }
}
function collect(it, value, silent){
  var sim = it.sim;
  var gain = value * S.mult;
  sim.total += gain;
  sim.recvFlash = 1; sim.lid = 1;
  addCash(gain, { x: sim.geo.binX + sim.geo.binW/2, y: sim.geo.binY - 6,
                  text: !silent, color: C.green, size: 11 });
  if(!silent){
    sfxThrottled('cash', 0.16);
    spark(sim.geo.mouth.x, sim.geo.mouth.y, {count:5, color:C.gold, color2:C.goldHi, speed0:40, speed1:120, grav:420, life0:0.25, life1:0.5, size0:1.4, size1:2.8, dir:-Math.PI/2});
  }
}

/* passive income for non-dropper items that still carry a cps */
function updatePassive(dt){
  var i, it, acc = 0;
  for(i=0;i<S.items.length;i++){
    it = S.items[i];
    if(it.bought && it.cps > 0 && !it.sim) acc += it.cps;
  }
  if(acc > 0){
    S.passiveBank = (S.passiveBank||0) + acc*S.mult*dt;
    if(S.passiveBank >= 1){
      var whole = Math.floor(S.passiveBank);
      S.passiveBank -= whole;
      var p = playerRect();
      addCash(whole, p ? { x:p.x+p.w/2, y:p.y-16, text:(whole>=5), color:C.green, size:10 } : { text:false });
    }
  }
}

/* ========================================================================== */
/*                                 COIN PICKUP                                */
/* ========================================================================== */

function awardCoin(value){
  if(!S) return;
  var v = value;
  if(typeof v !== 'number' || !(v > 0)) v = S.coinValue;
  var p = playerRect();
  addCash(v, p ? { x:p.x+p.w/2, y:p.y-14, color:C.gold, size:12 } : { text:false });
  if(p) spark(p.x+p.w/2, p.y-8, {count:6, color:C.gold, color2:C.goldHi, speed0:40, speed1:130, grav:360, life0:0.25, life1:0.5, size0:1.6, size1:3, dir:-Math.PI/2});
}
/* engine.js hands a pickup straight to RT.Tycoon.add() and then emits 'coin', so the
   cash FX are deferred one step: if the coin event lands in the same step we stay
   quiet and let the engine's own '+1' and coin sfx speak. */
function flushPendingFx(){
  var fx = S.pendingFx;
  if(!fx) return;
  var f = (typeof RT.frame === 'number') ? RT.frame : -1;
  if(f >= 0 && fx.frame === f) return;
  S.pendingFx = null;
  var p = playerRect();
  if(!p) return;
  var cx = p.x + p.w/2, cy = p.y + p.h*0.4;
  if(fx.coin){
    spark(cx, cy, {count:5, color:C.gold, color2:C.goldHi, speed0:40, speed1:130,
                   grav:340, life0:0.25, life1:0.5, size0:1.4, size1:2.8, dir:-Math.PI/2});
    return;
  }
  floatText(cx, p.y - 18, '+$'+fmtCash(fx.n), C.gold, 13);
  cashBurst(cx, cy, 10, -Math.PI/2);
  ringFX(cx, p.y + p.h/2, 5, 30, 'rgba(251,191,36,0.8)', 0.35);
  sfxThrottled('cash', 0.18);
}
function pollCoins(){
  var c = RT.coins|0;
  if(S.coinEvent){ S.lastCoins = c; return; }   /* the engine emits 'coin'; no diffing */
  if(c > S.lastCoins){
    var n = c - S.lastCoins;
    if(n > 40) n = 40;
    for(var i=0;i<n;i++) awardCoin(S.coinValue);
  }
  S.lastCoins = c;
}

/* ========================================================================== */
/*                                  RESPAWN                                   */
/* ========================================================================== */

function reapply(){
  /* a respawn may have restored the level's original tilemap — re-paint ours */
  var i, t;
  for(i=0;i<S.painted.length;i++){
    t = S.painted[i];
    if(getTile(t[0],t[1]) !== t[2]) setTile(t[0],t[1],t[2]);
  }
  applyAbilities();
}
function ensureEntities(){
  /* if something wiped our entities despite e.persistent, bring them back */
  var list = RT.entities, i, it, e, seen = {};
  if(!list) return;
  for(i=0;i<list.length;i++){ if(list[i]) seen[list[i].id] = true; }
  function alive(ent){ return !!(ent && !ent.dead && seen[ent.id]); }
  if(S.root && !alive(S.root)) S.root = spawnRoot();
  for(i=0;i<S.items.length;i++){
    it = S.items[i];
    if(!it.bought && it.btn && !alive(it.btn)){
      it.btn = null;
      if(requirementsMet(it)) spawnButton(it, true);
    }
    if(it.bought && it.sim){
      var need = false;
      for(var j=0;j<it.ents.length;j++){ if(!alive(it.ents[j])) { need = true; break; } }
      if(need){
        it.ents.length = 0;
        var geo = it.sim.geo;
        try{
          e = RT.spawn({ type:'dropper', px:true, x:geo.x0, y:geo.y0, w:(geo.x1-geo.x0), h:(geo.y1-geo.y0), item:it, tycoonToken:S.token });
          if(e){ it.ents.push(e); S.ents.push(e); }
          e = RT.spawn({ type:'collector', px:true, x:geo.binX, y:(geo.binY-10), w:geo.binW, h:(geo.binH+10), item:it, tycoonToken:S.token });
          if(e){ it.ents.push(e); S.ents.push(e); }
        }catch(err){ logErr(err); }
      }
    }
  }
}

/* ========================================================================== */
/*                                  HUD                                       */
/* ========================================================================== */

function hudText(){
  var s = '$'+fmtCash(S.cash);
  var inc = S.income*S.mult;
  if(inc > 0) s += '  +'+fmtRate(inc)+'/s';
  if(S.mult > 1.0001) s += '  x'+trimNum(S.mult);
  return s;
}
function updateHud(){
  var t = hudText();
  if(t !== S.hudLast){ S.hudLast = t; hudSet(S.hudKey, t); }
}

/* ========================================================================== */
/*                                 CORE TICK                                  */
/* ========================================================================== */

function core(dt){
  if(!(dt > 0)) dt = 1/60;
  if(dt > 0.25) dt = 0.25;
  S.t += dt;
  if(S.cashPop > 0) S.cashPop = Math.max(0, S.cashPop - dt*3.2);
  if(S.needReapply){ S.needReapply = false; reapply(); }
  applyAbilities();
  flushPendingFx();
  pollCoins();
  updateDroppers(dt);
  updatePassive(dt);
  updateBuilds(dt);
  updateParts(dt);
  updateHud();
  S.ensureT += dt;
  if(S.ensureT >= 0.5){ S.ensureT = 0; ensureEntities(); }
  /* keep the FX root glued to the player so culling can never hide our FX */
  if(S.root && RT.player){ S.root.x = RT.player.x - 16; S.root.y = RT.player.y - 16; }
}
function tickOnce(){
  if(!S || !S.running) return;
  var st = (typeof RT.frame === 'number') ? RT.frame : (typeof RT.time === 'number' ? RT.time : -1);
  if(st === tickStamp) return;
  tickStamp = st;
  try{ core(typeof RT.dt === 'number' ? RT.dt : 1/60); }
  catch(e){ logErr(e); }
}

/* ========================================================================== */
/*                          ICONS FOR THE BILLBOARDS                          */
/* ========================================================================== */

function drawIcon(g, kind, x, y, s, col, t){
  /* (x,y) = centre, s = box size */
  g.save(); g.translate(x,y);
  var h = s/2;
  if(kind === 'dropper'){
    poly(g,[[-h*0.8,-h*0.7],[h*0.8,-h*0.7],[h*0.4,0],[-h*0.4,0]]);
    g.fillStyle = col; g.fill();
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fillRect(-h*0.5,-h*0.55,h*0.9,h*0.2);
    var dy = ((t*26)%(h*1.4));
    drawCube(g, 0, h*0.15+dy*0.5, s*0.34, 0.2, C.goldHi, C.gold, C.goldLo, false);
  } else if(kind === 'platform'){
    var bw = s*0.34, bh = s*0.22, i, j;
    g.fillStyle = col;
    for(j=0;j<2;j++) for(i=0;i<2;i++){
      rr(g, -h*0.86 + i*(bw+2) + (j?bw*0.5:0), -h*0.3 + j*(bh+2), bw, bh, 1.5); g.fill();
    }
    g.fillStyle='rgba(255,255,255,0.3)';
    rr(g,-h*0.86,-h*0.3,bw,bh*0.4,1.2); g.fill();
  } else if(kind === 'doubleJump'){
    g.fillStyle = col;
    poly(g,[[0,-h*0.85],[h*0.7,-h*0.1],[-h*0.7,-h*0.1]]); g.fill();
    g.globalAlpha = 0.65;
    poly(g,[[0,-h*0.1],[h*0.7,h*0.65],[-h*0.7,h*0.65]]); g.fill();
    g.globalAlpha = 1;
  } else if(kind === 'dash'){
    g.fillStyle = col;
    poly(g,[[-h*0.1,-h*0.85],[h*0.8,-h*0.05],[h*0.12,-h*0.05],[h*0.28,h*0.85],[-h*0.8,-h*0.02],[-h*0.14,-h*0.02]]);
    g.fill();
  } else if(kind === 'lock'){
    g.strokeStyle = col; g.lineWidth = Math.max(1.4, s*0.12);
    g.beginPath(); g.arc(0, -h*0.22, h*0.42, Math.PI, Math.PI*2); g.stroke();
    g.fillStyle = col;
    rr(g, -h*0.62, -h*0.2, s*0.62, s*0.46, 2); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.beginPath(); g.arc(0, h*0.05, h*0.11, 0, Math.PI*2); g.fill();
  } else if(kind === 'gate' || kind === 'goal'){
    g.fillStyle = col;
    rr(g,-h*0.6,-h*0.8,s*0.6,s*0.8,3); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.beginPath(); g.arc(h*0.32,0,h*0.13,0,Math.PI*2); g.fill();
  } else {  /* cosmetic / default: a sparkle star */
    g.fillStyle = col;
    var k = 0.42 + 0.08*Math.sin(t*4);
    poly(g,[[0,-h*0.9],[h*k,-h*k],[h*0.9,0],[h*k,h*k],[0,h*0.9],[-h*k,h*k],[-h*0.9,0],[-h*k,-h*k]]);
    g.fill();
    g.fillStyle='rgba(255,255,255,0.55)';
    g.beginPath(); g.arc(-h*0.18,-h*0.18,h*0.18,0,Math.PI*2); g.fill();
  }
  g.restore();
}
function iconKindFor(it){
  if(it.icon) return it.icon;
  if(it.kind === 'ability') return it.ability === 'dash' ? 'dash' : 'doubleJump';
  return it.kind;
}

/* ========================================================================== */
/*                          ENTITY: tycoonroot (FX)                           */
/* ========================================================================== */

RT.defineEntity('tycoonroot', {
  layer: 'front',
  solid: false,
  init: function(e, def){
    e.persistent = true;
    e.tycoonToken = def ? def.tycoonToken : 0;
    e.w = 32; e.h = 32;
  },
  update: function(e){
    if(!S || e.tycoonToken !== S.token){ RT.remove(e); return; }
    tickOnce();
  },
  draw: function(e, g){
    if(!S || e.tycoonToken !== S.token) return;
    g.save();
    drawBuilds(g);
    drawParts(g);
    g.restore();
  },
  onPlayerDeath: function(){ if(S) S.needReapply = true; },
  onReset: function(){ if(S) S.needReapply = true; }
});
function spawnRoot(){
  var e = null;
  try{ e = RT.spawn({ type:'tycoonroot', x:0, y:0, w:1, h:1, tycoonToken:S.token }); }
  catch(err){ logErr(err); }
  if(e) S.ents.push(e);
  return e;
}

/* ========================================================================== */
/*                            ENTITY: buybutton                               */
/* ========================================================================== */

function padGeom(e){
  var cx = e.x + e.w/2;
  var base = e.y + e.h;
  var padW = Math.max(38, e.w - 10);
  var padH = 17;
  return { cx:cx, base:base, x:cx-padW/2, y:base-padH-2, w:padW, h:padH, top:7 };
}
function playerOnPad(e){
  var p = playerRect();
  if(!p || (RT.player && RT.player.dead)) return false;
  return overlapRects(p, { x:e.x-8, y:e.y-30, w:e.w+16, h:e.h+34 });
}

RT.defineEntity('buybutton', {
  layer: 'main',
  solid: false,
  init: function(e, def){
    e.persistent = true;
    e.item = def ? def.item : null;
    e.tycoonToken = def ? def.tycoonToken : 0;
    e.locked = !!(def && def.locked);
    e.phase = 'rise'; e.riseT = 0; e.sinkT = 0;
    e.hold = 0; e.aff = false; e.expand = 0;
    e.shakeT = 0; e.nagT = 0; e.anim = rnd()*6;
    e.bought = false;
  },
  update: function(e, dt){
    tickOnce();
    var it = e.item;
    if(!S || e.tycoonToken !== S.token || !it){ RT.remove(e); return; }
    e.anim += dt;
    if(e.shakeT > 0) e.shakeT = Math.max(0, e.shakeT - dt);
    if(e.nagT > 0) e.nagT = Math.max(0, e.nagT - dt);

    if(e.phase === 'rise'){
      e.riseT += dt;
      if(e.riseT >= RISE_T) e.phase = 'idle';
      return;
    }
    if(e.phase === 'sink'){
      e.sinkT += dt;
      if(e.sinkT >= SINK_T){ if(it.btn === e) it.btn = null; RT.remove(e); }
      return;
    }
    /* idle */
    var p = playerRect();
    var near = 0;
    if(p){
      var dx = Math.abs((p.x+p.w/2) - (e.x+e.w/2));
      var dy = Math.abs((p.y+p.h/2) - (e.y+e.h/2));
      near = (dx < TILE*3.4 && dy < TILE*3.2) ? 1 : 0;
    }
    e.expand = lerp(e.expand, near, clamp(dt*7,0,1));

    if(e.locked){
      e.aff = false; e.hold = 0;
      if(!requirementsMet(it)) return;
      /* the prerequisite just landed — the pad powers up */
      e.locked = false; e.phase = 'rise'; e.riseT = 0;
      var g0 = padGeom(e);
      ringFX(g0.cx, g0.y, 6, 36, 'rgba(103,232,249,0.85)', 0.5);
      spark(g0.cx, g0.y, {count:12, color:C.cyan, color2:'#ffffff', speed0:40, speed1:130, grav:150, life0:0.3, life1:0.65, size0:1.6, size1:3.2});
      sfxThrottled('pop', 0.08);
      return;
    }
    e.aff = affordable(it);

    var over = playerOnPad(e);
    if(over && e.aff){
      e.hold += dt;
      if(e.hold >= 0.08 && ((e.hold*60)|0) % 5 === 0){
        var gg = padGeom(e);
        spark(gg.cx + rrange(-gg.w/2, gg.w/2), gg.y, {count:1, color:C.ok, color2:'#ffffff', speed0:10, speed1:40, grav:-40, life0:0.3, life1:0.55, size0:1.2, size1:2.2, dir:-Math.PI/2});
      }
      if(e.hold >= S.buyHold){
        if(buyItem(it)){
          e.phase = 'sink'; e.sinkT = 0; e.bought = true;
        } else {
          e.hold = 0;
        }
      }
    } else if(over && !e.aff){
      e.hold = 0;
      if(e.nagT <= 0){
        e.nagT = 1.15; e.shakeT = 0.2;
        sfxThrottled('ui', 0.5);
      }
    } else {
      e.hold = Math.max(0, e.hold - dt*2.4);
    }
  },
  draw: function(e, g){
    if(!S || e.tycoonToken !== S.token || !e.item) return;
    drawBuyButton(e, g);
  },
  onPlayerDeath: function(e){ e.hold = 0; },
  onReset: function(e){ e.hold = 0; if(S) S.needReapply = true; }
});

function drawBuyButton(e, g){
  var it = e.item;
  var t = e.anim;
  var scale = 1, alpha = 1, sinkDy = 0, k;

  if(e.phase === 'rise'){
    k = clamp(e.riseT/RISE_T, 0, 1);
    scale = easeOutBack(k);
    alpha = clamp(k*2.2, 0, 1);
  } else if(e.phase === 'sink'){
    k = clamp(e.sinkT/SINK_T, 0, 1);
    sinkDy = easeInCubic(k)*26;
    alpha = clamp(1.15 - k*1.25, 0, 1);
    scale = 1 - 0.18*k;
  }
  if(alpha <= 0.01) return;

  var gm = padGeom(e);
  var locked = !!e.locked;
  /* affordability is read live: a pad that unlocks or gets funded mid-rise
     must not render a frame of stale state */
  var aff = !locked && e.phase !== 'sink' && affordable(it);
  var ratio = (locked || it.price <= 0) ? (locked ? 0 : 1) : clamp(S.cash/it.price, 0, 1);
  var holdK = clamp(e.hold/S.buyHold, 0, 1);

  var c1, c2, c3, rgb;
  if(e.phase === 'sink'){ c1 = C.gold; c2 = C.goldLo; c3 = '#7c4a06'; rgb = '251,191,36'; }
  else if(locked){ c1 = C.lk; c2 = C.lkLo; c3 = C.lkDk; rgb = '148,163,184'; }
  else if(aff){ c1 = C.ok; c2 = C.okLo; c3 = C.okDk; rgb = '74,222,128'; }
  else { c1 = C.no; c2 = C.noLo; c3 = C.noDk; rgb = '248,113,113'; }

  var shakeX = e.shakeT > 0 ? Math.sin(e.shakeT*80)*3.0*(e.shakeT/0.2) : 0;
  var bob = aff ? Math.sin(t*3.2)*1.4 : 0;

  g.save();
  g.globalAlpha = alpha;
  g.translate(gm.cx + shakeX, gm.base + sinkDy);
  g.scale(scale, scale);
  g.translate(-gm.cx, -gm.base);

  /* ---- ground shadow ---- */
  ellipseFill(g, gm.cx, gm.base + 1, gm.w*0.56, 5.5, 'rgba(0,0,0,0.30)');

  /* ---- affordable halo ---- */
  if(aff){
    var hp = 0.20 + 0.14*pulse(t, 1.15);
    halo(g, gm.cx, gm.y + gm.h*0.4, gm.w*0.95, rgb, hp);
  }

  var px = gm.x, py = gm.y + bob, pw = gm.w, ph = gm.h, tf = gm.top;

  /* ---- angled top face (a Roblox pad seen from the side) ---- */
  poly(g, [[px+7, py], [px+pw-7, py], [px+pw, py+tf], [px, py+tf]]);
  g.fillStyle = vgrad(g, 0, py, py+tf, c1, c2);
  g.fill();
  /* ---- front face ---- */
  rr(g, px, py+tf-1, pw, ph-tf+1, 3);
  g.fillStyle = vgrad(g, 0, py+tf, py+ph, c2, c3);
  g.fill();
  /* bright lip between faces */
  g.fillStyle = 'rgba(255,255,255,0.30)';
  g.fillRect(px+1, py+tf-1.5, pw-2, 1.6);
  /* outline */
  rr(g, px+0.5, py+0.5, pw-1, ph-1, 3);
  g.lineWidth = 1.2; g.strokeStyle = 'rgba(0,0,0,0.35)'; g.stroke();

  /* ---- studs on the angled face ---- */
  var studs = pw > 58 ? 3 : 2, si;
  for(si=0; si<studs; si++){
    var sxp = px + pw*(si+1)/(studs+1);
    stud(g, sxp, py + tf*0.45, 4.6, 2.1, c1, c3);
  }

  /* ---- affordability bar across the front face ---- */
  var bw = pw - 12, bx = px + 6, by = py + ph - 6.5;
  rr(g, bx, by, bw, 4, 2); g.fillStyle = 'rgba(0,0,0,0.42)'; g.fill();
  if(aff){
    /* fully funded: a slim travelling shimmer instead of a solid slab */
    var shW = bw*0.34, shX = bx + (bw + shW) * ((t*0.55) % 1) - shW;
    rr(g, bx, by, bw, 4, 2); g.fillStyle = 'rgba(253,230,138,0.45)'; g.fill();
    g.save(); rr(g, bx, by, bw, 4, 2); g.clip();
    var shg = g.createLinearGradient(shX, 0, shX + shW, 0);
    shg.addColorStop(0, 'rgba(255,255,255,0)');
    shg.addColorStop(0.5, 'rgba(255,255,255,0.85)');
    shg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = shg; g.fillRect(shX, by, shW, 4);
    g.restore();
  } else if(ratio > 0.001){
    rr(g, bx, by, Math.max(2.5, bw*ratio), 4, 2);
    g.fillStyle = 'rgba(255,255,255,0.72)';
    g.fill();
  }

  /* ---- hold-to-buy ring ---- */
  if(holdK > 0.02 && e.phase === 'idle'){
    var rx = gm.cx, ry = py - 4, rr0 = 17;
    g.beginPath(); g.arc(rx, ry, rr0, 0, Math.PI*2);
    g.lineWidth = 3.4; g.strokeStyle = 'rgba(0,0,0,0.45)'; g.stroke();
    g.beginPath(); g.arc(rx, ry, rr0, -Math.PI/2, -Math.PI/2 + Math.PI*2*holdK);
    g.lineWidth = 3.4; g.strokeStyle = C.goldHi; g.stroke();
    halo(g, rx, ry, 26, '253,230,138', 0.28*holdK);
  }

  /* ---- chevrons pointing at the pad when affordable ---- */
  if(aff && e.phase === 'idle'){
    var ci, cy0 = py - 16 - Math.sin(t*4)*2;
    g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 2.2; g.lineCap = 'round';
    for(ci=0; ci<2; ci++){
      var yy = cy0 - ci*6;
      g.globalAlpha = alpha * (0.75 - ci*0.3);
      g.beginPath();
      g.moveTo(gm.cx-7, yy); g.lineTo(gm.cx, yy+5); g.lineTo(gm.cx+7, yy);
      g.stroke();
    }
    g.globalAlpha = alpha;
    g.lineCap = 'butt';
  }
  g.restore();

  /* ---- floating billboard ---- */
  if(e.phase === 'sink'){
    var sk = clamp(e.sinkT/SINK_T, 0, 1);
    g.globalAlpha = clamp(1 - sk, 0, 1);
    txt(g, 'BOUGHT!', gm.cx, gm.y - 26 - sk*22, {size:15, color:C.goldHi, stroke:'rgba(0,0,0,0.6)', lw:4});
    g.globalAlpha = 1;
    return;
  }
  drawBillboard(e, g, it, alpha, aff, ratio, t, locked);
}

function drawBillboard(e, g, it, alpha, aff, ratio, t, locked){
  var cx = e.x + e.w/2;
  var bob = Math.sin(t*1.7)*2.0;
  var tail = e.y - 12 + bob;         /* where the pointer touches down */

  var name = it.name.toUpperCase();
  var priceStr = fmtCash(it.price);
  var short = Math.max(0, it.price - S.cash);
  var statusStr = locked ? 'LOCKED' : ((aff || short < 1) ? 'STEP ON' : ('NEED $' + fmtCash(short)));
  var desc = it.desc || (it.kind === 'dropper' && it.cps ? ('+' + fmtRate(it.cps) + ' cash / sec') : '');
  if(locked) desc = 'Requires ' + firstUnmet(it);

  /* layout: [icon well][name / price + status pill], description underneath */
  var PAD = 7, IW = 24, GAP = 8;
  var wName  = trackedWidth(g, name, 10, 1.3);
  var wPrice = 14 + widthOf(g, priceStr, 14, 900, true);
  var wPill  = widthOf(g, statusStr, 8, 900) + 11;
  var wDesc  = desc ? widthOf(g, desc, 9, 700) : 0;
  var wCol   = Math.max(wName, wPrice + 9 + wPill, wDesc);
  var w = Math.max(98, PAD + IW + GAP + wCol + PAD);
  var expand = e.expand * (desc ? 1 : 0);
  var h = 42 + 15*expand;
  var x = cx - w/2, y = tail - h;
  var rowA = y + 15, rowB = y + 31;

  var col = locked ? C.lk : (aff ? C.ok : C.no);
  var rgb = locked ? '148,163,184' : (aff ? '74,222,128' : '248,113,113');

  g.save();
  g.globalAlpha = alpha;

  /* stem */
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2.4;
  g.beginPath(); g.moveTo(cx, tail); g.lineTo(cx, e.y + e.h - 16); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(cx-1, tail); g.lineTo(cx-1, e.y + e.h - 16); g.stroke();

  /* halo behind the panel when affordable */
  if(aff) halo(g, cx, y + h/2, w*0.66, rgb, 0.13 + 0.07*pulse(t, 1.15));

  /* panel body */
  rr(g, x, y, w, h, 7);
  g.fillStyle = vgrad(g, 0, y, y+h, C.panel, C.panelLo);
  g.fill();
  rr(g, x+0.75, y+0.75, w-1.5, h-1.5, 6.5);
  g.lineWidth = 1.5; g.strokeStyle = col; g.stroke();
  rr(g, x+2, y+2, w-4, h*0.32, 5);
  g.fillStyle = 'rgba(255,255,255,0.055)'; g.fill();

  /* tail triangle */
  poly(g, [[cx-6, y+h-0.5], [cx+6, y+h-0.5], [cx, y+h+7]]);
  g.fillStyle = C.panelLo; g.fill();
  g.strokeStyle = col; g.lineWidth = 1.4;
  g.beginPath(); g.moveTo(cx-6, y+h-0.5); g.lineTo(cx, y+h+7); g.lineTo(cx+6, y+h-0.5); g.stroke();

  /* icon well with the affordability ring inside it */
  var ix = x + PAD, iy = y + PAD;
  rr(g, ix, iy, IW, IW, 5);
  g.fillStyle = vgrad(g, 0, iy, iy+IW, '#1d2a44', '#0d1524'); g.fill();
  rr(g, ix+0.5, iy+0.5, IW-1, IW-1, 5);
  g.lineWidth = 1; g.strokeStyle = 'rgba(255,255,255,0.14)'; g.stroke();
  var rcx = ix+IW/2, rcy = iy+IW/2, rad = IW*0.40;
  g.beginPath(); g.arc(rcx, rcy, rad, 0, Math.PI*2);
  g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,0.10)'; g.stroke();
  if(ratio > 0.001){
    g.beginPath(); g.arc(rcx, rcy, rad, -Math.PI/2, -Math.PI/2 + Math.PI*2*ratio);
    g.lineWidth = 2; g.strokeStyle = col; g.stroke();
  }
  drawIcon(g, locked ? 'lock' : iconKindFor(it), rcx, rcy, IW-12,
           locked ? 'rgba(226,232,240,0.55)' : (it.color || (aff ? C.goldHi : 'rgba(226,232,240,0.82)')), t);

  /* name */
  var colX = ix + IW + GAP;
  txtTracked(g, name, colX, rowA, {size:10, align:'left', track:1.3,
             color: locked ? 'rgba(241,245,249,0.72)' : C.ink, shadow:'rgba(0,0,0,0.6)'});

  /* price (static coin so a frozen frame never shows it edge-on) */
  drawCoin(g, colX + 6, rowB - 1, 5.4, 0.42);
  txt(g, priceStr, colX + 15, rowB, {size:14, mono:true, align:'left',
      color: locked ? C.lk : (aff ? C.goldHi : C.gold), shadow:'rgba(0,0,0,0.65)'});

  /* status pill, right-aligned on the price row */
  var sx = x + w - PAD - wPill, sy = rowB - 6;
  rr(g, sx, sy, wPill, 12, 6);
  g.fillStyle = locked ? 'rgba(148,163,184,0.18)' : (aff ? 'rgba(74,222,128,0.20)' : 'rgba(248,113,113,0.18)');
  g.fill();
  txt(g, statusStr, sx + wPill/2, sy + 6.2, {size:8, color: locked ? C.lk : (aff ? C.ok : C.no)});

  /* description (expands when the player is close) */
  if(desc && expand > 0.02){
    g.globalAlpha = alpha * clamp((expand-0.1)/0.9, 0, 1);
    txt(g, desc, cx, y + h - 12, {size:9, weight:700, color:C.dim});
    g.globalAlpha = alpha;
  }

  /* bottom progress bar */
  var pbw = w - 14, pbx = x + 7, pby = y + h - 5.5;
  rr(g, pbx, pby, pbw, 3, 1.5); g.fillStyle = 'rgba(255,255,255,0.10)'; g.fill();
  if(ratio > 0.001){
    rr(g, pbx, pby, Math.max(2, pbw*ratio), 3, 1.5);
    g.fillStyle = aff ? C.ok : C.gold; g.fill();
  }

  g.restore();
}

/* ========================================================================== */
/*                     ENTITY: dropper (machine + chute)                      */
/* ========================================================================== */

RT.defineEntity('dropper', {
  layer: 'main',
  solid: false,
  init: function(e, def){
    e.persistent = true;
    e.item = def ? def.item : null;
    e.tycoonToken = def ? def.tycoonToken : 0;
  },
  update: function(e){
    tickOnce();
    if(!S || e.tycoonToken !== S.token || !e.item || !e.item.sim) { RT.remove(e); return; }
  },
  draw: function(e, g){
    if(!S || e.tycoonToken !== S.token) return;
    var it = e.item;
    if(!it || !it.sim) return;
    drawChute(g, it);
    drawMachine(g, it);
    drawCubes(g, it);
  },
  onReset: function(){ if(S) S.needReapply = true; }
});

function drawMachine(g, it){
  var sim = it.sim, geo = sim.geo;
  var s = easeOutBack(clamp(sim.built, 0, 1));
  if(s <= 0.01) return;
  var t = S.t;
  var mx = geo.mx, my = geo.my, mw = geo.mw, mh = geo.mh;

  g.save();
  g.translate(mx + mw/2, my + mh + geo.legs);
  g.scale(s, s);
  g.translate(-(mx + mw/2), -(my + mh + geo.legs));

  /* shadow on the floor */
  ellipseFill(g, mx + mw/2, geo.baseY - 1, mw*0.55, 5, 'rgba(0,0,0,0.28)');

  /* legs */
  g.strokeStyle = C.m3; g.lineWidth = 4; g.lineCap = 'round';
  g.beginPath();
  g.moveTo(mx + 8, my + mh - 2); g.lineTo(mx + 3, geo.baseY - 2);
  g.moveTo(mx + mw - 8, my + mh - 2); g.lineTo(mx + mw - 3, geo.baseY - 2);
  g.stroke();
  g.strokeStyle = C.m2; g.lineWidth = 2;
  g.beginPath();
  g.moveTo(mx + 8, my + mh - 2); g.lineTo(mx + 3, geo.baseY - 2);
  g.moveTo(mx + mw - 8, my + mh - 2); g.lineTo(mx + mw - 3, geo.baseY - 2);
  g.stroke();
  g.lineCap = 'butt';
  /* cross brace */
  g.strokeStyle = C.m3; g.lineWidth = 2.4;
  g.beginPath();
  g.moveTo(mx + 6, geo.baseY - 9); g.lineTo(mx + mw - 6, geo.baseY - 9);
  g.stroke();

  /* hopper funnel on top */
  var hy = my - 11;
  poly(g, [[mx + 3, hy], [mx + mw - 3, hy], [mx + mw - 9, my + 3], [mx + 9, my + 3]]);
  g.fillStyle = vgrad(g, 0, hy, my + 3, C.m1, C.m2); g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1; g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.18)';
  g.fillRect(mx + 5, hy + 1.5, mw - 10, 2);
  /* coins bubbling in the hopper */
  var hi;
  for(hi = 0; hi < 2; hi++){
    var ph = t*1.6 + hi*2.6;
    var hx = mx + mw*0.5 + Math.sin(ph)*(mw*0.22);
    var hyy = hy + 4 + Math.abs(Math.cos(ph*0.8))*5;
    drawCoin(g, hx, hyy, 3.2, ph*2);
  }

  /* body */
  rr(g, mx, my, mw, mh, 5);
  g.fillStyle = vgrad(g, 0, my, my + mh, C.m1, C.m3); g.fill();
  rr(g, mx + 0.5, my + 0.5, mw - 1, mh - 1, 5);
  g.lineWidth = 1.2; g.strokeStyle = 'rgba(0,0,0,0.45)'; g.stroke();
  rr(g, mx + 2, my + 2, mw - 4, mh*0.3, 3.5);
  g.fillStyle = 'rgba(255,255,255,0.13)'; g.fill();

  /* rivets */
  g.fillStyle = 'rgba(255,255,255,0.22)';
  g.beginPath(); g.arc(mx + 4, my + 5, 1.5, 0, Math.PI*2);
  g.arc(mx + mw - 4, my + 5, 1.5, 0, Math.PI*2); g.fill();

  /* window with tumbling cash */
  var wx = mx + 6, wy = my + 9, ww = mw - 22, wh = mh - 22;
  rr(g, wx, wy, ww, wh, 3);
  g.fillStyle = '#062019'; g.fill();
  g.save();
  rr(g, wx, wy, ww, wh, 3); g.clip();
  var ci2, cyy;
  for(ci2 = 0; ci2 < 2; ci2++){
    cyy = wy + ((t*30 + ci2*19) % (wh + 10)) - 5;
    g.save();
    g.translate(wx + ww*0.3 + ci2*ww*0.42, cyy);
    g.rotate(Math.sin(t*1.4 + ci2)*0.3);
    g.fillStyle = C.green; rr(g, -4, -4, 8, 8, 1.6); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(-4, -4, 8, 2.4);
    g.restore();
  }
  g.fillStyle = 'rgba(52,211,153,0.10)'; g.fillRect(wx, wy, ww, wh);
  g.restore();
  rr(g, wx + 0.5, wy + 0.5, ww - 1, wh - 1, 3);
  g.lineWidth = 1; g.strokeStyle = 'rgba(103,232,249,0.30)'; g.stroke();

  /* spinning gear on the right */
  var gx = mx + mw - 10, gy = my + mh*0.42, gr0 = 6.4;
  drawGear(g, gx, gy, gr0, 7, sim.gear, C.m1, C.m3);

  /* pump piston (kicks on each emit) */
  var pk = easeOutQuad(sim.pumped);
  var pistX = mx + mw - 10, pistY = my + mh*0.74 + pk*3;
  g.fillStyle = C.m2; g.fillRect(pistX - 3, pistY - 4, 6, 8);
  g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(pistX - 3, pistY - 4, 6, 2);

  /* LED rate plate */
  ledPlate(g, mx + 3, my + mh - 9, mw - 6, 7.5, '+' + fmtRate(sim.cps * S.mult) + '/s', C.green, 6.4);

  /* status lamp */
  var lampOn = 0.45 + 0.55*pulse(t*1.4 + 0.3, 1);
  g.fillStyle = 'rgba(52,211,153,' + (0.35 + lampOn*0.6).toFixed(2) + ')';
  g.beginPath(); g.arc(mx + 5.5, my + 5.5, 2.1, 0, Math.PI*2); g.fill();

  /* nozzle */
  var nz = geo.nozzle;
  poly(g, [[nz.x - 6, nz.y - 8], [nz.x + 6, nz.y - 8], [nz.x + 3.4, nz.y], [nz.x - 3.4, nz.y]]);
  g.fillStyle = vgrad(g, 0, nz.y - 8, nz.y, C.m2, C.m4); g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 1; g.stroke();
  if(sim.emitFlash > 0.02){
    halo(g, nz.x, nz.y, 13, '52,211,153', 0.45*sim.emitFlash);
    g.fillStyle = 'rgba(167,243,208,' + (0.8*sim.emitFlash).toFixed(2) + ')';
    g.fillRect(nz.x - 3.2, nz.y - 2, 6.4, 2);
  }
  g.restore();
}

function drawGear(g, x, y, r, teeth, rot, c1, c2){
  var i, a, r2 = r*1.32;
  g.save(); g.translate(x, y); g.rotate(rot);
  g.beginPath();
  for(i = 0; i < teeth; i++){
    a = (i/teeth)*Math.PI*2;
    var a2 = ((i + 0.5)/teeth)*Math.PI*2;
    g.lineTo(Math.cos(a)*r2, Math.sin(a)*r2);
    g.lineTo(Math.cos(a + 0.16)*r2, Math.sin(a + 0.16)*r2);
    g.lineTo(Math.cos(a2)*r, Math.sin(a2)*r);
  }
  g.closePath();
  g.fillStyle = c1; g.fill();
  g.lineWidth = 1; g.strokeStyle = c2; g.stroke();
  g.beginPath(); g.arc(0, 0, r*0.38, 0, Math.PI*2);
  g.fillStyle = c2; g.fill();
  g.restore();
}

function drawChute(g, it){
  var sim = it.sim, geo = sim.geo;
  var s = clamp(sim.built*1.25 - 0.15, 0, 1);
  if(s <= 0.01) return;
  var p = geo.path, i;
  g.save();
  g.globalAlpha = s;

  /* under-shadow */
  g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 9; g.lineJoin = 'round'; g.lineCap = 'round';
  g.beginPath();
  g.moveTo(p[0].x, p[0].y + 3);
  for(i = 1; i < p.length; i++) g.lineTo(p[i].x, p[i].y + 3);
  g.stroke();

  /* the rail body */
  g.strokeStyle = C.m3; g.lineWidth = 8;
  g.beginPath();
  g.moveTo(p[0].x, p[0].y);
  for(i = 1; i < p.length; i++) g.lineTo(p[i].x, p[i].y);
  g.stroke();
  g.strokeStyle = C.m2; g.lineWidth = 5.2;
  g.beginPath();
  g.moveTo(p[0].x, p[0].y);
  for(i = 1; i < p.length; i++) g.lineTo(p[i].x, p[i].y);
  g.stroke();

  /* moving belt ties (one path, one stroke) */
  var total = geo.total, d, pt, pt2, nx, ny, ang;
  var off = (sim.belt % 14);
  g.strokeStyle = 'rgba(255,255,255,0.20)'; g.lineWidth = 1.5;
  g.beginPath();
  for(d = off; d < total; d += 14){
    pt = pathAt(geo, d);
    pt2 = pathAt(geo, Math.min(total, d + 1.5));
    ang = Math.atan2(pt2.y - pt.y, pt2.x - pt.x) + Math.PI/2;
    nx = Math.cos(ang)*2.6; ny = Math.sin(ang)*2.6;
    g.moveTo(pt.x - nx, pt.y - ny); g.lineTo(pt.x + nx, pt.y + ny);
  }
  g.stroke();
  /* top highlight */
  g.strokeStyle = 'rgba(255,255,255,0.16)'; g.lineWidth = 1.2;
  g.beginPath();
  g.moveTo(p[0].x, p[0].y - 2.4);
  for(i = 1; i < p.length; i++) g.lineTo(p[i].x, p[i].y - 2.4);
  g.stroke();

  /* rollers at each end: a disc with one spoke, cheaper than a gear */
  var rollA = sim.belt*0.09, ri2, rp;
  for(ri2 = 0; ri2 < 2; ri2++){
    rp = ri2 ? p[p.length-1] : p[0];
    g.beginPath(); g.arc(rp.x, rp.y, 3.6, 0, Math.PI*2);
    g.fillStyle = C.m1; g.fill();
    g.beginPath();
    g.moveTo(rp.x - Math.cos(rollA)*3, rp.y - Math.sin(rollA)*3);
    g.lineTo(rp.x + Math.cos(rollA)*3, rp.y + Math.sin(rollA)*3);
    g.strokeStyle = C.m4; g.lineWidth = 1.3; g.stroke();
  }

  g.lineJoin = 'miter'; g.lineCap = 'butt';
  g.restore();
}

function drawCubes(g, it){
  var sim = it.sim, i, c;
  for(i = 0; i < sim.cubes.length; i++){
    c = sim.cubes[i];
    if(c.x == null) continue;
    var wob = Math.sin(S.t*8 + c.wob)*0.8;
    drawCube(g, c.x, c.y - 5 + wob, 11, c.spin*0.25, '#6ee7b7', C.green, '#047857', true);
  }
}

/* ========================================================================== */
/*                           ENTITY: collector (bin)                          */
/* ========================================================================== */

RT.defineEntity('collector', {
  layer: 'main',
  solid: false,
  init: function(e, def){
    e.persistent = true;
    e.item = def ? def.item : null;
    e.tycoonToken = def ? def.tycoonToken : 0;
  },
  update: function(e){
    tickOnce();
    if(!S || e.tycoonToken !== S.token || !e.item || !e.item.sim){ RT.remove(e); return; }
  },
  draw: function(e, g){
    if(!S || e.tycoonToken !== S.token) return;
    var it = e.item;
    if(!it || !it.sim) return;
    drawCollector(g, it);
  },
  onReset: function(){ if(S) S.needReapply = true; }
});

function drawCollector(g, it){
  var sim = it.sim, geo = sim.geo;
  var s = easeOutBack(clamp(sim.built*1.15 - 0.15, 0, 1));
  if(s <= 0.01) return;
  var x = geo.binX, y = geo.binY, w = geo.binW, h = geo.binH;
  var t = S.t;

  g.save();
  g.translate(x + w/2, y + h);
  g.scale(s, s);
  g.translate(-(x + w/2), -(y + h));

  ellipseFill(g, x + w/2, y + h + 1, w*0.58, 4.6, 'rgba(0,0,0,0.30)');

  /* receive glow */
  if(sim.recvFlash > 0.02) halo(g, x + w/2, y + 4, w*0.9, '251,191,36', 0.4*sim.recvFlash);

  /* box body */
  rr(g, x, y, w, h, 4);
  g.fillStyle = vgrad(g, 0, y, y + h, C.m1, C.m3); g.fill();
  rr(g, x + 0.5, y + 0.5, w - 1, h - 1, 4);
  g.lineWidth = 1.2; g.strokeStyle = 'rgba(0,0,0,0.45)'; g.stroke();
  /* front plate */
  rr(g, x + 3, y + 8, w - 6, h - 12, 3);
  g.fillStyle = vgrad(g, 0, y + 8, y + h - 4, C.m2, C.m4); g.fill();

  /* intake mouth (dark slot with a glowing lip) */
  var mw2 = w - 12, mx2 = x + 6;
  rr(g, mx2, y + 1.5, mw2, 6, 2.5);
  g.fillStyle = '#05080e'; g.fill();
  g.fillStyle = 'rgba(103,232,249,' + (0.35 + 0.3*pulse(t, 1.5)).toFixed(2) + ')';
  g.fillRect(mx2 + 1, y + 1.8, mw2 - 2, 1.4);

  /* flap lid — flips open on a receive */
  var lid = easeOutCubic(sim.lid);
  g.save();
  g.translate(mx2, y + 2);
  g.rotate(-lid*1.15);
  g.fillStyle = C.m1;
  rr(g, 0, -2.6, mw2*0.52, 2.8, 1.2); g.fill();
  g.restore();
  g.save();
  g.translate(mx2 + mw2, y + 2);
  g.rotate(lid*1.15);
  g.fillStyle = C.m1;
  rr(g, -mw2*0.52, -2.6, mw2*0.52, 2.8, 1.2); g.fill();
  g.restore();

  /* LED total */
  ledPlate(g, x + 5, y + 11, w - 10, 9, '$' + fmtCash(sim.total), C.gold, 7.2);

  /* gauge needle that jumps on a receive */
  var gx = x + w/2, gy = y + h - 7.5, gr0 = 5.2;
  g.beginPath(); g.arc(gx, gy, gr0, Math.PI, Math.PI*2);
  g.fillStyle = '#0a1018'; g.fill();
  g.lineWidth = 1; g.strokeStyle = 'rgba(255,255,255,0.18)'; g.stroke();
  var need = Math.PI + Math.PI*(0.18 + 0.64*clamp(sim.recvFlash + 0.12*pulse(t*2, 1.7), 0, 1));
  g.strokeStyle = sim.recvFlash > 0.1 ? C.gold : C.green; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(gx, gy);
  g.lineTo(gx + Math.cos(need)*gr0*0.85, gy + Math.sin(need)*gr0*0.85);
  g.stroke();

  /* antenna + blinker */
  g.strokeStyle = C.m2; g.lineWidth = 1.4;
  g.beginPath(); g.moveTo(x + w - 5, y + 1); g.lineTo(x + w - 3, y - 7); g.stroke();
  var blink = pulse(t*1.6, 1);
  g.fillStyle = 'rgba(251,191,36,' + (0.3 + blink*0.65).toFixed(2) + ')';
  g.beginPath(); g.arc(x + w - 3, y - 8, 1.9, 0, Math.PI*2); g.fill();

  /* "COLLECTOR" micro label */
  txtTracked(g, 'COLLECTOR', x + w/2, y + h - 1.5, {size:4.6, color:'rgba(226,232,240,0.55)', track:0.9});

  g.restore();
}

/* ========================================================================== */
/*                            ENTITY: cashpad                                 */
/* ========================================================================== */
/* kind 'display' (default): a plinth showing CASH and INCOME.
   kind 'rebirth': the PRESTIGE pad — stand on it to call RT.Tycoon.rebirth(). */

RT.defineEntity('cashpad', {
  layer: 'main',
  solid: false,
  init: function(e, def){
    e.persistent = true;
    e.tycoonToken = def ? def.tycoonToken : 0;
    e.kind = (def && def.kind) || 'display';
    e.cost = (def && def.cost) || 0;
    e.mult = (def && def.mult) || 2;
    e.label = (def && def.label) || (e.kind === 'rebirth' ? 'PRESTIGE' : 'TYCOON BANK');
    e.hold = 0; e.anim = rnd()*6; e.used = 0; e.nagT = 0; e.armed = true;
  },
  update: function(e, dt){
    tickOnce();
    if(!S || e.tycoonToken !== S.token){ RT.remove(e); return; }
    e.anim += dt;
    if(e.used > 0) e.used = Math.max(0, e.used - dt*1.2);
    if(e.nagT > 0) e.nagT = Math.max(0, e.nagT - dt);
    if(e.kind !== 'rebirth') return;
    var can = S.cash + 1e-9 >= e.cost;
    var over = playerOnPad(e);
    if(!over){ e.armed = true; }            /* step off the pad to re-arm it */
    if(over && can && e.armed && e.used <= 0){
      e.hold += dt;
      if(e.hold >= S.buyHold*1.8){
        e.hold = 0; e.used = 1; e.armed = false;
        spendCash(e.cost);
        doRebirth(e.mult);
      }
    } else if(over && !can){
      e.hold = 0;
      if(e.nagT <= 0){ e.nagT = 1.2; sfxThrottled('ui', 0.5); }
    } else {
      e.hold = Math.max(0, e.hold - dt*2.4);
    }
  },
  draw: function(e, g){
    if(!S || e.tycoonToken !== S.token) return;
    drawCashPad(e, g);
  },
  onReset: function(e){ e.hold = 0; }
});

function drawCashPad(e, g){
  var t = e.anim;
  var cx = e.x + e.w/2, base = e.y + e.h;
  var w = Math.max(50, e.w - 6), x = cx - w/2;
  var h = 15, y = base - h - 2;
  var isReb = e.kind === 'rebirth';
  var can = isReb ? (S.cash + 1e-9 >= e.cost) : true;
  var c1 = isReb ? (can ? C.purple : C.lk) : C.gold;
  var c2 = isReb ? (can ? '#7e22ce' : C.lkLo) : C.goldLo;
  var c3 = isReb ? '#3b0764' : '#7c4a06';
  var rgb = isReb ? (can ? '192,132,252' : '148,163,184') : '251,191,36';

  g.save();

  ellipseFill(g, cx, base + 1, w*0.56, 5, 'rgba(0,0,0,0.30)');
  if(can) halo(g, cx, y + h*0.3, w*0.8, rgb, 0.14 + 0.09*pulse(t, 1.4));

  /* plinth */
  poly(g, [[x + 6, y], [x + w - 6, y], [x + w, y + 6], [x, y + 6]]);
  g.fillStyle = vgrad(g, 0, y, y + 6, c1, c2); g.fill();
  rr(g, x, y + 5, w, h - 5, 3);
  g.fillStyle = vgrad(g, 0, y + 5, y + h, c2, c3); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.28)'; g.fillRect(x + 1, y + 4.6, w - 2, 1.4);
  rr(g, x + 0.5, y + 0.5, w - 1, h - 1, 3);
  g.lineWidth = 1.1; g.strokeStyle = 'rgba(0,0,0,0.38)'; g.stroke();
  var si, studs = 3;
  for(si = 0; si < studs; si++) stud(g, x + w*(si + 1)/(studs + 1), y + 2.6, 4.2, 1.9, c1, c3);

  if(isReb){
    /* hold ring */
    if(e.hold > 0.02){
      var hk = clamp(e.hold/(S.buyHold*1.8), 0, 1);
      g.beginPath(); g.arc(cx, y - 3, 13, 0, Math.PI*2);
      g.lineWidth = 3.2; g.strokeStyle = 'rgba(0,0,0,0.45)'; g.stroke();
      g.beginPath(); g.arc(cx, y - 3, 13, -Math.PI/2, -Math.PI/2 + Math.PI*2*hk);
      g.lineWidth = 3.2; g.strokeStyle = '#e9d5ff'; g.stroke();
    }
    /* panel */
    var pw2 = Math.max(96, w + 16), px2 = cx - pw2/2, ph2 = 44, py2 = y - 16 - ph2 + Math.sin(t*1.6)*1.8;
    rr(g, px2, py2, pw2, ph2, 7);
    g.fillStyle = vgrad(g, 0, py2, py2 + ph2, C.panel, C.panelLo); g.fill();
    rr(g, px2 + 0.75, py2 + 0.75, pw2 - 1.5, ph2 - 1.5, 6.5);
    g.lineWidth = 1.5; g.strokeStyle = can ? C.purple : C.lk; g.stroke();
    txtTracked(g, e.label.toUpperCase(), cx, py2 + 11, {size:10, color:'#e9d5ff', shadow:'rgba(0,0,0,0.6)', track:1.6});
    txt(g, 'RESET UNLOCKS  ·  INCOME x' + trimNum(e.mult), cx, py2 + 23, {size:8, weight:700, color:C.dim});
    drawCoin(g, cx - widthOf(g, fmtCash(e.cost), 13, 900, true)/2 - 7, py2 + 35, 5.2, t*2.6);
    txt(g, fmtCash(e.cost), cx + 6, py2 + 35.5, {size:13, mono:true, color: can ? C.goldHi : C.gold, shadow:'rgba(0,0,0,0.6)'});
    var ratio2 = e.cost > 0 ? clamp(S.cash/e.cost, 0, 1) : 1;
    rr(g, px2 + 7, py2 + ph2 - 5.5, pw2 - 14, 3, 1.5);
    g.fillStyle = 'rgba(255,255,255,0.10)'; g.fill();
    if(ratio2 > 0.001){
      rr(g, px2 + 7, py2 + ph2 - 5.5, Math.max(2, (pw2 - 14)*ratio2), 3, 1.5);
      g.fillStyle = can ? C.purple : C.gold; g.fill();
    }
  } else {
    /* the bank: spinning coin + big readout */
    var pop = 1 + 0.12*S.cashPop;
    drawCoin(g, cx, y - 16 + Math.sin(t*2)*1.6, 8*pop, t*2.2);
    var pw3 = Math.max(84, w + 14), px3 = cx - pw3/2, py3 = y - 46;
    rr(g, px3, py3, pw3, 26, 6);
    g.fillStyle = vgrad(g, 0, py3, py3 + 26, C.panel, C.panelLo); g.fill();
    rr(g, px3 + 0.75, py3 + 0.75, pw3 - 1.5, 24.5, 5.5);
    g.lineWidth = 1.4; g.strokeStyle = C.gold; g.stroke();
    ledPlate(g, px3 + 4, py3 + 3.5, pw3 - 8, 11, '$' + fmtCash(S.cash), C.gold, 9);
    txt(g, '+' + fmtRate(S.income*S.mult) + '/s' + (S.mult > 1.0001 ? ('   x' + trimNum(S.mult)) : ''),
        cx, py3 + 20, {size:8, weight:700, color:C.green});
  }
  g.restore();
}

/* ========================================================================== */
/*                                  REBIRTH                                   */
/* ========================================================================== */

function keepOnRebirth(it){
  if(it.keepOnRebirth === true) return true;
  if(it.keepOnRebirth === false) return false;
  if(S.cfg.rebirthResetAll) return false;
  /* never strip traversal the player may be standing on / needs to survive */
  return it.kind === 'platform' || it.kind === 'ability';
}
function doRebirth(mult){
  if(!S) return false;
  var m = (typeof mult === 'number' && mult > 0) ? mult : (S.cfg.rebirthMult || 2);
  var i, it, j;

  for(i = 0; i < S.items.length; i++){
    it = S.items[i];
    if(!it.bought || keepOnRebirth(it)) continue;
    it.bought = false;
    if(it.sim){
      for(j = 0; j < it.ents.length; j++){ try{ RT.remove(it.ents[j]); }catch(e){} }
      it.ents.length = 0;
      it.sim = null;
    }
    if(it.kind === 'cosmetic') S.flags[it.flag || it.id] = false;
    if(it.kind === 'ability' && it.ability) S.abilities[it.ability] = false;
    if(it.btn){ try{ RT.remove(it.btn); }catch(e){} it.btn = null; }
  }
  S.rebirths++;
  S.mult *= m;
  S.cash = S.cfg.rebirthCash || 0;
  S.passiveBank = 0;
  recomputeIncome();
  refreshAvailability(true);
  updateHud();

  var p = playerRect();
  if(p){
    var cx = p.x + p.w/2, cy = p.y + p.h/2;
    ringFX(cx, cy, 10, 120, 'rgba(192,132,252,0.95)', 0.7);
    ringFX(cx, cy, 6, 80, 'rgba(255,255,255,0.9)', 0.5);
    cashBurst(cx, cy, 30);
    spark(cx, cy, {count:26, color:C.purple, color2:'#f5d0fe', speed0:90, speed1:280, grav:180, life0:0.5, life1:1.1, size0:2, size1:4.6});
  }
  flashFX('rgba(216,180,254,0.55)', 0.28);
  shake(7, 0.35);
  hitstop(4);
  sfx('powerup'); sfxThrottled('win', 0.01);
  banner(['REBIRTH #' + S.rebirths, 'INCOME x' + trimNum(S.mult)], 1.8);
  try{ if(RT.emit) RT.emit('tycoonRebirth', S.rebirths, S.mult); }catch(e){}
  return true;
}

/* ========================================================================== */
/*                              EVENT HOOKS                                   */
/* ========================================================================== */

function wireEvents(){
  if(typeof RT.on !== 'function') return;
  var tok = S.token;
  try{
    RT.on('coin', function(a){
      if(!S || S.token !== tok || !S.running) return;
      S.coinEvent = true;                       /* the engine tells us; stop diffing RT.coins */
      var f = (typeof RT.frame === 'number') ? RT.frame : -1;
      if(S.extAddFrame === f){
        /* engine.js already called RT.Tycoon.add(value) for this pickup */
        if(S.pendingFx) S.pendingFx.coin = true;
        S.lastCoins = RT.coins|0;
        return;
      }
      var v = null;
      if(typeof a === 'number') v = a;
      else if(a && typeof a.value === 'number') v = a.value;
      awardCoin(v != null ? v * (S.cfg.coinScale || 1) : S.coinValue);
      S.lastCoins = RT.coins|0;
    });
  }catch(e){}
  var reapplyEvents = ['respawn','death','playerDeath','checkpoint','levelReset'];
  for(var i = 0; i < reapplyEvents.length; i++){
    (function(name){
      try{
        RT.on(name, function(){
          if(!S || S.token !== tok || !S.running) return;
          S.needReapply = true;
        });
      }catch(e){}
    })(reapplyEvents[i]);
  }
}
/* a couple of harmless debug conveniences, only if the engine did not make them */
function wireDbg(){
  var d = window.__dbg;
  if(!d) return;
  if(typeof d.giveCash !== 'function') d.giveCash = function(n){ return RT.Tycoon.add(n||0); };
  if(typeof d.tycoonState !== 'function') d.tycoonState = function(){ return RT.Tycoon.state(); };
  if(typeof d.tycoonBuy !== 'function') d.tycoonBuy = function(id){ return RT.Tycoon.buy(id, {free:true}); };
}

/* ========================================================================== */
/*                               PUBLIC  API                                  */
/* ========================================================================== */

function startTycoon(cfg){
  cfg = cfg || {};
  stopTycoon();
  S = newSession(cfg);

  var defs = cfg.items || [], i, it;
  for(i = 0; i < defs.length; i++){
    if(!defs[i]) continue;
    it = normItem(defs[i], i);
    if(S.byId[it.id]){ logErr('duplicate tycoon item id "' + it.id + '"'); }
    S.items.push(it);
    S.byId[it.id] = it;
  }

  S.root = spawnRoot();
  /* optional furniture */
  if(cfg.cashpad){
    try{
      var e1 = RT.spawn({ type:'cashpad', x:cfg.cashpad.x, y:cfg.cashpad.y,
                          w:cfg.cashpad.w || 2, h:cfg.cashpad.h || 1,
                          kind:'display', label:cfg.cashpad.label, tycoonToken:S.token });
      if(e1) S.ents.push(e1);
    }catch(e){ logErr(e); }
  }
  if(cfg.rebirth){
    try{
      var e2 = RT.spawn({ type:'cashpad', x:cfg.rebirth.x, y:cfg.rebirth.y,
                          w:cfg.rebirth.w || 2, h:cfg.rebirth.h || 1,
                          kind:'rebirth', cost:cfg.rebirth.cost || 0,
                          mult:cfg.rebirth.mult || cfg.rebirthMult || 2,
                          label:cfg.rebirth.label || 'PRESTIGE', tycoonToken:S.token });
      if(e2) S.ents.push(e2);
    }catch(e){ logErr(e); }
  }

  refreshAvailability(true);
  recomputeIncome();
  wireEvents();
  wireDbg();
  updateHud();

  API.active = true;
  return API;
}

function stopTycoon(){
  if(!S) return;
  S.running = false;
  var i;
  for(i = 0; i < S.ents.length; i++){ try{ if(S.ents[i]) RT.remove(S.ents[i]); }catch(e){} }
  hudClear(S.hudKey);
  S = null;
  tickStamp = -1;
  API.active = false;
}

var API = {
  active: false,

  start: startTycoon,
  stop: stopTycoon,

  /* cash is a live accessor so it can never go stale for __dbg.state() */
  add: function(n){
    if(!S) return 0;
    n = Number(n) || 0;
    if(n <= 0) return 0;
    addCash(n, { text:false });
    var f = (typeof RT.frame === 'number') ? RT.frame : -1;
    if(S.pendingFx && S.pendingFx.frame === f) S.pendingFx.n += n;
    else S.pendingFx = { n:n, frame:f, coin:false };
    S.extAddFrame = f;
    updateHud();
    return n;
  },
  spend: function(n){
    if(!S) return false;
    n = Number(n) || 0;
    var ok = spendCash(n);
    if(ok){
      updateHud();
      var p = playerRect();
      if(p) floatText(p.x + p.w/2, p.y - 18, '-$' + fmtCash(n), C.no, 12, 0.9);
    }
    return ok;
  },
  has: function(id){ return !!(S && S.byId[id] && S.byId[id].bought); },
  flag: function(name){ return !!(S && S.flags[name]); },
  item: function(id){ return S ? (S.byId[id] || null) : null; },
  price: function(id){ return (S && S.byId[id]) ? S.byId[id].price : 0; },
  canAfford: function(id){ return !!(S && S.byId[id] && affordable(S.byId[id])); },

  buy: function(id, opts){
    if(!S) return false;
    var it = S.byId[id];
    if(!it || it.bought) return false;
    opts = opts || {};
    if(!opts.force && !requirementsMet(it)) return false;
    var ok = buyItem(it, { free: !!opts.free });
    if(ok && it.btn){ it.btn.phase = 'sink'; it.btn.sinkT = 0; }
    return ok;
  },

  rebirth: function(mult){ return doRebirth(mult); },

  setMult: function(m){
    if(!S || !(m > 0)) return false;
    S.mult = m; updateHud(); return true;
  },
  multiplier: function(){ return S ? S.mult : 1; },

  state: function(){
    if(!S) return { active:false, cash:0, income:0, mult:1, rebirths:0, bought:[], items:[] };
    var bought = [], items = [], i, it;
    for(i = 0; i < S.items.length; i++){
      it = S.items[i];
      if(it.bought) bought.push(it.id);
      items.push({
        id: it.id, name: it.name, price: it.price, kind: it.kind, cps: it.cps,
        bought: it.bought, visible: !!it.btn,
        available: !it.bought && requirementsMet(it),
        affordable: !it.bought && affordable(it)
      });
    }
    return {
      active: true,
      cash: Math.round(S.cash*100)/100,
      income: Math.round(S.income*S.mult*100)/100,
      baseIncome: S.income,
      mult: S.mult, rebirths: S.rebirths,
      earned: Math.round(S.earned), spent: Math.round(S.spent),
      bought: bought, items: items,
      building: S.builds.length, time: Math.round(S.t*100)/100
    };
  },

  /* a level may drive the sim by hand; harmless if it never does */
  update: function(dt){ if(S && S.running){ try{ core(dt || (RT.dt || 1/60)); }catch(e){ logErr(e); } } }
};

/* live cash accessor (getter + setter so nothing breaks if someone assigns) */
try{
  Object.defineProperty(API, 'cash', {
    get: function(){ return S ? Math.round(S.cash*100)/100 : 0; },
    set: function(v){ if(S){ S.cash = Math.max(0, Number(v) || 0); updateHud(); } },
    enumerable: true, configurable: true
  });
  Object.defineProperty(API, 'income', {
    get: function(){ return S ? S.income*S.mult : 0; },
    enumerable: true, configurable: true
  });
  Object.defineProperty(API, 'mult', {
    get: function(){ return S ? S.mult : 1; },
    enumerable: true, configurable: true
  });
  Object.defineProperty(API, 'rebirths', {
    get: function(){ return S ? S.rebirths : 0; },
    enumerable: true, configurable: true
  });
}catch(e){
  API.cash = 0; API.income = 0; API.mult = 1; API.rebirths = 0;
}

RT.Tycoon = API;

})();
