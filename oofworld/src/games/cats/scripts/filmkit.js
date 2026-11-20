// src/games/cats/scripts/filmkit.js - the Canvas 2D film kit for "Biscuit's Story" (the 21 movies).
// Film modules import ONLY this file:   import * as K from "../filmkit.js";
// It re-exports four sibling modules (filmcore, filmcat, filmpeople, filmenv, filmpost). Everything
// is a pure function of its arguments (static art is cached by key), so draw(g, t, W, H) stays a
// pure function of t. No timers, no storage, no WebGL. Films draw in a 960 x 540 logical space;
// the player scales the context for bigger canvases and calls setPixelScale() for the layers.
//
// API (one line each; o = options object, all optional):
//  math     rng(seed)->()=>[0,1)  hash(n,seed)  clamp(v,a=0,b=1)  lerp(a,b,t)  smooth(t)  seg(t,a,b)
//           ease.{in,out,inOut,sine,back}(t)  env(t,a,b,in,out) fade envelope  noise(x,seed) fbm(x,seed)
//           flash(t,[times],len) lightning brightness 0..1  ik(ax,ay,bx,by,l1,l2,bend)
//  colour   mix(c1,c2,t)  rgba(c,a)  shade(c,+-amt)  haze(c,hazeColor,amt)  parseColor(c)
//  canvas   layer(W,H,key)->{canvas,g}  sprite(key,w,h,paint)->canvas  setPixelScale(s)  makeCanvas(w,h)
//           spline(path,pts,closed)  sampleSpline(pts,closed,n)  tube(path,pts,widths)  ellipsePath  roundRect
//           crescent(g,path,dx,dy,color,alpha,box,mode)  glow(g,x,y,r,color,alpha)  within(g,fn)
//  sky      sky(g,W,H,{top,mid,bottom,horizon})  sunGlow(g,x,y,r,color,strength)  moon(g,x,y,r,{glow})
//           stars(g,W,H,seed,density,twinkleT,{yMax})  clouds(g,W,H,t,{seed,color,shade,count,y,spread,speed,scale,alpha})
//           godRays(g,x,y,W,H,{color,count,strength,t,angle,spread,length})  fog(g,W,H,{y,h,color,alpha,t,fill})
//           lightningBolt(g,x0,y0,x1,y1,seed,{alpha,width})
//  weather  rain(g,W,H,t,{density,angle,color,speed,len,width})  splashes(g,W,H,t,{y0,y1,x0,x1,density})
//           glassDrops(g,x,y,w,h,t,{seed,density})  dust(g,W,H,t,{seed,color,count,size,area})
//           fireflies(g,W,H,t,{seed,count,color,area})  leaves(g,W,H,t,{seed,count,wind,toward,pull})
//  land     grass(g,x0,x1,y,{seed,color,height,t,wind,density})  tree(g,x,y,scale,{seed,leaf,trunk,t,kind})
//           hills(g,W,H,{y,amp,color,seed,haze,hazeAmt})  stone(g,x,y,w,h,{seed,color,wet})
//           fence(g,x0,x1,y,h,{color,gap:[xa,xb],night})  house(g,x,y,scale,{lit:[0..4],night,t})
//           room(g,W,H,{wall,floor,night,horizon,lamp:{x,y,color},window:{x,y,w,h,outside(g,x,y,w,h)},rain,t})
//           bed(g,x,y,w,{quilt})  streetlamp(g,x,y,h,{on,t,color,flicker})  cardboardBox(g,x,y,w,h,{wet,text})
//           puddleReflection(g,drawFn,y,alpha,{x0,x1,ripple,t,tint,clip})
//  motifs   pawprints(g,[{x,y,a,s,alpha}],glow)  pawTrail(x0,y0,x1,y1,n,t,{start,every,life,s0,s1})->points
//           portal(g,x,y,r,t,{color,core,intensity,tilt,open})  drawBell(g,x,y,size,{t,glint,string})
//           bellGlint(g,x,y,size,t,{strength})  toyMouse(g,x,y,size,{facing})
//  beings   drawCat(g,x,y,size,o)  size = shoulder height; o: pose sit|stand|walk|run|sleep|loaf|look|pounce,
//             phase, facing, headTurn, headTilt, t, tail, tailUp, blink, eyesGlow, pupil, dark, wet, ears,
//             mouth, gaze, light:{x,y,color,strength}, coat (COATS.grey|black|cream|siamese|tuxedo|calico),
//             collar, bell, shadow, ground, alpha, glint          BISCUIT / COATS colour sets
//           drawPerson(g,x,y,h,o)  o: view back|side, facing, walk|run, phase, hood, flashlight, flashAngle,
//             flashLen, bell, reach, crouch, wet, light, coat, pants, boots, hair, alpha
//           drawHand(g,x,y,size,o)  o: angle, pose reach|open|hold|point|cup, left, item flashlight|poster|photo|bell,
//             bell, light, t        flashlightBeam(g,x,y,angle,len,{spread,alpha})
//  camera   withCamera(g,W,H,{x,y,zoom,rot,shakeT,shakeAmt},fn)  dof(g,layerCanvas,blurPx,alpha)
//           blurLayer(W,H,key,blurPx,fn)->layer  focus(g,W,H,blurPx,fn,key)
//  post     bloom(g,amount)  vignette(g,W,H,strength)  grain(g,W,H,t,amount)  grade(g,W,H,{tint,alpha,mode,lift,shadows})
//           lensFlare(g,x,y,W,H,strength)  chromatic(g,W,H,amount)  letterbox(g,W,H,amount,bar=0.085)
//           fadeBlack(g,W,H,a)  fadeColor(g,W,H,a,color)  title(g,W,H,text,sub,alpha,{y,size})
//           subtitle(g,W,H,text,alpha)  finish(g,W,H,t,{bloom,tint,tintAlpha,mode,vignette,grain,letterbox})
//  v2 realism (see ../REALISM.md for recipes):
//  textures texture(name,o) texRect(g,name,x,y,w,h,o) texFill(g,name,path,o) texPattern texAvg texBake(key,w,h,fn)
//           texPrewarm(list,budgetMs) texNoise texFbm texRidged texVoronoi TEXTURE_NAMES texCacheStats
//           groundPlane(g,W,H,{tex,horizon,scale,camX,camZ,fog,wet,sky,puddles,...})
//  light    cloudLayer3d volumetricBeam lightPool shadowBlob aoEdge bokehLights heatShimmer reflectStreak
//  lens     the player runs every frame through a GPU lens (filmlens.js): bloom/vignette/grain/chromatic
//           calls on the main context become lens hints; film.grade / film.gradeAt(t) set the look.
//           setLensTarget(g) lensActive(g) takeLensHints() are for the player and tools only.

export * from "./filmcore.js";
export * from "./filmcat.js";
export * from "./filmpeople.js";
export * from "./filmenv.js";
export * from "./filmpost.js";
