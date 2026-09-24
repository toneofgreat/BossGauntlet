# RAGE TRIALS — Architecture Contract (BINDING)

A 10-level, mobile-first 2D platformer for www.platyfy.com. Plain HTML/JS/CSS, 2D canvas,
no frameworks, no build step, no external assets (all art procedural, all audio synthesised).
It is a subdirectory game: `rage-trials/index.html` is opened directly from GitHub Pages, so
**every path is relative, and no `fetch()` of local files** (scripts load via `<script src>` only).

Every agent that writes code MUST follow this file exactly. If you must extend the API, extend it
in a backwards-compatible way and note it at the bottom under "Amendments".

## 1. Files

```
rage-trials/
  index.html          shell: CSS, DOM (canvas, HUD, touch pads, menus/overlays), loads scripts IN ORDER,
                      then calls RT.boot()
  engine.js           creates window.RT; loop, input, player physics, tiles, collision, camera,
                      themes/background, particles, HUD, level flow, save, menus, __dbg
  entities.js         the entity library (RT.defineEntity for every type in §6)
  audio.js            RT.Audio: synthesised SFX + music (WebAudio, no files)
  modes/tetris.js     RT.Tetris: authentic NES-Tetris minigame (uses RT.setMode)
  modes/tycoon.js     RT.Tycoon: cash / droppers / buy-buttons used by levels 8 and 10
  levels/level01.js … levels/level10.js   one RT.registerLevel(n, {...}) each
  docs/               research + DESIGN.md (not shipped to players, harmless)
  CONTRACT.md         this file
```

Script order in index.html: engine.js, audio.js, entities.js, modes/tetris.js, modes/tycoon.js,
levels/level01.js … level10.js, then inline `<script>RT.boot()</script>`.
`engine.js` is the ONLY file allowed to create `window.RT`; every other file does
`(function(){ var RT = window.RT; ... })();` and attaches to it. No ES modules, no `import`.

## 2. Coordinates, units, simulation

- World unit = pixel. **TILE = 32 px.** `y` grows downward. Tile (tx,ty) covers
  `[tx*32, tx*32+32) x [ty*32, ty*32+32)`. Level row 0 is the TOP of the level.
- Fixed-step simulation: **60 Hz, dt = 1/60 s**, accumulator in the rAF loop, max 5 steps/frame.
  Speeds are px/s, accelerations px/s^2, timers in seconds.
- `RT.frame` (step counter), `RT.time` (seconds in level, pauses on menus), `RT.dt` (= 1/60).
- Rendering is separate from simulation. NOTHING gameplay-relevant may depend on rAF timing
  (headless browsers throttle rAF). `__dbg.step(n)` advances n fixed steps synchronously.

## 3. Viewport, camera, mobile layout

- Canvas fills the window; `devicePixelRatio` honoured up to a cap of 2.
- Zoom rule: the **shorter** screen axis always shows exactly **11 tiles** (352 world px).
  Landscape ⇒ ~11 tiles tall x 19–22 wide; portrait ⇒ ~11 wide x 22–24 tall.
  Designers: assume the player sees **at least 5 tiles ahead horizontally and 5 above/below**.
- `RT.cam = {x, y, zoom, shake(power, dur)}`, (x,y) = world point at screen centre. Horizontal
  look-ahead ~2 tiles toward facing, vertical dead-zone, damping, clamped to level bounds.
  A level may set `cameraLockY: true`.
- `RT.view = {w, h}` = visible world size in px (changes on resize/rotate).
- `RT.screenToWorld(sx,sy)`, `RT.worldToScreen(wx,wy)`.
- Touch controls (DOM in index.html, wired by engine.js): LEFT/RIGHT bottom-left, JUMP (big) and
  ACTION bottom-right; min 64 px, 16 px from edges, `touch-action:none`, pointer events with
  per-pointerId tracking, no tap highlight, no double-tap zoom, `overscroll-behavior:none`.
  Keyboard: A/D or arrows move, Space/W/Up/Z/K jump, E/X/J/Enter action, R retry, Esc/P pause.
  Body gets class `touch` on first touch.

## 4. Player physics (engine.js implements exactly; designers rely on these)

| thing | value |
|---|---|
| hitbox | 20 x 28 px, origin `p.x,p.y` = top-left |
| max run speed | 210 px/s (6.6 tiles/s) |
| ground accel / decel | max in 0.10 s / stop in 0.07 s |
| air accel | max in 0.18 s |
| jump velocity | -560 px/s |
| gravity rising | 1550 px/s^2 |
| gravity falling | 2200 px/s^2 |
| apex hang | while rising and abs(vy) < 45, gravity x 0.55 |
| jump cut | release jump while rising ⇒ vy *= 0.45 (once) |
| terminal velocity | 900 px/s |
| coyote time | 6 frames |
| jump buffer | 8 frames |
| corner correction | up to 6 px nudge when the head clips a corner |
| hazard test | player box inset 3 px each side |
| spike hitbox | the spike tile inset 6 px on non-pointing sides |

Consequences designers MUST honour: **a jump clears 3 tiles of height** (3-tile wall climbable,
4 is not); **max gap at full run ~4.5 tiles ⇒ 4 is the hard limit, 3 comfortable, 2 easy**; a
standing jump crosses 2 tiles. A 1-tile pit is fallable (player is 20 px wide). Springs launch at
-900 px/s (~7.5 tiles). `RT.player.abilities = {doubleJump:false, dash:false}` (levels/tycoon may
enable). `RT.player.controlsReversed`, `RT.player.gravityFlip` exist for troll levels.
Falling below `level.height*32 + 64` kills ("the void"). Level left/right edges are solid; no
ceiling kill.

Death: `RT.killPlayer(cause)` → 0.55 s death FX → respawn at checkpoint (or spawn) with a 0.25 s
shimmer. `RT.deaths` and `RT.save.totalDeaths` increment. Entities get `onPlayerDeath`, level gets
`onDeath`. Everything one-shot (crumbled platforms, popped traps) resets on respawn unless
`e.persistent = true`.

## 5. Level definition (levels/levelNN.js)

```js
(function(){ var RT = window.RT;
RT.registerLevel(4, {
  name: 'TRUST ISSUES', subtitle: 'Fake and real platforms',
  theme: 'ruins',                                   // key of RT.THEMES or a theme object
  themeZones: [{x0:0, x1:40, theme:'meadow'}],      // optional, tile units, by player x
  music: 'ruins',                                   // RT.Audio track name
  tiles: [                                          // rows top→bottom, ALL same length
    '..............................',
    'P.....^.......................',
    '###########..#####....F..FF###'
  ],
  entities: [ {type:'mover', x:12.5, y:6, w:3, path:[[12.5,6],[18,6]], speed:2.5} ], // TILES
  intro: ['Some platforms are FAKE.', 'Look closely.'],
  onLoad(RT){}, onUpdate(RT, dt){}, onDraw(RT, g, layer){}, // layer 'back' | 'front'
  onDeath(RT, cause){}, onWin(RT){}, onCheckpoint(RT, cp){},
  tileHook(ch, tx, ty){ return {type:'trapspike', x:tx, y:ty, dir:'up'} } // digits / unknown letters
});
})();
```

`RT.registerLevel(n, def)` stores `RT.LEVELS[n]`. Levels are 1..10. Level size is
`tiles[0].length*32 x tiles.length*32`; at least 24x11 tiles, at most 400x60.

### Tile legend (engine-owned; digits and unknown letters go to `tileHook`)

| char | meaning |
|---|---|
| `.` / space | empty |
| `#` | solid block (theme-textured, auto-bevelled) |
| `-` | one-way platform (solid from above) |
| `^` `v` `<` `>` | spike pointing up / down / left / right (kills) |
| `F` | FAKE platform: looks like `#` with a subtle tell (darker top, no rim highlight, faint 2.5 s flicker); no collision |
| `K` | crumble platform: falls 0.35 s after being stood on, returns 2.5 s later |
| `S` | spring |
| `C` | checkpoint flag |
| `G` | goal (exit door) — wins the level |
| `P` | player spawn (exactly one) |
| `o` | coin (level score AND tycoon cash when a tycoon is active) |
| `L` | lava (animated, kills) |
| `X` | kill block (solid-looking void block, kills) |
| `I` | invisible block: solid, drawn only after a bonk |
| `M` / `N` | ON/OFF blocks: `M` solid while ON, `N` solid while OFF (ghosted when off) |
| `!` | ON/OFF switch (0.4 s cooldown) |
| `B` | breakable block (hit from below or dash) |
| `~` | decorative water surface (no physics) |
| `0`-`9`, other letters | passed to `level.tileHook(ch,tx,ty)`; descriptor spawned, tile becomes empty |

## 6. Entity API

```js
RT.defineEntity('mover', {
  layer: 'main',            // 'back' | 'main' | 'front'
  solid: true,              // false | true | 'oneway' — collides like tiles and CARRIES the player
  init(e, def){}, update(e, dt){}, draw(e, g){},
  onPlayerTouch(e, p, side){},  // 'top'|'bottom'|'left'|'right'|'overlap'
  onPlayerDeath(e){}, onReset(e){}, onRemove(e){}
});
```

Instance fields guaranteed: `e.type, e.x, e.y` (px, top-left), `e.w, e.h` (px), `e.vx, e.vy,
e.def, e.id, e.dead, e.persistent, e.state, e.t`. Level descriptors give `x,y,w,h` in TILES
(default w=1,h=1); the engine converts at spawn. Solid entities move via `e.vx/e.vy` or by setting
`e.x/e.y` in `update` (engine carries a player standing on top).

Engine services:

```
RT.spawn(def) → e        RT.remove(e)         RT.entities            RT.find(type) → []
RT.player {x,y,w,h,vx,vy,onGround,facing,dead,abilities,controlsReversed,gravityFlip,jumpsLeft}
RT.killPlayer(cause)     RT.winLevel()        RT.setCheckpoint(px,py) RT.respawn()
RT.getTile(tx,ty)        RT.setTile(tx,ty,ch) RT.solidAtPx(x,y)      RT.rectHitsSolid(rect)
RT.overlaps(a,b)         RT.onOff             RT.toggleOnOff()       RT.groups  RT.keys
RT.particles.burst(x,y,opts)   RT.particles.emit(x,y,kind)
RT.cam.shake(power,dur)  RT.flash(color,dur)  RT.hitstop(frames)     RT.slowmo(factor,dur)
RT.toast(t,dur)  RT.speech(x,y,t,dur)  RT.banner(lines,dur)  RT.hud.set(k,t)  RT.hud.clear(k)
RT.Audio.sfx(name)  RT.Audio.music(name)  RT.Audio.stopMusic()
RT.input {left,right,jump,jumpPressed,jumpReleased,action,actionPressed,pointer:{x,y,down,justDown,justUp}}
RT.random()  RT.seed(n)  RT.lerp  RT.clamp  RT.rectsOverlap
RT.drawText(g,text,x,y,opts)  RT.roundRect(g,x,y,w,h,r)
RT.setMode(mode) / RT.clearMode()   // mode = {update(dt), draw(g,screenW,screenH), onKey?(e)}
RT.level  RT.levelIndex  RT.deaths  RT.coins  RT.save  RT.saveNow()
RT.overlay.show(html, {onClose})  RT.overlay.hide()   // DOM overlay for shops/dialogs
RT.emit(evt, ...)  RT.on(evt, fn)
```

### Built-in entity types (entities.js implements all; params in tiles unless noted)

| type | params | behaviour |
|---|---|---|
| `mover` | `w,h,path,speed,loop,pause` | solid moving platform, carries the player |
| `faller` | `w` | falls 0.4 s after being stood on; resets on respawn |
| `spring` | `dir,power` | bounces the player (default 900) |
| `walker` | `dir,speed,range` | patrols, turns at edges; stomp kills it (bounce -350), side touch kills player |
| `flyer` | `path,speed` | flying enemy; stompable from above |
| `thwomp` | `h,triggerW,fallSpeed,riseSpeed` | shakes 0.3 s, slams, rests 0.6 s, rises |
| `cannon` | `dir,every,speed,phase,aim` | fires `ball` projectiles |
| `saw` | `path,speed,r` | spinning blade, kills |
| `laser` | `w|h,on,off,phase` | kills while on; 0.3 s charge warning |
| `beatblock` | `w,h,group('A'/'B'),period` | alternating solid blocks, 0.25 s warning flash |
| `switch` | `group,once` | toggles `RT.groups[group]`, emits `switch` |
| `toggleblock` | `w,h,group,invert` | solid when its group is on |
| `door` | `h,key|group` | solid until unlocked |
| `key` | `key` | collectable, sets `RT.keys[key]` |
| `portal` | `to:[x,y],color` | teleports with FX |
| `wind` | `w,h,fx,fy` | push zone |
| `conveyor` | `w,speed` | solid moving surface |
| `trapspike` | `dir,trigger('near'/'stand'),delay` | hidden spikes that pop out |
| `fallingceiling` | `w,h,triggerW` | drops when the player passes below |
| `fakegoal` | | looks like `G`; trolls the player back 6 tiles |
| `sign` | `text,w` | speech bubble within 2 tiles |
| `text` | `text,size,color` | world-space decorative text |
| `deco` | `kind` | tree/bush/rock/torch/skull/crystal/pipe/flag/grave/cloud/girder/lamp |
| `launcher` | `angle,power,auto,rotate` | FLINGING MACHINE: holds the player, ACTION fires along `angle`; sweeps when `rotate`; dotted trajectory preview |
| `coin` | `value` | coin at fractional coords |
| `checkpoint` | | same as `C` |
| `ball` | `vx,vy` (px/s) | cannon projectile |
| `balloon` | `dur` | P-balloon: gravity 0.15x, jump = flap, for `dur` s |
| `mushroom` | `poison` | real = one-hit shield; poison = kills |
| `lavaball` | `every,power` | podoboo |

## 7. Themes (engine.js)

`RT.THEMES[name] = {sky:[[stop,color],…], parallax:[{kind,color,y,speed,scale}], ambient:
'dust'|'embers'|'snow'|'fireflies'|'ash'|'bubbles'|'none', fog:{color,alpha}, tile:{top,side,dark,
rim,accent}, spike:{base,tip}, vignette}`. Parallax kinds: mountains, hills, city, ruins, volcano,
clouds, stars, nebula, pipes, factory, castle.
Required names: `meadow, sunset, void, ruins, volcano, factory, tycoon, troll, apocalypse, smb1,
smw, smb3, galaxy, sm3dw, odyssey`. Tiles auto-bevel (rim highlight, side shading, dark bottom,
cached noise on an offscreen canvas per theme — never per frame).

## 8. Flow, save, HUD

- Menu → level select (10 cards, locked until the previous is beaten; `?unlock` unlocks all,
  `?level=N` starts level N).
- HUD (DOM): level name top-left, deaths + timer top-right, coins/cash when used, pause button.
  Pause menu: resume, restart, level select, sound, controls (pads on/off, left-handed).
- Win: results card (time, deaths, coins) → NEXT LEVEL. After 10 → THE END with a rage rating.
- Save: localStorage `rageTrialsSave` = `{v:1, unlocked, best:{[n]:{time,deaths}}, totalDeaths,
  totalTime, settings:{sound,pads,lefty}}`. Saved on win, every 10th death, on pause.
- `window.__dbg` (ALWAYS present; tests depend on it):
  `level(n)` · `state()` → `{level,x,y,vx,vy,onGround,dead,deaths,time,checkpoint,won,mode,coins,cash}` ·
  `tp(tx,ty)` · `hold({left,right,jump,action})` · `tap(name)` · `step(n)` (synchronous fixed steps) ·
  `win()` · `kill()` · `god(b)` · `noclip(b)` · `entities()` · `tile(tx,ty)` · `setTile(tx,ty,ch)` ·
  `giveCash(n)` · `tetris(level)` · `tetrisState()` · `tetrisInput(name)` · `unlockAll()` · `errors`.
  While stepping, the rAF loop must not double-advance (`RT.manual = true` until `__dbg.resume()`).

## 9. Audio (audio.js)

`RT.Audio = {unlock(), sfx(name), music(name), stopMusic(), setEnabled(b), enabled}`. Unlock on
first pointerdown/keydown. SFX: `jump, doublejump, land, step, coin, cash, buy, death, spike,
spring, checkpoint, win, switch, door, key, portal, launch, charge, laser, thwomp, crumble, fake,
troll, pop, bonk, stomp, hurt, balloon, powerup, poison, ui, tick, tetrisMove, tetrisRotate,
tetrisLock, tetrisClear, tetrisTetris, tetrisOver, tetrisLevel`.
Music (looping, lookahead-scheduled, <= 3 voices, chiptune): `meadow, sunset, void, ruins, volcano,
mario1, mario2, mario3, factory, tycoon, troll, apocalypse, menu, korobeiniki`.

## 10. Tetris mode (modes/tetris.js)

`RT.Tetris.start({level:28, linesToWin:10, onWin, onLose, onQuit})` calls `RT.setMode` and owns the
canvas. Authentic NES rules: 10x20 board, gravity by level (18 = 3 frames/cell, 19–28 = 2, 29+ = 1),
NES randomizer (re-roll once on repeat), NES spawn orientation, NO hold, NO ghost, soft drop,
line-clear animation, ARE entry delay, score 40/100/300/1200 x (level+1), level +1 per 10 lines,
next-piece preview, the level-8 palette (28 mod 10) for level 28.
Controls: keyboard left/right (DAS 10 initial / 2 repeat — a deliberate concession), down soft
drop, Z/X or Up rotate, Space hard drop (concession). Touch: tap left/right of the board = move,
hold = DAS, tap centre or swipe up = rotate, swipe down = hard drop, drag = soft drop, plus big
on-screen buttons. Top out → TOP OUT → retry. Own HUD (LEVEL, LINES x/10, SCORE, NEXT) and a CRT
bezel. `__dbg.tetrisState()` exposes board/piece/lines/over.

## 11. Tycoon (modes/tycoon.js)

`RT.Tycoon.start({cash, items:[{id,name,price,x,y,w,h,kind:'dropper'|'platform'|'ability'|'cosmetic',
cps,tiles:[[tx,ty,ch]],onBuy,requires}], hudKey})`. Creates a BUY BUTTON entity per item: shows
name+price, greyed until affordable, touch to buy (sfx, particles). `dropper` produces `cps`
cash/second with visible falling cubes; `platform` paints `tiles` into the level with a build-in
animation; `ability` toggles `RT.player.abilities`. `RT.Tycoon.cash`, `.add(n)`, `.stop()`.
Coins add to cash while active. Cash persists across deaths inside the level.

## 12. Visual bar

Layered parallax with depth fog, animated sky per theme, soft shadow under player/enemies, squash
& stretch, dust puffs on land/turn, death explosion (>= 40 particles + shockwave + shake + 4-frame
hit-stop), spike gleam, lava bob, spinning sparkling coins, waving checkpoint flag, goal light
beam, vignette, intro banner. 60 fps on a mid phone: cache static tiles to an offscreen canvas per
chunk (re-render only on tile change), cap particles at 600, never `shadowBlur` in per-frame loops.

## 13. Testing

Headless: node + puppeteer at `C:/Users/krist/Desktop/BossGauntlet/node_modules/puppeteer`
(require by absolute path). Serve the repo root (`npx http-server -p 8099`) and open
`http://localhost:8099/rage-trials/index.html?level=N`. Drive with `__dbg` (`hold`, `tap`, `step`)
— never rely on rAF for progress. Every level ships a scripted route in
`docs/routes/levelNN.json` (array of `{hold:{...}, steps:n}`) that reaches G with legal inputs,
proving it is beatable.

## Amendments

(append here, dated, if an agent had to extend the API)

### 2026-09-20 — entities.js (entity library)

Everything below is additive and backwards-compatible; nothing in sections 1–13 was renamed or changed.

- **`RT.player.held` / `RT.player.frozen` (advisory, written by `launcher`).** While a launcher holds the
  player it sets `held` to that entity and `frozen = true`, and clears both on fire / death / reset. The
  hold does **not** depend on the engine honouring them: entities.js writes `player.x/y`, zeroes `vx/vy`,
  sets `onGround = false` and `jumpsLeft = 0` every fixed step and consumes ACTION/JUMP itself. An engine
  may skip player physics while `frozen`; it does not have to.
- **`launcher` angle convention.** `angle` is in DEGREES, maths convention: `0` = right, `90` = straight
  up, `-45` = down-right. `power` is px/s (like `spring`). `rotate` may be `true`, a number (deg/s) or
  `[minAngle, maxAngle]`; `sweep`, `rotateSpeed`, `minAngle`, `maxAngle` and `autoDelay` refine it. The
  dotted preview is integrated with the real section-4 constants (1550 / 2200 / apex hang / 900 cap). For the
  16 steps after a shot the launcher holds `player.jumpsLeft` at 0 and suppresses `RT.input.jumpReleased`
  while the player is rising, because a jump-cut or a buffered double jump would contradict that preview.
- **`RT.player.shield` (`mushroom`).** Eating a real mushroom sets `RT.player.shield = true`, which
  engine.js's `killPlayer` already honours (it eats one hit and returns). entities.js adds only what a
  bare flag cannot express: 0.9 s of invulnerability afterwards, a knock-back, and a bail-out to the last
  ground the player actually stood on, so the spike that broke the shield does not kill on the next step.
  No engine function is wrapped, patched or replaced.
- **`balloon` floatiness is emulated locally.** Gravity lives in engine.js, so the balloon damps the
  *observed* per-step change in `player.vy` to 0.15x and caps the fall at 200 px/s. No new engine field.
- **Speed/power params.** A speed, acceleration or power number below 60 is read as TILES per second (the
  section-6 default), 60 and above as px/s — so `speed: 2.5` and `power: 900` both mean what they look like.
- **Dynamic solidity** (`beatblock`, `toggleblock`, `door`, `faller`): these set `e.solid` per instance AND
  collapse `e.w/e.h` to `0` while non-solid (draw code keeps the real size), so a non-solid state cannot be
  collided with whichever way the engine tests solidity.
- **Optional extra descriptor params**, all defaulting to the documented behaviour: `mover/saw/flyer`
  `loop:'loop'|'once'` (default ping-pong), `pause`, `ghost:false`, `pal`; `faller` `delay`, `respawn`;
  `walker/flyer` `color`, `chase`, `amp`, `freq`; `thwomp` `drop`, `rest`, `shake`; `cannon` `kind:
  'fire'|'rock'|'energy'`, `r`; `laser` `dir`, `thick`, `color`; `beatblock` `phase`; `switch` `onoff:true`
  (also calls `RT.toggleOnOff()`); `trapspike` `near`, `retract`; `fallingceiling` `chain:false`;
  `fakegoal` `back`; `sign` `range`; `text` `align`, `rot`, `wave`, `alpha`, `outline:false`; `deco`
  `scale`, `flip`, `alpha`; `portal` `keepMomentum:false`; `wind` `gust`; `ball` `kind`, `gravity`, `life`;
  `lavaball` `gravity`, `phase`, `r`; `balloon`/`checkpoint`/`key`/`launcher` `color`.
- **`window.__RT_ENTITY_TYPES`** — diagnostic array naming every entity type entities.js defined, and
  `window.__entityErrors` — any entity callback that threw (both for tests only; neither is on `RT`).

### 2026-09-20 — audio.js (RT.Audio)

Everything below is additive; `unlock / sfx / music / stopMusic / setEnabled / enabled` keep exactly
the section-9 signatures and semantics, and every one is safe to call before unlock (they no-op).

- **No AudioContext exists until the first gesture.** `RT.Audio.sfx()` before unlock returns `false`
  and plays nothing; `RT.Audio.music(name)` before unlock returns `false` but *remembers* the track
  and starts it the moment the context resumes. Engine/level code may therefore call `music()` during
  `onLoad` without waiting for input. Both take an optional 2nd argument (`sfx(name, atTime)`,
  `music(name, {restart:true, fade:s})`); omitting it is the documented behaviour. `music(name)` on
  the track already playing is a no-op, so a respawn or level restart never restarts the music.
- **`setEnabled(b)`** writes `RT.save.settings.sound` and calls `RT.saveNow()` when they exist, and
  reads that preference back (falling back to the raw `rageTrialsSave` blob, since audio.js is
  evaluated before `RT.boot()` builds `RT.save`). Muting stops the scheduler and remembers the track;
  unmuting resumes it.
- **Extra methods, all read-only or mixing-only, none required by any other file:**
  `RT.Audio.unlocked` (bool), `RT.Audio.status()` → `{ctx,enabled,unlocked,broken,music,wanted,step,
  loops,len,tracks,sfx}`, `RT.Audio.sfxNames()`, `RT.Audio.musicNames()`, `RT.Audio.trackInfo(name)`
  (compiled bpm / loop length / per-voice lengths — lets a headless test validate the note data with
  no audio device), `RT.Audio.setMusicVolume(v)`, `RT.Audio.setSfxVolume(v)`.
- **Extra sfx names** beyond the section-9 list, safe to fire from levels: `mushroom`, plus the
  aliases `spikes`→spike, `flag`→checkpoint, `goal`→win, `select`/`click`→ui. Any unknown name is a
  silent `false`, never a throw.
- **Music is scheduled on `setInterval` (25 ms tick, 100 ms lookahead), never rAF**, per section 2; the
  window widens automatically when a background tab clamps the interval. Rapid-fire sfx are rate
  limited per name (e.g. `step` 60 ms) with a global burst cap, so a death pile-up cannot blow up the mix.

### 2026-09-20 — engine.js (backwards-compatible)

Engine rulings the other files can rely on:

- **`S` (spring) is a SOLID tile.** You stand on it and it launches you at -900 px/s. A spring
  that was not solid would just be scenery, because you would land on whatever is beneath it.
- **`X` (kill block) kills on contact from every side**, landing on top included (it is tested
  with a 1 px skin around the player, not the 3 px-inset hazard box).
- **`o` coins stay collected for the whole run of a level**, they do not come back on respawn.
  Everything else one-shot (`K` crumble, `B` breakable, `I` revealed, popped traps, non-persistent
  entities) does reset, as §4 says.
- **`RT.setTile` is permanent**: it writes through to the authored grid and survives respawns,
  so `RT.Tycoon` platform purchases stay bought after a death.
- Gravity integrates leapfrog (half a kick before the move, half after), so the jump arc is the
  exact parabola: apex **102 px (3.18 tiles)**, full-run gap **4.48 tiles**, spring **7.8 tiles**.
  A 3-tile wall is climbable, a 4-tile wall is not - both verified headlessly.

API additions (all optional, nothing existing changed):

- `RT.spawn({px:true, ...})` — treat `x,y,w,h` as PIXELS instead of tiles (for runtime spawns
  such as cannon projectiles). Without it they are tiles, exactly as §6 says. `e.spawnDef` keeps
  the original descriptor; `RT.t2p(v)` / `RT.p2t(v)` convert.
- `RT.input.pointer` = `{x, y, wx, wy, down, justDown, justUp, id}` — `x,y` are CSS screen
  pixels, `wx,wy` the same point in world pixels.
- `RT.setMode(mode)`: `mode.draw(g, w, h)` gets a context already scaled by devicePixelRatio and
  `w,h` in CSS pixels, so `(0,0)-(w,h)` is the whole screen. Optional `mode.onKey(e)` and
  `mode.onPointer(type, pointer)` with type `'down'|'move'|'up'`.
- `__dbg.tap(name, steps)` — `steps` defaults to 1 (the route format). Note a 1-frame jump is a
  real tap and gets jump-cut to a ~0.8 tile hop; a route that needs the full 3-tile jump must hold
  jump for ~20 steps (`{"hold":{"jump":true},"steps":20}`) or pass a count here.
- `__dbg.resume()` leaves the synchronous stepping mode that `__dbg.step` enters.
  Also `__dbg.theme() .particles() .chunks() .save() .menu() .select() .clearErrors()`.
- Convenience on RT, all guarded: `RT.sfx(name)`, `RT.groundShadow(g,cx,bottomY,w)`,
  `RT.breakBlock(tx,ty)`, `RT.bounce(vy)`, `RT.playerJump(power)`, `RT.consumeAction()`
  (suppresses the dash for this step), `RT.collectCoin(x,y,value)`, `RT.findOne(type)`,
  `RT.startLevel(n)`, `RT.restartLevel()`, `RT.pause() / RT.resume()`, `RT.showTheEnd()`,
  `RT.getMode()`, `RT.levelSize()`, `RT.getTheme()`, `RT.isTouch()`, `RT.particles.ring(...)`,
  `RT.particles.text(...)`, `RT.random/randInt/pick`, `RT.mixColor/shade/rgba`.
- An entity def with `shadow: true` gets the engine's soft ground shadow drawn for it.
- `RT.player.shield = true` absorbs one lethal hit instead of killing (for `mushroom`/Tycoon).
- A level index with no `RT.registerLevel` still loads: the engine substitutes a tiny walkable
  placeholder so `__dbg.level(n)` and the harness never throw.

### 2026-09-20 — modes/tycoon.js (RT.Tycoon)

Everything below is additive; nothing in sections 1–13 was renamed or changed. `RT.Tycoon.start(cfg)`,
`.cash`, `.add(n)`, `.stop()` and the four item kinds behave exactly as §11 specifies.

- **Entity types defined here:** `buybutton`, `dropper`, `collector`, `cashpad`, plus an internal
  `tycoonroot` (invisible, layer `front`) that draws the tycoon's particles/floating text and follows
  the player so draw-culling can never hide them. All five set `e.persistent = true`, so a respawn keeps
  purchases; painted tiles and granted abilities are re-applied on `onReset` as a safety net.
- **Extra `RT.Tycoon` methods** (all optional for callers): `.spend(n)`, `.has(id)`, `.flag(name)`,
  `.item(id)`, `.price(id)`, `.canAfford(id)`, `.buy(id,{free,force})`, `.rebirth(mult)`, `.setMult(m)`,
  `.multiplier()`, `.state()`, `.update(dt)`, and the read-only `.income`, `.mult`, `.rebirths`,
  `.active`. `.cash` is an accessor (still `typeof === 'number'`) so it can never go stale.
- **Extra `cfg` fields:** `coinValue`, `coinScale`, `buyHold`, `mult`, `rebirthMult`, `rebirthCash`,
  `rebirthResetAll`, `onCash`, `cashpad:{x,y,label}` (a CASH/INCOME plinth) and
  `rebirth:{x,y,cost,mult,label}` (a PRESTIGE pad). Default rebirth rule: droppers/cosmetics reset,
  platforms and abilities are kept (removing them could strand the player); `keepOnRebirth` per item
  and `rebirthResetAll` override it.
- **Extra item fields:** `desc`, `icon`, `color`, `showLocked` (draw a greyed LOCKED preview pad before
  its prerequisite is bought — without it the pad simply appears on unlock, per §11), `mx`/`my`/`flip`
  (where the dropper machine is built), `collector:{x,y}`, `keepOnRebirth`, per-item `onBuy(RT,item)`.
- **Coins:** engine.js already calls `RT.Tycoon.add(value)` inside `collectCoin` and then emits `coin`.
  The module detects that same-step hand-off and never double-counts; it falls back to the `coin` event,
  and to diffing `RT.coins`, if an engine does neither. Its own cash FX are deferred one step so a coin
  pickup keeps the engine's `+1` popup instead of stacking a second one.
- **`window.__dbg` conveniences**, only installed if the engine has not defined them: `giveCash`,
  `tycoonState`, `tycoonBuy`.

### 2026-09-20 — modes/tetris.js (RT.Tetris)

Section 10 is implemented exactly as written: `RT.Tetris.start({level, linesToWin, onWin, onLose,
onQuit})`, `RT.setMode`, 10x20, the real NES gravity table (level 28 = 2 frames/cell), NES rotation
with no kicks, NES spawn orientations, the one-re-roll randomizer, ARE 10–18 by lock height, a
21-frame line-clear sweep, 40/100/300/1200 x (level+1), the level-8 (28 mod 10) blue/red palette,
DAS 10/2 and the hard-drop concession. Everything below is additive.

- **Extra `start` option: `seed`** (number). Omitted, the piece sequence is seeded from the clock.
  `RT.Tetris.seed(n)` reseeds directly. Only tests need either.
- **Extra methods on `RT.Tetris`**, none required by any other file: `stop()`, `restart()`,
  `quit()` (fires `onQuit`), `pause()` (toggles, returns the new state), `press(name)` /
  `release(name)` (held inputs, as opposed to the one-shot `input(name)`), `debugFill(rows)`,
  `setLines(n)`, `gravityFrames(level)`, `palette(level)`, `layout()` (read-only geometry: the well
  rect and every on-screen button rect, so a headless test can tap a real button), plus the fields
  `active`, `mode`, `COLS`, `ROWS` and the raw `update` / `draw`.
- **`state()` returns the section-10 fields plus** `phase` (`ready|falling|clearing|are|over|won`),
  `paused`, `linesToWin`, `pieces`, `gravity` (frames/cell now), `are`, `tetrises`, `active`, `held`
  and `piece.cells` (`[[row,col],…]`). `board` is a fresh 20x10 array of 0 (empty) or 1–7.
- **`input(name)`** accepts `left,right,down,rotA,rotB,harddrop` plus the aliases
  `rotate/up/cw → rotA`, `ccw → rotB`, `drop/hard → harddrop`, `soft/softdrop → down`; unknown names
  return `false` and do nothing. Inputs arriving during ARE or a line clear stay queued until the
  next piece exists, so `tetrisInput(x); step(n)` always lands.
- **`debugFill(rows)`** replaces the board: a number fills that many bottom rows (rightmost column
  left open), an array of 10-character strings (`.`/space = empty) is applied bottom-aligned, so the
  last string is the bottom row. `setLines(n)` sets the cleared-line counter (and the level it
  implies) without triggering a win.
- **`mode.onPause()`** is implemented, so engine.js's Esc / P / pause-button routing pauses *inside*
  Tetris (own PAUSED card, own pause button on the canvas); tetris.js deliberately does **not**
  handle Esc or P itself, to avoid toggling twice.
- **Key ownership.** While the mode is being driven, the keys it uses (arrows, WASD, Z/X/J/K, Space,
  R, Enter, Q) get `preventDefault` **and** `stopPropagation`, so R cannot kill the player standing
  in the level behind the arcade cabinet and Space cannot make him jump. `RT.Audio.unlock()` is
  called from that handler because engine.js's own unlock no longer sees those events.
- **Input is ignored unless `update()` ran in the last 400 ms**, so an `RT.clearMode()` from outside
  can never leave tetris.js eating the keyboard.
- **Screen ownership.** `start()` hides `#hud`, `#pads` and any visible `.screen`, and `stop()`
  restores exactly what it hid unless the engine has since shown a different screen. engine.js does
  the same for HUD/pads on its own; this is belt and braces (and covers `__dbg.tetris()` from the menu).
- **Rows above the well.** A spawning or rotating piece may sit up to two rows above row 0 (this is
  what lets the I piece rotate at spawn height, as on the NES); nothing is stored there and locking
  any cell there is a top out.
- **Two documented concessions beyond section 10:** the hard drop pays 1 point per cell (like NES
  pushdown), and a fast downward flick on the glass is a hard drop while a slow drag is a soft drop.

### 2026-09-21 — levels 9 and 10, and the level-10 pass condition

Additive only. Nothing in sections 1–13 was renamed, and no existing level, entity, theme,
sfx or music name changed meaning.

- **Level files may call `RT.defineEntity`.** Section 1 says entities.js implements every type
  in §6; it does not say it is the only file allowed to define one. `levels/level09.js` defines
  14 types prefixed `l9` (`l9shy l9wall l9block l9boom l9drop l9cloud l9ride l9saw l9fruit
  l9moon l9flag l9door l9goal l9pink`) and `levels/level10.js` defines 7 prefixed `lX`
  (`lXdoor lXpad lXslot lXrig lXlava lXbeat lXlift lXarcade`). The prefixes mean a level can
  never shadow a library type, and every one of them is registered at script-eval time, before
  `RT.boot()`, so `RT.spawn` resolves them normally.
- **A solid entity the player can stand on must never be switched off by moving it.**
  engine.js carries whoever is riding a solid by that entity's per-step delta, so teleporting
  a ridden platform to a parking coordinate teleports the player with it — a 31,000-tile
  teleport, in practice. `lXbeat` and `lXpad` therefore collapse `w`/`h` to 0 and keep `x`/`y`
  where they are (the entities.js "dynamic solidity" convention), and keep their drawn size in
  `dw`/`dh`. Parking to a far coordinate is still fine for solids that are never ridden while
  they switch (`l9wall`, `l9moon`, `lXrig`).
- **Level 9 has no `G` tile.** Its goal is the `l9goal` entity, which runs away three times and
  then calls `RT.winLevel()` on the fourth touch. `G` remains the normal way to end a level;
  `RT.winLevel()` was already public API and the results screen, save and unlock all behave
  identically.
- **Level 10's route ends at the arcade cabinet**, exactly as §13 allows. `tools/playtest.js`
  therefore treats level 10 as passing when the route leaves `RT.Tetris.active` true and a
  separate finale step then wins for real: `RT.Tetris.setLines(9)`, `debugFill(['##########'])`,
  one hard drop, and `__dbg.state().won` must come back true. That proves the whole chain —
  cabinet → `RT.Tetris.start({level:28, linesToWin:10})` → `onWin` → `RT.winLevel()`.
- **`tools/route.js`** (new) is a debugging front-end for the same route files: it prints the
  player's tile position, velocity, ground flag and death count after every segment, plus the
  death causes, `RT.keys`, `RT.groups` and `RT.Tycoon.state()`. It reads and writes nothing the
  game ships with.
- **`window.__L10`** — level 10 exposes its own state object for tests only, like
  `window.__RT_ENTITY_TYPES`. Nothing on `RT` depends on it.

### 2026-09-21 (later) — an eleventh level, and level 10's obby economy

- **`LEVEL_COUNT` is 11.** Section 5 said "Levels are 1..10"; it is now 1..11. Everything that
  reads the count already did so through `LEVEL_COUNT` — the level-select grid, the unlock
  ladder, `showTheEnd()`, the results screen's FINAL TRIAL CLEAR and the save clamp all followed
  without change. `levels/level11.js` is loaded after `level10.js` in index.html.
- **Level 11 defines 5 more level-local entity types** (`lEgate lEbeat lEcrate lEchase lEwheel`),
  under the same rules as the `l9`/`lX` families: prefixed so they cannot shadow entities.js,
  registered at script-eval time, and switching solidity by collapsing `w`/`h` rather than by
  moving (see the 2026-09-21 amendment).
- **`lEbeat` takes a `phase`** (0..1, a fraction of the period) on top of `lXbeat`'s `wake`. The
  three spans in THE METRONOME are phase-staggered so that an unbroken run from the first rest
  meets every span lit — the rhythm rewards commitment instead of asking the player to read a
  clock they cannot see the start of.
- **Reversed controls should be keyed to something that cannot chatter.** Level 11's trench keys
  `controlsReversed` to the player's DEPTH (`p.y + p.h > 15.2 * T`) rather than to an x-range.
  An x-threshold oscillates: holding right inside it pushes you back out, which releases it,
  which pushes you back in, forever. Level 9's and level 10's x-ranges are latched with
  hysteresis for the same reason; depth needs no latch at all.
- **Level 10's arena is now funded by an obby lap, not by idling.** THE CIRCUIT is six staggered
  rungs over the lava to a PAYOUT PLATE, paying `min(900, 150 * 1.6^laps)` per lap and re-arming
  when you drop back to the pillars. The rungs sit in the only windows the pillar-hop arcs leave
  free, so the gaps between them are one tile — too narrow for a blade, which is why each gap is
  guarded by a short-fused `cannon` (`life: 0.6`) instead. The DROPPER survives at 6/s.
- **`window.__L11`** — level 11's state object, for tests only, like `window.__L10`.

### 2026-09-22 — the arcade cabinet runs NES level 2, not level 28

- **`RT.Tetris.start({level:2, linesToWin:10})`** is what level 10's cabinet now calls. Sections
  10 and the 2026-09-20 tetris amendment quote `level:28`; read that as `level:2` everywhere.
  Nothing in the API changed — `start()` has always taken the level as an option and derived
  gravity, palette and the level-up target from it.
- **Gravity is 38 frames per cell instead of 2.** The gravity table, the NES randomizer, ARE, the
  line-clear sweep, scoring, DAS and the absence of hold/ghost/lock-delay are all unchanged; only
  the starting level moved, so the cabinet is a Tetris game you can lose rather than one you
  cannot win. Ten lines still ends it, and the level still ticks once (2 → 3) on the last clear.
- **The palette follows the level.** `paletteFor(2)` is the magenta/orange pair (`#D800CC` /
  `#E45C10`) instead of the level-8 blue/red, because the NES picks its palette by `level mod 10`.
  Nothing hard-codes the finale's colours.
- **`RT.Tetris.start()`'s default level and `__dbg.tetris()`'s default are both 2** so that a
  call with no level starts the shipped game. `tools/playtest.js` drives `d.tetris(2)`.
- **Copy that named level 28** (the cabinet marquee, the movement-IV sign, the level-10 taunt, the
  TOP OUT taunt list, DESIGN.md and the platyfy card) now names level 2. `docs/research-tetris.md`
  is left alone: it is the research record of how the NES behaves at 28, and is still accurate.

### 2026-09-22 (later) — a twelfth level: four bosses, and how a boss is tested

Additive only. Nothing in sections 1–13 was renamed, and no existing level, entity, theme,
sfx or music name changed meaning.

- **`LEVEL_COUNT` is 12.** Section 5 said "Levels are 1..10", the 2026-09-21 amendment made it
  1..11; it is now 1..12. Everything that reads the count already went through `LEVEL_COUNT`.
  `levels/level12.js` is loaded after `level11.js` in index.html.
- **Level 12 is built in BANDS, not one corridor.** It is 400 x 56 — the section-5 maximum in
  both directions — and the acts sit at different ROW ranges as well as different columns, so
  the same columns carry the troll obby (rows 44-55) and THE AUTHOR's arena (rows 2-17). The
  bands are linked by rocket sleds, a carved chute, a `portal` and two canvas modes. A boss
  therefore has to check the player's ROW as well as their column before it wakes, or it wakes
  while the player is two hundred tiles away on a different floor.
- **`tiles` may be generated.** Section 5 requires rows of equal length at registration; it does
  not require them to be typed. level12.js paints a 400x56 char grid with `row/col/box/slab`
  helpers and joins it — 22,400 tiles is past the point where a literal is reviewable.
- **A custom theme object needs `__ready: true`.** `resolveTheme()` returns the same object only
  when that flag is set; without it every `themeForTileX()` call builds a new object, the zone
  blend in `updateThemeZones()` never settles, and the level silently keeps its first theme.
  Level 12's six themes set it. (Levels 9–11 pass raw objects and are affected; nothing was
  changed there, this is only a note for the next agent.)
- **Level 12 defines 27 entity types prefixed `lG`** (`lGshot lGmark lGflame lGdrone lGsled
  lGring lGfront lGrival lGvulcan lGlava lGvent lGpool lGjet lGgale lGshrine lGmimic lGfakecp
  lGrunaway lGghost lGnudge lGonejump lGpad lGclone lGjester lGwrit lGauthor lGspikedrama`),
  under the same rules as the `l9`/`lX`/`lE` families.
- **The boss framework.** All four bosses share one machine: `bossInit/bossWake/bossHit/bossDie`,
  a per-phase pattern queue, and exactly one way to do damage — `coreStomp()`, which requires the
  player to be FALLING onto an open core. Nothing else in this game damages anything, so nothing
  else damages a boss. Every attack telegraphs on the floor (`lGmark`) or with a count-in, and the
  core opens only after a specific attack (a ram into the wall, a boiled puddle, a laugh, or the
  fourth beat). The health bar is drawn in world space anchored to the camera, 54 px below the
  top edge so it clears the DOM HUD, and only for a boss within one screen width of the camera.
- **`kill()` in level 12 honours `RT.god`.** The engine's `killPlayer` does not check it, so a
  headless harness could not watch a whole boss fight. Level-local hazards route through one
  `kill(cause)` that returns early under god mode; the causes are distinct (`fire lava spike
  laser shot drone water wind hull ink troll crush void`) so a death log names the killer.
- **Two canvas modes live in the level file**, not in `modes/`: the fake ending (a complete
  victory screen with a `yay!` button that turns into JUST KIDDING and hands off to THE AUTHOR)
  and THE TICKET BOOTH (26 falling tickets, 1,000 points, and a bomb that calls
  `RT.restartLevel()`). Both use the public `RT.setMode` contract from section 6 including
  `onPointer`; neither touches Tetris or Tycoon.
- **`window.__L12`** — level 12's state object, for tests only, like `__L10`/`__L11`. It carries
  `__L12.dbg`: `state() boss(key) hit(key,n) killBoss(key) cash(n) buyAll() tickets(perfect)
  warp(tx,ty) skipTo(act)`, and `__L12.booth` while the booth is open. Nothing on `RT` depends
  on either.
- **Level 12's pass condition** follows the level-10 precedent. `docs/routes/level12.json` is a
  legal input route that flies the whole rocket race and lands in VULCAN-9's arena with zero
  deaths; `tools/playtest.js` then proves the other nine acts through `__L12.dbg` and, for the
  troll obby, through a second real input route (`docs/routes/level12-troll.json`, 34 segments,
  253 → 371 with zero deaths). It asserts fifteen named acts plus `won`, and both endings — the
  one-spike ending and the every-ticket ending — must win.

### 2026-09-22 (later still) — the bosses are now beatable, and the gate proves it

The four bosses in level 12 shipped provably *reachable* (the finale drove them through
`__L12.dbg.hit`) but not provably *winnable*. They were not. Every fix below is a rule change in
`levels/level12.js`; nothing outside that file changed.

- **The universal one: a stomped boss killed you on the landing frame.** You damage a boss by
  falling onto its open core, which leaves you standing on a body that becomes lethal again the
  instant the window closes. `bossHit()` now sets `e.grace = 1.15` and every boss's contact test
  skips while `grace > 0`. Without it no boss in the level could be hit twice.
- **VULCAN-9's core was out of reach.** Stunned, it hovered with its back 4.7 tiles up; a jump
  from the arena floor tops out at 3.18. It now SLUMPS to 1.15 tiles, putting the core at 2.5,
  and the ram never flies lower than 2.4 tiles so standing on the floor is always a legal answer
  to it. The ram is also in every phase list now — it is the only way in, so it is never more
  than one attack away — and a stun pops any live drones.
- **GALE PRIME could not be hit twice, ever.** `if (!e.stalled && …)` guarded the element clock,
  and `e.stalled` goes *negative* on the frame it expires, so `!(-0.003)` is false and the clock
  froze on water after the first steam. Compare, never negate. The funnel and its eyewall now
  THROW the player (`gust()`) instead of killing: a lethal column that follows you around a
  walled arena has no counterplay, a knock-back does. Rain is weather, not damage; the floor jet
  became a crossing wave and then went away entirely (the water phase's job is to place puddles);
  the tier jets sit at 4.7 and 7.2 tiles, above the head of anyone jumping from the floor.
- **THE JESTER had two killers in the damage window.** Its body hurt while its hat was open (you
  are *supposed* to land on it) and its three copies were lethal to touch — four killers hopping
  around a 24-tile room. Copies are now illusions that only punish a wrong hat, and the body only
  hurts on the way DOWN.
- **THE AUTHOR's window was arithmetically unhittable, and its arena had no roof.** The written
  pad sat 3.2 tiles up — reachable only at a perfect apex — and the phase-5 window (0.34s) closed
  before a jump from it could ever arrive. The pad is 2.5 tiles, the core 3.0 above that, and the
  windows are 0.9s → 0.58s, which is still beat-accurate but no longer impossible. The arena now
  has a solid roof at row 2, because the boss flips your gravity and an open sky above that is a
  hole you fall out of for eight seconds.
- **The gate is now an autoplayer, not a poke.** `tools/playtest.js`'s level-12 finale contains a
  ~90-line bot that fights with the same four buttons a person has (dodge markers, jump sweeps,
  stomp drones, climb the pad, jump on four). VULCAN-9, GALE PRIME and THE AUTHOR must be
  *defeated by it* for the level to pass; THE JESTER must give it at least two hits, and its two
  deaths are then driven through `__L12.dbg` so the resurrection chain stays covered. If a future
  change makes a fight unwinnable again, the suite fails instead of going green.

### 2026-09-24 — level 10 has no Tetris in it

- **The cabinet at 210 no longer starts anything.** `levels/level10.js` does not reference
  `RT.Tetris`; pressing ACTION on the cabinet runs `powerDown()`, which carves the shutter at
  column 215 (rows 0–2) and leaves the trial's real goal — a `G` tile at 218,2 authored into the
  map — behind it. The cabinet is scenery with a joke on it: OUT OF ORDER since 1989.
- **Level 10 therefore has no special pass condition any more.** The 2026-09-21 amendment let its
  route stop at the cabinet and proved the rest through `RT.Tetris`; `docs/routes/level10.json`
  now plays through to the door (74 segments, wins with zero deaths) and the level-10 clause is
  gone from `tools/playtest.js`. Section 13's plain rule applies to it again.
- **`modes/tetris.js` is untouched and still loaded.** Section 10, the `RT.Tetris` API, the
  `korobeiniki` track and `__dbg.tetris()` / `tetrisState()` / `tetrisInput()` in section 8 all
  still work exactly as documented, and `playtest.js tetris` still exercises them. Nothing in the
  game calls them now — the module is there for the contract and for the next agent who wants a
  cabinet that does work.

### 2026-09-24 (later) — an arena door you cannot be locked out of

- **Dying to THE JESTER used to end the run.** `sealJester()` welded the doorway at column 373
  (rows 38–43) shut when the fight woke, and nothing ever reopened it — `RT.setTile` survives a
  respawn by design. Since dying there sends you back to the checkpoint at 252, the walk back
  through the troll obby ended at a wall, and trial 12 could not be finished without restarting
  the level. THE AUTHOR was unreachable for the same reason: its retry path runs through that
  doorway.
- **The rule is now stated once, in `onUpdate`:** inside the arena with the fight live, the door
  is shut, so you cannot walk out of a fight; anywhere else it is open. You can be locked IN a
  boss fight and never locked OUT of one, whatever happened last.
- **`SEALS` / `sealArena(key)` / `unsealArena(key, quiet)` / `unsealAll()`** hold the doorway
  spans, and `L.sealed` tracks which are shut. The level's `onDeath` calls `unsealAll()` and a
  boss's `onDead` opens its own door, so both endings of a fight leave it open. Any future arena
  that shuts behind the player adds one row to `SEALS` and inherits all of it.
- **`tools/playtest.js` asserts the cycle** as the `doorReopens` act: walk in (sealed), die
  (open, and the respawn lands back at 252), which is the exact sequence that used to be fatal.

### 2026-09-24 (later still) — the music, rebuilt, and two tracks of their own

Section 9's API is unchanged: `unlock / sfx / music / stopMusic / setEnabled / enabled` behave
exactly as documented and every track name it lists still exists. Everything below is additive.

- **Two new tracks, and trials 8 and 9 stopped borrowing.** Trial 8 played `tycoon` (which trial
  12's counter also plays) and trial 9 played `troll` (which trial 12's troll act also plays).
  They now have their own: **`payday`** (F major funk, 132bpm, walking bass, horn stabs, a clap on
  two and four) for the obby tycoon, and **`mischief`** (A minor music-box waltz, 168bpm, three
  beats to the bar — a 12-step bar, the only track in the game that is not in four) for the troll
  trial. `RT.Audio.musicNames()` now returns 16.
- **Trial 9 is jazz now, not a waltz.** `mischief` was replaced by **`hustle`**: A minor at
  186bpm, swung 0.22, over the Autumn-Leaves cycle (Am7 D7 Gmaj7 Cmaj7 / F#m7b5 B7b9 Em7 E7).
  A walking bass in quarters approaching every root chromatically, rootless comping that lands
  on the AND, a bebop lead with chromatic descents, a spang-a-lang ride with ghost-note answers,
  and an eighth-note arpeggio hard right for the arcade half. Its note data was checked against
  its own chord chart: every note is a chord tone, a scale tone, or an approach that resolves by
  a semitone into the next one - including across the bar line.
- **Every track gained an arpeggio voice and a drum fill**, so a track is 5 voices, not 4 (`void`
  is 4: it has no drums). Section 9 says "<= 3 voices"; that was already untrue at 4 and is now
  5. The extra voices are sparse by design — an arp on eighths, a fill every fourth cycle — and
  the whole suite still runs with no dropped frames headlessly.
- **New per-voice fields, all optional:** `pan` (StereoPannerNode, built once per track, not per
  note), `send` (how much of that voice goes to the new tempo-synced stereo echo), `spread` (a
  second oscillator detuned by N cents — the cheapest chorus there is), and `hum` (a couple of
  milliseconds of deterministic timing drift so parts stop gluing together).
- **New pattern syntax:** `!note` is an accent (x1.34) and `,note` is a ghost (x0.55), for drums
  and notes alike. Velocity is most of what separates a groove from a typewriter.
- **New bus wiring:** music runs through a 70 Hz highpass before the compressor (the triangle
  bass was eating it), and a dotted-eighth/eighth ping-pong delay, tempo-locked to the track's own
  step, sits on a send. **New drum voices:** `p` clap, `x` shaker, `b` sub boom; `k`, `s` and `h`
  were rebuilt with separate click / body / sub layers.
- **Loud one-shots duck the music** (`death` to 40%, `win` to 50%, a few others to ~72%) for a
  fifth of a second, then it comes back over 0.42s — the section-3.6 note in research-feel.md.
- **Track levels were metered and balanced**, not guessed: each track was played headlessly with
  an analyser on the master bus and its gain set from the measured average, so the action tracks
  sit within about a fifth of each other and the atmospheric ones (`void`, `ruins`, `sunset`) stay
  deliberately quieter. `tools/` has no permanent harness for this; the scratch scripts that did
  it are described here so the next agent can rebuild them: play each name, peak-hold an
  AnalyserNode for three seconds, compare averages.
- **A bar that does not add up is a silent bug**, so every pattern was checked: each voice's step
  count must divide by 16 (or by 12 for `mischief`). All 16 tracks pass.
