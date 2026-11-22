# PLATYPUS — LEVELS2.md (binding spec for levels 6–11 and the score)

This is the only shared knowledge between the parallel builders of levels 6–11. Read CONTRACT.md (engine
rules, budget), LEVELS.md (the level framework: level interface A2, `ctx` A3, the player A4, worlds A4b,
input A5, UI A6, cinema A7, clean-up A9, and the modules of levels 2–5 — ALL of it still applies and is
not repeated here), STORY.md and STORY2.md (the owner's brief for these levels) first.

Part A is what the engine ADDED for these levels: it exists, is tested (`node tools/playtest-engine2.cjs`)
and is exactly as written. Part B is the contract of the modules being written in parallel: build yours
to it exactly and call the others exactly as written. Part C is the storyboard of each level. Part D is
performance.

Rules for everything (unchanged): plain ES modules, vendored three.js, no assets, no build step; no
per-frame allocations, canvas redraws or geometry rebuilds; InstancedMesh for anything repeated; every
file passes `node --check`; modules never touch the DOM and never add input listeners; metres, +Y up,
characters face +Z locally. Do not launch a browser in a build phase. Levels feature-detect NOTHING: every
function named in Part B must exist. Never change the behaviour of anything levels 1–5 use.

Tone (STORY2.md): fighting is stylised and bloodless. Enemies are knocked out: they drop, lie still and
later fade, dissolve into mist (dream) or become platypuses. No blood, no gore, no cruelty; the losses in
level 10 are shown with restraint (a friend lies still, sound thins, pale motes — as in level 5).
Text is short, warm and readable; the player always has an objective line, a marker and a hint.

## File ownership

ENGINE (exists; do not edit — ask for a change): `index.html`, `src/main.js`, `src/ui.js`, `src/hud.js`,
`src/cinema.js`, `src/progress.js`, `src/services.js`, `src/game.js`, `src/levels/level1.js … level5.js`,
`src/levels/common.js`, `src/levels/placeholder.js`, and every module of levels 1–5 not listed below.

One builder per file:

| file | what | shared key |
|---|---|---|
| `src/music.js` | the adaptive score (B1). A silent STUB with the full API exists: replace its body | `ctx.music` (engine) |
| `src/audio.js` | EXTENSIONS only (B2): append; change nothing that exists | `ctx.audio` |
| `src/platypus.js` | EXTENSIONS only (B3): new options / methods / `createPlatypusCrowd`; defaults unchanged | — |
| `src/fx.js` | EXTENSIONS only (B4) | `ctx.fx` |
| `src/combat.js` | hostile humans, rival platypuses, ally fighters, projectiles (B5) | `"combat"` |
| `src/potions.js` | potions, brewing, the transformation, the LIVING POTION (B6) | `"potions"` |
| `src/boss.js` | the Platypus King, his arena logic, crown, paper (B7) | `"boss"` |
| `src/tribe.js` | the tribe: named characters, the instanced many, food, materials, crafting (B8) | `"tribe"` |
| `src/dream.js` | the dream worlds of levels 6 and 11 (B9) | `"dream"` |
| `src/circus.js` | the circus at night (B10) | `"circus"` |
| `src/heli.js` | the helicopter and the flight-corridor world (B11) | `"heli"` |
| `src/jungle.js` | the jungle, the tribe camp, rival territory, the stone circle (B12) | `"jungle"` |
| `src/base.js` | the military base (B13) | `"base"` |
| `src/levels/level6.js … level11.js` | the levels (Part C). Placeholders exist: replace the body of `createLevel`, keep the exports, stop importing `placeholder.js` | — |

Always fetch a module through `ctx.shared(key, () => createX(ctx))` so every level gets the same instance.
Existing shared things these levels reuse: `"zoo"`, `"friend"` (Pip), `"props"`, `"crowd"`, `"lair"`,
`getWizard(ctx)` / `getDummy(ctx, i)` from `levels/common.js`.

--------------------------------------------------------------------------------------------------

# Part A — the engine additions (exist, tested)

## A0. Eleven levels

Main screen: eleven small circles (1 grey, 2–4 blue, 5 white, 6–8 green, 9–10 red, 11 gold); one row at
1280×720, 6 + 5 on tablets and phones in landscape, 4 + 4 + 3 on a phone in portrait.
`progress.js`: `LEVEL_COUNT = 11`, `beaten[11]`; saves of the 5-level version load unchanged.
`LIVE_RELEASED = 5` stays: on platyfy.com levels 6–11 are locked until it is raised; everywhere else
beating level N opens N + 1 up to 11. `meta.title` of the six files: 6 "ANOTHER DREAM", 7 "THE CIRCUS",
8 "THE SCREAM", 9 "THE TRIBE", 10 "THE BASE", 11 "THE PLATYPUS KING".

The engine switches every service of this Part OFF and empties it when a level is entered and when it is
left (`health`, `checkpoint`, `vehicle`, `abilities`, `gear`, `army`, all their callbacks, the HUD pieces
of A7, `music.stop`). A level turns on what it needs in `enter()` / when gameplay starts and must re-apply
persistent story state itself (e.g. level 11 calls `ctx.gear.wear(...)` for the gear won in level 10).

## A1. Health — `ctx.health`

```js
health.enable({ max = 5, hearts = false, label = "Health", regen = 0, regenDelay = 4, invuln = 0.9, respawn = true })
health.disable()
health.on, health.hp, health.max, health.dead      // hp is a float
health.shield = false                              // true: damage is ignored (scripted moments)
health.damage(amount, src) -> bool                 // true if the hit landed
health.heal(n); health.set(hp); health.kill(src) -> bool
health.onHurt = null   // (amount, src)
health.onDeath = null  // (src) -> return true to handle the death yourself (no automatic restart)
```

- `hearts: true` shows the heart row (one heart per point, `max` ≤ 8); otherwise a bar (`ui.setHealth`).
  `regen` = points per second once `regenDelay` seconds have passed without a hit.
- `src` (optional) = `{ x, z, kind: "melee" | "bullet" | "blast" | "fall" | "crash", knock, pierce, quiet }`.
  `x, z` = where it came from: the player is knocked away from it (`knock` m/s, default 3, bullets 1.2)
  and a red direction arc shows on screen for 0.7 s. `pierce` skips gear armor. `quiet` = no flinch/sound.
- A hit is REFUSED (returns false) while: health is off, the player is dead, `shield`, a `cinema.play`
  sequence is playing, a restart is running, or `player.invuln > 0`. Every landed hit sets
  `player.invuln = invuln` (the mercy time; the model blinks) — so two bullets of one burst cannot both land.
- Landed hit: `amount × (1 − ctx.gear.armor)` comes off, `platypus.hurt()`, `audio.playerHurt()`, a small
  camera shake, red vignette, `onHurt`. At 0: `dead = true`, `player.enabled = false`,
  `platypus.collapse()`, then `onDeath(src)`; unless that returns true (or `respawn: false`) the engine
  calls `ctx.checkpoint.respawn()`.
- `kill(src)` ignores the mercy time (caught by a guard, fell, crashed).

## A2. Checkpoints and the fast restart — `ctx.checkpoint`

```js
checkpoint.set(id, { x, z, yaw, label = "Checkpoint", silent = false, restore(id) })
checkpoint.respawn({ slow = 0.4, fade = 0.22, text = "Try again" })
checkpoint.id, checkpoint.deaths, checkpoint.tries, checkpoint.respawning
checkpoint.onRespawn = null  // (id): after restore(), screen still black
checkpoint.clear()
```

- `set` activates a checkpoint: a small "● LABEL" toast and `audio.checkpoint()` + `music.stinger
  ("checkpoint")` (not when `silent`, not when `id` is already the active one — then it only refreshes the
  position / `restore`). Omit `x, z, yaw` when `restore` places everything itself (the helicopter).
- `respawn` is THE restart for every failure in levels 7–11 (caught, shot, crashed). Timeline in real
  time: 0.4 s of slow motion (time scale 0.3) → 0.22 s fade to black → `platypus.revive()`, health full,
  `restore(id)` → `player.teleport(x, z, yaw)` (skipped while a vehicle is active) → `onRespawn(id)` →
  1.5 s of mercy → fade in 0.3 s with the toast "Try again". Measured: 0.8 s from death to playing.
  No "game over" screen, no menu, no reload, ever.
- `restore(id)` must put the world back to the moment the checkpoint was taken: respawn/reset enemies of
  the current section (`combat.reset()` + re-spawn), close doors, reset alarms, refill potions/ammo to the
  checkpoint's values, re-place the vehicle. It may return `false` to keep the controls off and the
  screen black (it then starts its own cutscene and fades in itself).
- `deaths` counts restarts in this visit, `tries` restarts since the active checkpoint was set.
  ASSIST RULE (levels 7 and 10 must implement it, quietly, never announced): from `tries ≥ 3` enemies'
  aim/grab windups are 25 % longer and bullet damage 25 % lower, guards see 20 % less far, the helicopter
  gets stronger hover assist and 40 % less wind; from `tries ≥ 6` 50 % / 50 % / 35 % and the level shows
  one concrete hint (`ui.hint`) about the thing that killed the player last.

## A3. Vehicle / possession — `ctx.vehicle`

```js
vehicle.enter(v, { seat = null, dist, pitch })   // v takes over the controls and the follow camera
vehicle.exit(x, z, yaw)                          // back on foot at (x, z) (default: where the vehicle is)
vehicle.active -> v | null;  vehicle.input       // the last input object (read-only)
```

`v` is any object with `x, y, z, yaw` (the engine READS them every frame) and
`control(dt, input)` (called every frame with the scaled dt), optionally `camDist = 9`, `camHeight = 1.2`,
`camPitch = 0.3`, `camLag = 2.5` (how fast the camera swings behind `yaw`; 0 = orbit only), `locked`.
`input = { x, y, up, down, fire, alt }`: `x` right / `y` forward in −1..1 (A/D, W/S, arrows, left stick),
`up` = Space / the jump button, `down` = Shift or C / the on-screen Down button (shown automatically),
`fire` = F / left mouse / Fire button, `alt` = K / right mouse. All zero while a cutscene plays, a
restart runs or `v.locked` is true (the model still gets `control` calls so it can settle).

While active: the engine sets `player.scripted = true`, copies `v.x/y/z/yaw` into `player.x/y/z/yaw`
every frame (so sound, fx, followers and the sun follow the vehicle), hides the player model — or, with
`seat` (an Object3D in the cockpit), copies the seat's world transform onto `platypus.group` — and aims
the follow rig at the vehicle (orbit and wheel zoom still work; zoom range 0.55–1.8 × `camDist`).
`level.onAction` still receives actions (`"interact"` to get out). `exit` restores the camera and the
player flags and teleports the player.

## A4. Ability slots — `ctx.abilities`

Three slots a level can enable. The engine owns the input, the HUD buttons, cooldown / charge / ammo
bookkeeping and the aiming; the EFFECT is the level's (it wires the callbacks to `potions`, `combat`,
`fx`, `audio`, `platypus`). All three work with keyboard, mouse and touch.

```js
abilities.targets = array | null    // default targets for potion and fire: objects with x, y, z
                                    // (optional r, alive, targetable; skipped when alive === false or targetable === false)
abilities.buttons({ sting, zap, slap, hold, jump, down })   // the OLD round buttons this level also wants. Use this INSTEAD of
                                    // ui.setAbilities in any level that uses ctx.abilities / ctx.vehicle (the service re-applies the set).
                                    // down: true | "Sneak" shows the Down button on foot with that label.
abilities.cancel()                  // stop aiming / charging / firing now
abilities.arcY(y0, y1, apex, k)     // the throw parabola: y at k = 0..1 → y0 + (y1 − y0)·k + apex·4k(1 − k)
abilities.coneTarget(list, dirX, dirZ, coneRad, range) -> target | null;  abilities.nearTarget(list, x, z, radius) -> target | null
```

Inputs:

| slot | keyboard / mouse | touch |
|---|---|---|
| potion | hold **Q** = aim (dotted arc + landing ring), release = throw; left click while aiming also throws | hold the green Potion button, drag the finger away from it to nudge the landing point, release = throw |
| scream | hold **R** = charge, release = scream | hold the purple Scream button, release |
| fire | **F** or **left mouse** (held = automatic) | hold the red Fire button |
| (on foot) sneak / (vehicle) descend | **Shift** or **C** held → `ctx.input.held("down")` | Down / Sneak button |

A press that a slot uses is NOT delivered to `level.onAction`. A slot that is off lets the action through
under its name (`"potion"`, `"scream"`, `"fire"`; left mouse stays `"primary"`). With the gun enabled
the left mouse button aims and fires and no longer orbits the camera (right-drag still orbits).

**Potion**
```js
abilities.potion.enable({ count = 3, max = 5, cooldown = 0.8, range = [2, 11], flight = [0.55, 0.95], assist = 1.6, splash = 1.1, targets = null })
abilities.potion.disable();  .add(n = 1) -> count;  .count (read/write);  .max;  .aiming;  .cooldownLeft;  .apex
abilities.potion.aimPoint(out) -> target | null       // where it would land now: out { x, y, z }
abilities.potion.onThrow = (from, to, flightSeconds, apex, target | null) => {}   // the release moment: launch the flask
abilities.potion.onEmpty = () => {}                   // pressed with none left (default: hint "No potions left!")
```
Aiming: with a mouse the landing point is the cursor's point on the ground (once the mouse has moved
after the press), clamped to `range` and snapped to a target within `assist` metres (ring and arc turn
green when snapped). With keys only, or on touch, it starts on the best target in front (keys: the
heading; touch: the camera direction; ±72°, nearest first) or 5.5 m ahead if there is none; a finger
drag moves it 0.05 m per pixel. A quick tap therefore auto-targets. Moving while aiming is allowed.
On release: count − 1, cooldown starts, the model plays `platypus.potionThrow()`, and
`platypus.potionReleaseTime` seconds later `onThrow` fires with `from` = the hand
(`platypus.holdAnchor` world position + 0.1 up), `to` = the landing point, the flight time
(`flight[0]`…`flight[1]` by distance) and the arc apex (0.9…2.4 m). `from`/`to` are reused objects:
copy them. The HUD chip shows `count/max`.

**Scream**
```js
abilities.scream.enable({ chargeTime = 1.2, minCharge = 0.25, cooldown = 6, label = "SCREAM" })
abilities.scream.disable();  .charging;  .charge (0..1);  .cooldownLeft
abilities.scream.onStart = () => {};  .onCharge = (frac) => {};  .onRelease = (power) => {};  .onFizzle = () => {}
abilities.scream.force(power = 1)      // fires onRelease now without input (the uncontrolled scream); works while disabled
```
Hold to charge (a centre bar with a tick at `minCharge`; it glows at full and holds there). Release at or
above `minCharge` → `onRelease(power = charge)`, cooldown = `cooldown × (0.5 + 0.5 × power)` shown on the
button; below → `onFizzle()`. Pressing during the cooldown hints "Catch your breath...".

**Fire**
```js
abilities.shoot.enable({ ammo = Infinity, rate = 4, range = 22, auto = true, assist = null, muzzle = null, targets = null })
abilities.shoot.disable();  .add(n) -> ammo;  .ammo (read/write);  .firing
abilities.shoot.onFire = (origin, dirX, dirZ, target | null, dist) => {};  .onEmpty = () => {}
```
One `onFire` per shot (`rate` per second while held). Direction: with the mouse (the trigger is the mouse
button, or the mouse moved in the last 4 s) from the player toward the cursor's ground point with a
0.16 rad assist cone; with keys / touch along the heading (touch, standing still: the camera direction)
with a 0.55 rad cone, and if nothing is in the cone the nearest target within 60 % of `range` in any
direction. `target` is the snapped target (or null: a free shot of length `range`); `dist` its distance.
`origin` = `muzzle` world position (pass `platypus.muzzle`) or a point in front of the bill; reused
object. A standing player is turned to face the shot; `platypus.setAim(relativeYaw)` is called every
shot. Damage, tracer, sound and recoil are the level's: `combat.playerShot(origin, dirX, dirZ, target, dist)`.

## A5. Gear — `ctx.gear`

```js
gear.wear(slot, id, { armor, speed, visor })   // slot: "body" | "head" | "eyes" | "back" | "weapon"
gear.remove(slot);  gear.clear();  gear.has(id);  gear.worn[slot] -> id | null
gear.armor   // 0..0.8, sum of the worn pieces: health.damage subtracts this fraction automatically
gear.speed   // product of the worn pieces' speed multipliers (the level applies it to player.maxSpeed)
gear.onChange = null  // (slot, id | null)
```
`wear` calls `platypus.setGear(slot, id)` (B3) so the piece shows on the model; `visor: true` turns on the
tactical HUD overlay (`ui.setVisor`). Binding ids and modifiers:

| slot | id | from | mods |
|---|---|---|---|
| body | `"leaf"` (tribe leaf-and-bone armor) | crafted in level 9 | `{ armor: 0.3 }` |
| body | `"suit"` (tactical suit; the leaf armor's shoulder bones stay visible on top) | level 10 armoury | `{ armor: 0.5 }` |
| eyes | `"glasses"` (tactical glasses) | level 10 armoury | `{ visor: true }` |
| weapon | `"blaster"` (a small launcher strapped along the back, firing over the shoulder) | level 10 armoury | — |
| head | `"boneHelm"` (optional reward for crafting perfectly in level 9) | level 9 | `{ armor: 0.05 }` |

## A6. Army — `ctx.army`

```js
army.add(unit) -> unit;  army.remove(unit) -> bool;  army.lose(unit);  army.clear()
army.list (array, read only);  army.count;  army.lost
army.show(label = "Army" | false)      // the HUD counter
army.slot(i, out, spacing = 0.9) -> out { x, z }   // formation spot i behind the player (rows of five, fanned)
army.onChange = null   // (count, delta)
```
A registry, not an AI: `combat.addAlly` (B5) registers every ally here and calls `lose` when one falls
(the counter shakes red; growing pops green). Levels read `count` for objectives and `lost` for the story.

## A7. HUD pieces — `ctx.ui` (src/hud.js)

All cached (safe to call every frame), all cleared on entry/exit.

- `setHealth(frac | null, label)` — the bar (use `ctx.health`, which drives it). `hurtFlash()`.
- `setAmmo("potion" | "ammo", n | null, max)` — counter chips (driven by `ctx.abilities`).
- `setArmy(n | null, label)` — driven by `ctx.army.show`.
- `checkpoint(label = "Checkpoint", secs = 2.2)` — the checkpoint toast (driven by `ctx.checkpoint`).
- `boss.show(name, phases = 3)`, `boss.set(fracOfTotal)`, `boss.phase(i)` (0-based; pips, colour, flash),
  `boss.hide()`, `boss.on` — the boss bar with phase ticks (top centre, under the objective).
- `setSeen(frac | null, state)` — the stealth eye meter; `state` = `"hidden" | "suspicious" | "spotted"`
  (default from `frac`: 0 hidden, > 0 suspicious, 1 spotted).
- `flight.show(bool)`, `flight.set(alt, speed, verticalSpeed, hull 0..1, warn | null, ceiling = 40)` —
  altitude tape + numbers, vertical-speed needle, hull bar, a red blinking warning (`"PULL UP"`, `"WIRES"`,
  `"SEARCHLIGHT"`, `"TOO FAST"`, `"LAND HERE"`).
- `setCharge(frac | null, label, min)` — the centre charge bar (driven by the scream slot; free for other
  hold-and-release mini-games such as crafting when the scream slot is off).
- `setPing(angle | null, strength 0..1, kind = "sound" | "danger")` — an arc at the screen edge pointing
  at something: `angle = ctx.bearing(x, z)` (0 = ahead of the camera, + = right, π = behind). The subtle
  visual aid of the sound tracking; `ctx.health` uses the red one for "shot from there".
- `setVisor(bool)` (driven by gear) and `mark(i 0..11, sx, sy, kind | null)` with kind `"foe" | "ally" |
  "goal" | "loot"` — corner-bracket markers at screen points from `ctx.project`; visible only with the
  visor. This is "the HUD change with the glasses".
- `setAbilities` also takes `{ potion, scream, fire, down }` and `setCooldown` the names `"potion" |
  "scream" | "fire"`; `setArmed(name, bool)` glows a button. (Levels use `ctx.abilities.buttons`.)

Cinema additions: `cinema.dayCard(text, { kicker = "", hold = 3.2, sound = true }, cb)` — the countdown
card ("5 DAYS", "3 DAYS...") in red glowing digits that tick once a second (`audio.timerTick`); fades to
black first if needed, fades the TEXT away, calls `cb` with the screen still black. As a `cinema.play`
step: `{ day: "5 DAYS", hold, kicker }` (blocks).

Also new on `ctx`: `ctx.music` (B1), `ctx.bearing(x, z)`, `ctx.input.aim(out, planeY = player.y)` → the
cursor's point on a horizontal plane, `out { x, y, z, ok }` (`ok` false on touch), `ctx.input.held` now
also knows `"potion" | "scream" | "fire" | "down"`. Debug seam: `__platy.state().svc` =
`{ health, checkpoint, vehicle, abilities, gear, army }`, `.music`; `__platy.svc`, `__platy.music`.

## A8. Level skeleton for these levels

```js
function enter() {
  // worlds / actors: reset, re-parent shared groups, ctx.setWorld(world) — as in LEVELS.md A9
  combat.reset(); combat.setWorld(world); world.group.add(combat.group);
  ctx.abilities.buttons({ sting: true, slap: true, down: "Sneak" });
}
function beginSection(id) {              // called when a checkpoint is reached AND by restore()
  combat.reset(); spawnEnemiesOf(id); ctx.abilities.potion.count = potionsAt[id]; ...
}
function reach(id, at) { ctx.checkpoint.set(id, { x: at.x, z: at.z, yaw: at.yaw, label: at.label, restore: beginSection }); }
```
`win()` must work from any step (the test harness calls it during the intro); `skipTo(name)` must set up
checkpoint, gear, abilities, army and music exactly as a real playthrough would have at that point.
`state()` returns at least `{ step }` plus the counters named in Part C.

--------------------------------------------------------------------------------------------------

# Part B — modules being built in parallel (contracts)

Conventions (as LEVELS.md Part B): factories take `ctx`; returned objects have `group`, `update(dt, time)`
(the LEVEL calls it every frame with scaled dt unless stated) and `reset()` (freshly-built state,
everything transient hidden, all callbacks left as they are). Named points are plain `{ x, y, z }`
(optionally `yaw`); cameras are `{ pos, look }` pairs. Callbacks are single settable properties. Worlds
have the A4b shape and additionally (all levels 6–11 worlds):

```js
world.surfaceAt(x, z) -> "dirt" | "leaves" | "mud" | "grass" | "rock" | "wood" | "metal" | "canvas" | "concrete" | "cushion" | "water"
world.sight(x0, z0, x1, z1) -> bool        // true = a clear line at eye height between the two points (walls, wagons, trunks block)
world.hidden(x, z) -> bool                 // standing here hides the player (tall grass, under a wagon, a hide spot)
world.lit(x, z) -> 0..1                    // how brightly lit the spot is (lamps, spotlights, searchlights); 0.5 where irrelevant
world.cover: [{ x, z, r, h }]              // solid things that stop bullets (also in world.colliders when they block walking)
world.P: { name: { x, y, z, yaw } }        // named points; world.routes: { name: [{ x, z, wait? }] } patrol routes
```
Worlds play their own footsteps (`audio.step(surfaceAt…)`), ambience is the LEVEL's call.
`world.sight`, `hidden`, `lit` must be cheap and allocation-free (they are called per enemy per frame).

## B1. `src/music.js` — the adaptive score

`createMusic(audio) -> music` — created ONCE by the engine as `ctx.music`; the engine calls
`music.update(realDt)` every frame while a level runs and `music.stop(0.6)` when a level is left. It never
starts by itself. A silent stub with exactly this API (and a wall-clock beat clock) is in place.

Signal path: `const bus = audio.musicBus()` → `{ ctx (AudioContext), input (GainNode → master compressor
→ limiter → soft clip → mute; NOT through the heartDrop duck), verb (send: long dark room), room (send:
the short room), white, pink (noise AudioBuffers), duck }` — or `null` until the first user gesture
(`audio.resume()`): `play()` before that must remember the request and start on the first `update` where
the bus exists. Music level: about −14 LUFS under effects; it must never pump the master limiter (keep
the music bus peak ≤ −9 dBFS; side-chain the bass to the kick inside the music graph, not on the master).

```js
music.play(state, { intensity, at = "bar" | "beat" | "now", fade = 1 (bars) })
music.stop(fadeSeconds = 1.5)
music.setIntensity(v 0..1, seconds = 1.5)     // layers fade; never a hard switch
music.setPhase(n)                             // boss: 0, 1, 2 (re-orchestrates at the next bar with a fill)
music.motif(name, { at = "beat" | "bar" | "now", gain = 1 })   // "platypus" | "pip" | "pipSad" | "wobble" | "king": played once, in the current key, over whatever plays
music.stinger(name) -> seconds                // "victory" | "defeat" | "checkpoint" | "discover" | "danger" | "transform" | "phase" | "gear" | "armyUp"
music.duck(amount 0..1, seconds)              // 1 = silence; glides; music keeps running underneath
music.setVolume(v 0..1);  music.volume
music.state, music.pending, music.intensity, music.phase, music.bpm
music.time() -> seconds since the current state's bar 1 beat 1 (AUDIO clock);  music.beat() -> the same in beats (float)
music.bar() -> int;  music.beatPhase() -> 0..1 within the beat;  music.nextBeatIn() -> seconds
music.onBeat = null    // (beatIndex, barIndex, state): called from update() once per beat, at most ~1 frame late
music.STATES           // { name: { bpm } } — the table below, exported as MUSIC_STATES
```

States (bpm binding; all in 4/4; home pitch D so every crossfade is in tune):

| state | bpm | key / mode | character | layers by intensity (0 → 1) |
|---|---|---|---|---|
| `none` | 0 | — | silence | — |
| `chill` | 84 | D major (add9) | explore: warm pad, soft plucked melody = platypus theme fragments, brushed shaker | pad → + bass → + pluck arps → + melody / counter-melody → + light kit |
| `tribe` | 96 | D mixolydian | the camp: hand drums, log drum, kalimba, wooden flute; platypus theme in 3rds | drums → + log bass → + kalimba ostinato → + flute lead → + claps / chant "hey" |
| `stealth` | 100 | D minor (dorian colour) | tension: pizzicato ostinato, sub pulses, ticking hat, breathy pad; rests are part of it | sub pulse → + ticks → + pizz ostinato → + tremolo strings swell → + heartbeat kick, risers |
| `combat` | 140 | D minor | intense, driving: 16th string ostinato, taiko + kit, brass stabs, platypus theme in minor on horns | drums → + bass ostinato → + strings → + brass stabs → + lead theme, double-time hats |
| `boss` | 152 | D phrygian | the King's theme in low brass + choir "ah", anvil, taiko; phase 1 half-time, phase 2 full, phase 3 adds choir + lead + key lift to E for the last 32 bars | as combat, bigger; `setPhase` re-orchestrates |
| `flight` | 126 | A lydian → D major at high intensity | soaring: pulsing arps, wide pad, platypus theme augmented on a bright lead, toms | pad → + arp → + bass / kick → + lead → + snare builds, octave strings |
| `dream` | 66 | F♯ lydian over a D pedal | ethereal: glass pads, reversed swells, celesta = Wobble's motif | pad → + celesta → + choir → + harp runs → + low drum |
| `flashback` | 72 | D major | Pip's theme on a music box, slightly detuned, tape wobble, vinyl-soft noise | box alone → + pad → + glock doubling → + soft strings |
| `sorrow` | 60 | B minor | Pip's theme sad: solo, lots of space, falls and does not resolve | solo → + pad → + cello line |

Leitmotifs (scale degrees in the state's key; `'` = octave up, `.` = hold, `|` = bar line; quarter notes
unless marked): PLATYPUS `1 3 5 . | 6 5 3 2 | 1 . 2 3 | 5 . . .` (confident, rising; minor-key variant
in combat flattens 3 and 6). PIP `5 3' 2' 1' | 6 5 3 . | 4 6 5 3 | 2 . . .` (tender; `pipSad` = the same
in the relative minor at half speed, last note falls a step and is left hanging). WOBBLE = the pitches
of the existing `audio.wizardMotif()` (read them there; five notes, whole-tone lift, celesta + shimmer).
KING `1 . . ♭2 | 1 . ♭5 . | 4 ♭3 1 . | (rest)` in low brass, dotted, heavy; it is the bass line of
`boss` and is quoted once, quietly, by `stealth` at intensity ≥ 0.75.

Rules: all scheduling on the AudioContext clock with a look-ahead of ≥ 120 ms from `update()` (schedule
at least one beat ahead; the tab hides → the engine mutes, so no timers are needed). `play` to a new
state waits for the next bar (`at: "bar"`), plays a one-bar transition (riser + swell into
`combat`/`boss`/`flight`; a ringing chord and reverb tail into the calm states) and crossfades
equal-power over `fade` bars on the grid; `at: "now"` cuts on the next 16th (used by the scream).
Combat → a calm state plays the `victory` cadence automatically if `intensity` was ≥ 0.5.
Stingers and motifs are quantised to the next beat, in key, and duck the bed by 3 dB for their length;
`defeat` ducks it by 12 dB and is ≤ 1.2 s (the restart is fast). Composition: every state is at least a
16-bar form (A A′ B A″) with a real chord progression, voice-led pads, bass that outlines the harmony,
drum fills every 4th bar, and a melody that develops — no 2-bar loops. Variation by a seeded generator
is welcome as long as the motifs stay recognisable. Budget: ≤ 28 simultaneous voices (oscillators /
buffer sources), nodes created only in the scheduler (not per frame), everything disconnected after use.
Levels 1–5 are NOT hooked up in this round (they have their own loops in audio.js); do not auto-play.

## B2. `src/audio.js` — EXTENSIONS (append; all procedural; all through the existing buses)

`stopAll()` must also stop every loop below. Loops take `(on)` or `(level 0..1)`, fade ≥ 0.3 s, and are
safe to call twice. `pan` is −1..1; `dist` is 0 (at the camera) .. 1 (far: quieter, darker, more room).
Existing hook (do not change): `musicBus()` (B1). One-shots must be rate-limited internally where a
caller may spam them (shots ≥ 40 ms apart, impacts ≥ 30 ms, steps as today).

- Steps: `step(surface, strength, pan)` additionally knows `"dirt" | "leaves" | "mud" | "metal" |
  "canvas" | "concrete" | "cushion"` (cushion = the level-1 footfall, softer).
- UI: `checkpoint()` (two warm rising notes), `denied()`, `armyUp(n = 1)` (a bright pip per new unit,
  pitch rising with n), `armyDown()` (one soft falling note), `gearOn(kind = "leaf" | "suit" |
  "glasses" | "weapon")`, `visorOn()` (a little power-up sweep + tick).
- Guns: `gunshot(dist = 0, pan = 0, kind = "rifle" | "pistol" | "blaster")` (near: crack + body thump +
  short slap-back; far: a dull pop with a long tail; `"blaster"` = the player's launcher: a punchy
  "thoomp", clearly friendlier than the rifles), `bulletWhiz(pan)`, `ricochet(pan)`,
  `bulletHit(surface = "dirt" | "metal" | "wood" | "concrete" | "leaves", pan)`, `emptyClick()`,
  `aimWarn(pan)` (the short rising two-tone "being aimed at" cue that goes with the red telegraph line),
  `shotDown()` (level 11: ONE enormous close shot, then every bus ducks to silence over 0.25 s with a
  high ringing tone that fades for 4 s; released by `stopAll()` or `sadTheme(true)`).
- People (stylised gibberish, never words, never cruel): `guardVoice(kind, pan = 0, dist = 0)` with
  `"huh" | "hey" | "alert" | "search" | "lost" | "hurt" | "down" | "radio" | "laugh" | "yawn" | "order"`;
  `punch()`, `bodyFall(surface = "dirt")`, `siren(on, kind = "base" | "circus")` (base: a slow two-tone
  klaxon; circus: a hand-cranked bell-siren), `searchlightHum(level)`, `explosion(dist = 0)` (fuel dump).
- Helicopter: `heli.start()` (3 s spool-up whine into the rotor loop), `heli.stop(crashed = false)`,
  `heli.set(rpm 0..1, load 0..1, dist = 0)` (blade slap rate and pitch follow `rpm`; `load` adds the
  heavy "chop" and a strained turbine), `heli.on`; `wind(level 0..1)`, `gust(strength 0..1, pan)`,
  `crash(size 0..1)` (metal crunch, glass, debris tail), `metalScrape(pan)`, `warnBeep(on)` (cockpit
  alarm), `rotorWash(level)`.
- Circus: `circusAmbience(on)` (night: distant generator hum, canvas flapping, a far crowd leftover
  murmur, crickets, now and then 2–4 bars of a wheezy calliope waltz drifting on the wind),
  `calliope(n = 0)` (one clear fragment), `canvasFlap(strength)`, `cageRattle()`, `latchBreak()`,
  `bell()` (the high-striker distraction), `generator(on, sputter = false)`, `bottles()` (knocked over).
- Jungle: `jungleAmbience(on, time = "day" | "night" | "dawn" | "mist")` (day: layered birds — at
  least five species with call-and-answer —, cicada beds that swell and stop, wind in leaves, far
  monkeys; night: frogs, crickets, owls, a distant growl; dawn: the chorus building; mist: sparse,
  dripping), `jungleLayers({ birds, insects, river, rain, wind })` (each 0..1, glides), `river(level)`,
  `rain(level)`, `thunder(dist)`, `birdsFlush(n = 12, pan = 0)` (a burst of wings and alarm calls),
  `mysteryCall(closeness 0..1, pan)` (the strange noise: a low, warbling, almost musical platypus
  growl-trill that quotes the first three notes of the PLATYPUS motif; nearer = clearer and drier),
  `vines()` (rustle of a curtain of vines), `logCreak()`.
- Tribe: `tribeChatter(level 0..1)` (a loop of many soft chirps, purrs and growl-trills),
  `tribeChirp(mood, volume = 1, pan = 0, pitch = 1)` (moods of `friendChirp` + `"greet" | "cheer" |
  "war" | "mourn"`), `tribeCheer(size 0..1)`, `warCry()`, `tribeDrums(on, intensity = 0.5)` (diegetic
  log drums; quantise to `ctx.music` when it is in state `tribe`: read nothing from music.js — the level
  passes the phase: `tribeDrums(on, intensity, nextBeatInSeconds, bpm)`), `fire(level 0..1)` (crackle),
  `craft(kind = "weave" | "bone" | "tie" | "tighten" | "done" | "slip")`, `eatFruit()`, `materialPickup(kind)`.
- Potions: `cauldron(level 0..1)` (bubbling loop), `ingredient(i 0..2, correct = true)`, `stir(onBeat)`,
  `brewDone()`, `brewFail()`, `potionPickup()`, `potionThrow()`, `potionSmash(pan)`,
  `transform(seconds = 2.6)` (a rising shimmering swirl that ends in a soft major "bloom" and one new
  platypus chirp — wonderful, not scary), `livingPotion()` (a slow glassy heartbeat-glow tone, 3 s).
- THE SCREAM: `screamCharge(frac)` (call every frame while charging; 0 stops: an inhale that tightens
  into a rising whistle-tone), `scream(power = 1, controlled = true)` — enormous: a formant shriek
  layered with a sub drop and noise, driven hard into the limiter for 0.5 + 0.5·power s, then THE
  SILENCE: every other bus and the music (`duck` + the level calls `music.duck`) drop out for
  1.2 + 2·power s with only a faint high ring and a muffled heartbeat, then the world fades back over
  1.5 s (birds return last). `controlled = false` (level 8) is rawer, breaks up, longer silence (4 s).
  Returns the silence length in seconds. `screamFizzle()` (a squeak and a cough).
- Dream: `dreamAmbience(on)` (slow glass pad, far wind chimes, reversed breaths), `dissolve(pan)`
  (a soldier turning to mist: airy "fff" with falling sparkles), `farVoice(syllables = 5, urgency 0..1)`
  (the voice with no wizard: Wobble's blip timbre, far away, wet, pitched up with urgency),
  `pillarShatter(n)`.
- Boss: `bossRoar(size = 1)`, `bossStep(strength)`, `bossWindup(kind = "sweep" | "slam" | "charge" |
  "pound" | "spit")` (distinct rising cues, 0.7–1.1 s — the audio telegraphs), `bossSwipe()`,
  `bossSlam()`, `bossCharge(on)` (galloping loop), `bossHitWall()`, `bossHurt(weakSpot = false)`
  (`false` = armor clank + grunt), `bossPhase()`, `kingFall()` (4.5 s: a long groan, the crown clattering
  and rolling, the body hitting the ground with a sub thump, dust settling, silence), `crownClatter()`.
- Items: `paperRustle()`, `paperUnfold()`, `armorClank(weight 0..1)`, `leverPull()`, `gateOpen(heavy)`,
  `fenceRattle()`, `truckEngine(on)`.

## B3. `src/platypus.js` — EXTENSIONS (everything existing stays exactly as is)

`createPlatypus(THREE, opts)`: `opts.variant` also accepts
- `"tribe"`: `opts.seed` (int) picks fur tone (dark umber … sandy), size (0.82–1.05), tail width, a
  face/back marking; `opts.elder` (grey muzzle and brows, slower, slight stoop), `opts.young` (scale
  0.55, bigger head and eyes), `opts.paint` (hex | null: two ochre/white war-paint stripes across the
  back and bill), `opts.collar` (hex | null: a woven leaf collar);
- `"king"`: scale 3.2 (≈ 3.2 m long, 1.0 m at the back, `radius` 1.5), near-black fur with a silvered
  ridge, old scars (pale furless lines across the face and flank), a notched tail, a heavier brow, one
  milky eye, long venom spurs; NO crown (boss.js adds crown, armor and cape). Extra anchors:
  `crownAnchor` (top of the head), `capeAnchor` (between the shoulders), `armorAnchors = { chest,
  shoulderL, shoulderR, tail }` (Object3Ds that follow the skeleton).
Geometry / textures stay shared at module level; budget per instance unchanged (< 30k tris, < 12 calls).

New on every instance:
- `setGear(slot, id | null)` — attachable meshes that follow the skeleton (parented to bones or skinned
  with the same skeleton), built lazily on first use, ≤ 3 extra draw calls and ≤ 5k triangles for a full
  set: body `"leaf"` (overlapping broad leaves as a back/shoulder mantle laced with vine, small bone
  toggles, two rib-bone shoulder guards), body `"suit"` (matte dark tactical vest with pouches and
  straps, knee/elbow pads; the bone shoulder guards of `"leaf"` remain on top), head `"boneHelm"`
  (a small skull-cap of bone with a leaf plume), eyes `"glasses"` (wrap-around tinted glasses on a
  strap, faint green lens glow), weapon `"blaster"` (a short tube launcher along the spine with a
  sight, `muzzle` at its mouth), back `"pack"` (a small satchel). Unknown ids are ignored.
  `gearWorn(slot) -> id | null`.
- `muzzle`: Object3D (in front of the bill when no weapon is worn; at the launcher's mouth otherwise).
  `setAim(relativeYaw | null)`: head, neck and launcher twist toward a yaw relative to the body
  (clamped ±1.3, smoothed 0.08 s); null releases. `fire() -> 0.18` (recoil kick; fx are the caller's).
- `potionThrow() -> 0.55`, `potionReleaseTime = 0.2` (rears a little, an overarm fling with a front
  paw; the engine calls it). `holdFlask(on)` (paw raised holding an invisible flask: `holdAnchor` is
  where potions.js parents it) — used while aiming.
- `screamCharge(frac 0..1)` (call every frame while charging: deep inhale, chest swells, head draws
  back, fur bristles; 0 releases), `scream(power = 1, controlled = true) -> duration` (controlled:
  braced stance, bill wide open, whole body shaking, tail planted, ≈ 0.9 + 0.5·power s; uncontrolled:
  convulsive, back arched, eyes squeezed shut, limbs splayed — works while `pose("carried")`),
  `screamTime = 0.12` (seconds until the sound leaves), event `"scream"` at that moment.
- `finisher() -> 0.85`, `finisherHitTime = 0.4` (a short leap and a spinning double strike: spur then
  tail), event `"finish"`.
- `collapse(kind = "fall" | "shot")` (drops and lies still, eyes closed; `"shot"` = knocked sideways
  mid-stride and slides), `revive()` (instantly back to normal: used by the restart), `collapsed`.
- `sitUp() -> 1.6` (from lying on its side: stirs, shakes, sits up blinking — the newborn platypus
  after the potion), `cheer() -> 1.2` (rears, front paws up, two hops).
- `pose(name)` additionally: `"sneak"` (belly low, slow careful feet, tail still — walk cycle keeps
  working at ≤ 1.6 m/s), `"struggle"` (carried and fighting: strong wriggles, kicks), `"aim"` (weapon
  stance), `"kneel"` (bowed before the elder), `"proud"` (chest out, head high — the King's idle),
  `"wounded"` (the King's last phase: favouring a side, heavy breathing).
- King-only attack animations (work on any instance, sized by its scale): `attack(name) -> duration`
  with `attacks = { sweep: { dur: 1.9, windup: 0.9, hit: 0.9, recover: 1.0 }, slam: { dur: 2.9,
  windup: 1.0, hit: 1.0, recover: 1.9 }, charge: { dur: 1.1, windup: 1.1 } (then `charging(on)` runs
  the gallop until told to stop), pound: { dur: 2.2, windup: 1.1, hit: 1.1 }, spit: { dur: 1.3,
  windup: 0.8, hit: 0.8 }, roar: { dur: 1.8, hit: 0.5 }, stagger: { dur: 2.5 }, fall: { dur: 4.5,
  hit: 2.6 } }` — the numbers are binding (boss.js times its telegraphs with them); events
  `"windup"`, `"hit"`, `"done"` through `onEvent`.

`export function createPlatypusCrowd(THREE, max = 48, opts) -> crowd` — the cheap many: ONE (at most
two) InstancedMesh of a ~450-triangle platypus (recognisable silhouette: flat bill, sprawled legs,
paddle tail), all motion in the vertex shader from per-instance attributes; `opts = { castShadow:
false }`. Used by tribe.js (the village) and combat.js (allies, rivals).
`crowd.group`, `crowd.max`, `crowd.set(i, x, y, z, yaw, scale, tintHex)`, `crowd.anim(i, name, phase =
random)` with `"idle" | "walk" | "run" | "attack" | "cheer" | "sleep" | "sit" | "down" | "eat"`,
`crowd.paint(i, hex | null)` (war-paint stripe colour), `crowd.hide(i)`, `crowd.fade(i, 0..1)`,
`crowd.update(dt, time)`, `crowd.commit()` (uploads the changed attributes: call once per frame after
the sets). ≤ 2 draw calls and ≤ 22k triangles at 48.

## B4. `src/fx.js` — EXTENSIONS (pooled; closed-form motion in shaders; ≤ 8 extra draw calls in total)

All respect the scaled dt of `fx.update`; `fx.clear()` clears them. Positions are `{ x, y, z }` or
Vector3. Handles are `{ remove() }` unless stated.

- Guns: `muzzleFlash(pos, dirX, dirZ, size = 1)`, `tracer(from, to, speed = 90, colorHex = 0xffe9a0)
  -> flightSeconds` (a short bright streak travelling the segment), `bulletImpact(pos, surface =
  "dirt" | "metal" | "wood" | "concrete" | "leaves")` (puff / sparks / chips),
  `telegraph(from, to, seconds, colorHex = 0xff3020) -> id` (a thin red line that blinks faster and
  brightens over `seconds`, then vanishes: "you are being aimed at"; pool of 8; `telegraphMove(id,
  from, to)`, `telegraphCancel(id)`).
- Ground warnings (fair telegraphs for the boss and area attacks):
  `dangerZone({ shape: "circle" | "cone" | "line" | "ring", x, z, r, yaw, arc, len, width, seconds,
  colorHex = 0xff3020 }) -> id` — a flat marker on the ground whose fill sweeps from 0 to full over
  `seconds`, flashes white on the last frame and goes; pool of 8; `dangerCancel(id)`.
  `slam(x, z, radius, colorHex = 0xffd9a0)` (impact burst + dust ring + pooled crack decal),
  `shockRing(x, z, speed = 9, maxRadius = 12, colorHex) -> id` (a ring of dust travelling outward at
  `speed`; `shockRadius(id) -> current radius | −1`: boss.js tests the player against it).
- THE SCREAM: `screamWave(x, y, z, power = 1) -> seconds` — a white-hot core flash, a ground ring
  racing out at 24 m/s to `8 + 14·power` m with a wall of dust and torn leaves behind it, a faked air
  distortion (two concentric additive shells with radial streaks whose normals scroll — no real
  refraction), a second slower low ring. While it runs fx drives `fx.shock`:
  `fx.shock = { uniform: { value: Vector4(x, z, radius, strength) }, x, z, radius, strength, active }`
  — ALWAYS present (strength 0 when idle). Worlds bind `fx.shock.uniform` in their foliage / grass /
  canvas vertex shaders: vertices near the front (|dist − radius| < 2.5) bend away from (x, z) by
  `strength`, and stay flattened behind it, springing back over 3 s (fx animates `strength` back to 0).
- Potions: `potionTrail(pos)` (call per frame on the flying flask: green-gold motes),
  `potionSplash(x, y, z, colorHex = 0x6dffa8)` (glass glints + liquid crown + a low glowing mist disc
  of radius 1.1), `transformSwirl(x, y, z, seconds = 2.6, height = 1.9)` (two counter-rotating ribbons
  of light spiralling up, a column of sparkles, a soft bloom flash at 80 %, falling glints after),
  `dissolve(x, y, z, height = 1.8, colorHex = 0xbfd0ff, n = 40)` (a body-shaped column of mist motes
  that drifts up and thins: dream soldiers), `beacon(x, y, z, colorHex = 0xffe08a) -> handle
  { set(x, y, z), remove() }` (a soft vertical light pillar + ground glint marking an interactable;
  pool of 8).
- Helicopter: `rotorWash(x, groundY, z, strength 0..1)` (call per frame near the ground: a ring of dust
  blown outward), `crashSparks(pos, n = 30)`, `smoke(x, y, z, size = 1, seconds = 6)` (a pooled dark
  puff column; call again to sustain), `windStreaks(on, dirX, dirZ, strength)` (thin streaks crossing
  the air around the camera: the visible gust telegraph), `ringGate(x, y, z, yaw, r, colorHex) ->
  handle { pass() (bursts and fades), set(…), remove() }` (pool of 16 guide rings of light).
- Fire and night: `campfire(x, y, z, size = 1) -> handle { level(0..1), remove() }` (instanced flame
  cards + embers + a ground glow disc; pool of 6; no light), `torch(x, y, z) -> handle`,
  `fireflies(on, cx, cz, radius = 14, n = 40)`, `lightShafts(list | null, colorHex = 0xfff2c0,
  strength = 0.5)` (list of up to 8 `{ x, y, z, yaw, w, h, tilt }`: additive soft-edged cards with slow
  dust in them; null removes), `dreamMotes(on, radius = 14, colorHex = 0xcfd6ff)` (slow drifting
  motes around the camera focus), `mistCards(list | null, colorHex, opacity)` (up to 10 big soft cards).
- Life: `birds(x, y, z, n = 12, dirX = 0, dirZ = 0)` (a flock bursting up and away: instanced
  flapping chevrons, 4 s), `leaves(x, y, z, n = 20, colorHex)` (tumbling leaf burst),
  `footDust(x, y, z, strength, colorHex)`.
- Boss / items: `venomGlob(from, to, seconds) -> id` (an arcing green glob; lands with `stingBurst`),
  `crownSpark(pos)`, `paperGlint(pos)`.

## B5. `src/combat.js` — enemies, allies, projectiles

`createCombat(ctx) -> combat` (key `"combat"`): `group` (add to the active world's group),
`setWorld(world)` (uses `heightAt`, `colliders`, `confine`, `sight`, `hidden`, `lit`, `cover`),
`update(dt, time)`, `reset()` (no enemies, no bodies, no allies, no projectiles; callbacks kept).

**Rendering.** All humans are SEGMENT-INSTANCED (the technique of `crowd.js` visitors): ≤ 10
InstancedMeshes shared by every human on screen (torso, hips, head + headgear, upper arm, forearm +
hand, thigh, shin + boot, weapon/prop, pack, face detail), per-instance colour, limbs posed by instance
matrices from a small analytic rig (walk / run / aim / swing / stagger / fall / lie / carry cycles).
Proportions and silhouettes must read as real adults (1.75 m, correct joints), not blocks: lofted limb
segments, helmets, boots, webbing. Budget: ≤ 12 draw calls and ≤ 45k triangles for 24 humans; they cast
no shadow (a soft blob shadow quad per human in one more instanced draw). Platypuses (allies, rivals)
use `createPlatypusCrowd` (B3). Vision cones are ONE instanced fan mesh on the ground.

**Enemies.**
```js
combat.spawn(kind, x, z, { yaw = 0, route = null, loop = true, post = false, sweep = 0, squad = 0, hp, skin, asleep = false, passive = false }) -> enemy
combat.enemies   // live array of enemy objects (stable identities; pass it as ctx.abilities.targets)
```
`kind`: `"guard"` (circus roustabout: striped shirt, braces, cap, a lantern in one hand and a net/baton
in the other; melee: catches), `"handler"` (the jungle capture party: khaki, boots, a carry-pole/net;
melee), `"soldier"` (fatigues, helmet, webbing, rifle; ranged), `"officer"` (peaked cap, pistol;
ranged, shouts orders: his squad's aim time is 15 % shorter while he stands), `"dreamSoldier"`
(a soldier made of pale blue glass-mist, faceless, slow; `passive: true` = a training dummy that only
turns to face you), `"rival"` (a rival-tribe platypus: ash-grey with red paint; melee, drawn with the
platypus crowd).

`enemy` = `{ kind, x, y, z, yaw, r: 0.45, hp, maxHp, alive, targetable, state, staggered, seen (0..1),
squad, behind(x, z) -> bool, hit(dmg, src) -> bool, stun(seconds), knockOut(src), distract(x, z,
seconds = 6), alert(x, z), goto(x, z, run), setRoute(route, loop), carry(on), carryAnchor, remove() }`.
`state` ∈ `"idle" | "patrol" | "suspicious" | "search" | "alert" | "chase" | "windup" | "attack" |
"cover" | "aim" | "stunned" | "down" | "gone"`. Default hp: guard 60, handler 60, soldier 80, officer
80, dreamSoldier 68, rival 40.

**Senses** (guards, handlers, soldiers, officers; rivals just charge within 9 m). Vision cone: half-angle
38°, range 9 m for guards at night, 13 m for soldiers (× `world.lit` factor 0.6 + 0.8·lit, × 0.55 when
the player sneaks — `player.maxSpeed ≤ 1.6` and `ctx.input.held("down")` —, 0 when `world.hidden` unless
within 1.6 m, blocked by `world.sight`). While the player is in the cone the enemy's `seen` fills in
`1.5 s × (dist / range)` + 0.35 s (closer = faster) and drains at 0.6 /s otherwise. `seen > 0.35` →
`"suspicious"` (stops, turns, "huh"); `seen ≥ 1` → `"alert"`: shout ("hey!"), then after 0.8 s the whole
squad within 18 m is alerted. Hearing: running within 4 m behind a guard adds 0.5 /s; sneaking is
silent. `combat.seen` = the highest `seen` (drive `ui.setSeen(combat.seen, combat.alertState)`),
`combat.alertState` ∈ `"hidden" | "suspicious" | "spotted"`, `combat.alerted` (count).
`combat.showCones(bool)` (default true for guards/handlers: white cone, yellow when suspicious, red when
alert; soldiers show none — they have the aim line).
Lost sight for 6 s → `"search"` (walks to the last seen point, looks around 5 s) → back to the route.
`combat.noise(x, z, radius, seconds = 6)`: every non-alert enemy within `radius` goes to look
(distractions). `combat.calm()`: everyone back to routes.

**Melee enemies** (guard, handler): chase at 2.7 m/s (the player runs 3.0: you can always outrun one in
the open; they catch you in dead ends and when you are surrounded). Within 1.2 m: GRAB — a 0.6 s windup
with arms spread, `fx.dangerZone` circle r 1.1 at the player's feet and `audio.guardVoice("hey")`;
if the player is still within 1.2 m at the end → event `"caught"` (the LEVEL decides: level 7 calls
`ctx.checkpoint.respawn({ text: "Caught! Try again" })`). A grab can be dodged by moving out, jumping
back, or interrupted by any hit.

**Ranged enemies** (soldier, officer) — fair by construction:
1. To shoot, a soldier needs a FIRE TOKEN; `combat.maxShooters = 2` (level 10 sets 2, then 3 for the
   escape) soldiers may hold one at a time; the others advance, take cover or keep aiming without firing.
2. AIM: `aimTime = 0.75 s` (× assist) with `fx.telegraph` from the muzzle to the target and
   `audio.aimWarn`; the line tracks the target for the first 70 % and then LOCKS on that point.
3. BURST: 3 shots 0.11 s apart at the locked point (± 0.25 m scatter), each a `fx.tracer` +
   `audio.gunshot` + `fx.muzzleFlash`; a shot hits if at its arrival the target is within 0.45 m of the
   shot line and no `world.cover` object lies between (then `fx.bulletImpact` on the cover +
   `audio.ricochet`). Player hit: `ctx.health.damage(combat.bulletDamage = 34, { x, z, kind:
   "bullet" })` (the mercy time means at most one hit per burst). Near misses play `audio.bulletWhiz`.
4. Then 1.2–1.8 s of recovery (reposition to a cover point `world.coverPoints`, or reload) before the
   token is free again. Running across the line of fire at full speed always dodges a locked burst.
Targets: the player or an ally (weights: player 0.5, allies share 0.5; an enemy never switches target
mid-aim). `combat.aimScale = 1`, `combat.damageScale = 1`, `combat.viewScale = 1` — the level applies
the assist rule of A2 by setting these.

**The player's attacks** (the level calls these from its `onAction`; ranges from the player's centre):
```js
combat.strike(kind) -> { enemy | null, result }   // kind "sting" | "slap" | "pulse" | "finisher"; uses player.x/z/yaw
combat.playerShot(origin, dirX, dirZ, target, dist) -> enemy | null   // from ctx.abilities.shoot.onFire: tracer, impact, 50 dmg
combat.blast(x, z, radius, power) -> count      // the scream: every enemy within radius is knocked out, outward, at once
combat.strikeRange = { sting: 1.2, slap: 1.5, finisher: 1.8 }
```
- sting: nearest enemy within 1.2 m in the front 120°: 34 dmg + venom (slowed 40 %, 3 s).
- slap: nearest within 1.5 m in ANY direction (the tail whips round): 40 dmg + knock-down for 1.2 s
  (state `"stunned"`: cannot attack).
- pulse: only when the player stands in water (`player.inWater`): every enemy in the same connected
  water within 7 m (max 3, nearest first) takes 60 dmg + `"stunned"` 2 s (`fx.electroPulse` per target).
- An enemy at ≤ 34 hp, or stunned by a slap, or hit from behind while not alert, is `staggered`
  (sways, a gold marker ring under it, `enemy.staggered = true` for 2.5 s): ANY hit on a staggered
  enemy is a FINISH — it goes down at once, with `result: "finish"`. The level plays
  `platypus.finisher()` when `kind === "finisher"` or when a strike will finish (ask first:
  `combat.wouldFinish(kind) -> bool`).
- A sting or slap from behind on an enemy that is not alert (`enemy.behind(player.x, player.z)`) is a
  silent TAKEDOWN: down at once, `result: "takedown"`, no shout, squad not alerted.
- `result` ∈ `"miss" | "hit" | "stagger" | "finish" | "takedown" | "blocked"`. The level plays the
  platypus animation and the miss sound; combat plays hit fx/sounds (`audio.punch`, `fx.hitBurst`,
  `audio.guardVoice("hurt" | "down")`, `audio.bodyFall`).

**Fallen bodies.**
```js
combat.bodies   // live array: { x, y, z, yaw, kind, age, alive (true until transformed / faded), targetable, r: 0.9, enemy, transform() }
combat.bodyTTL = 12     // seconds before a body fades away (Infinity while potions are in play: levels 6 and 11)
```
A downed human lies where they fell (pose "down"; breathing is NOT shown — they are simply out).
`dreamSoldier` bodies stay as a faint glass shape and dissolve (`fx.dissolve`, `audio.dissolve`) after
`bodyTTL`. `body.transform()` (called by potions.js at the swap moment) removes the body with a
shrinking scale. `rival` platypuses leave no body: they yelp, roll, and run off (`"gone"`).

**Allies.**
```js
combat.addAlly(x, z, { look = seed | null, paint = null, newborn = false, hero = null, hp = 60 }) -> ally
combat.allies    // live array: { x, y, z, yaw, alive, hp, state, name, r: 0.35 }
combat.order(mode, point)   // "follow" (default) | "attack" | "hold" (at point) | "charge" (at point) | "retreat" (to point)
combat.allyDamage = 12;  combat.allyRate = 1.2   // one ally: a leaping sting every 1.2 s
```
Drawn with the platypus crowd (≤ 40); `hero` = a tribe.js member object (B8) to drive instead of an
instance (≤ 3 at once: Rok, Moss, Nib — combat then calls `hero.place` / `hero.do("fight" | "follow")`
and reads its `x, z`). Each ally is added to `ctx.army` on creation and `army.lose`d when it falls.
AI: `"follow"` = run to `ctx.army.slot(i)` (speed 3.4, never blocks the player); in any mode an ally
within 9 m of an enemy that is alert or attacking peels off, attacks (leap, sting, hop back) and
returns. Allies take bullets (60 hp, 34 per hit) and grabs (a grabbed ally is knocked out). A fallen
ally lies still, `fx.sadMotes`, `audio.tribeChirp("mourn")` from the nearest ally, fades after 8 s —
event `"allyDown"`. `newborn: true` plays the sit-up first (B6). `combat.reviveAllies()` (level 10's
restore puts the squad back to the checkpoint's roster: pass the count: `combat.setAllies(n, x, z)`).

**Carrying** (level 8): `enemy.carry(true)` = the handler holds the pole/net; `enemy.carryAnchor`
(Object3D): the level copies its world transform onto `platypus.group` while `player.scripted`.

**Events.** `combat.onEvent = (type, a, b) => {}` with: `"suspicious"(enemy)`, `"spotted"(enemy)`,
`"lost"(enemy)`, `"allClear"()`, `"caught"(enemy)`, `"aim"(enemy, target)`, `"shot"(enemy)`,
`"playerHit"(enemy, dmg)`, `"hit"(enemy, kind)`, `"stagger"(enemy)`, `"down"(enemy, result)`,
`"allDown"()` (no living enemies left), `"allyDown"(ally, enemy)`, `"allyKill"(ally, enemy)`.
`combat.alive` (count of living enemies), `combat.count(kind)`.

## B6. `src/potions.js`

`createPotions(ctx) -> potions` (key `"potions"`): `group`, `setWorld(world)`, `update(dt, time)`, `reset()`.

- Pickups (a round-bellied green-gold flask with a cork, glowing, bobbing; pool of 8, one instanced
  draw + `fx.beacon`): `spawn(x, z) -> id`, `nearest(x, z, maxDist) -> id | −1`, `pos(id, out)`,
  `collect(id)` (pop + `audio.potionPickup`; the LEVEL then calls `ctx.abilities.potion.add(1)`),
  `active(id)`, `clear()`. `autoCollect = true`: walking within 0.7 m collects and fires
  `onCollect(id)`.
- Brewing (level 6): `ingredients` — `spawn(kind, x, z)` with `"glowcap"` (a blue-glowing mushroom),
  `"moonpetal"` (a silver flower), `"dewdrop"` (a floating bead of water), `nearest`, `collect(id) ->
  kind`, `held` (array of kinds carried, max 3), `clear()`.
  `cauldron = { group, x, z, place(x, z), recipe (array of 3 kinds, set by the level), show(bool)
  (rim runes light up in the recipe's colours, left to right), add(kind) -> bool (the next one in the
  recipe? wrong: a puff of grey smoke, `audio.brewFail`, the cauldron empties), filled (0..3),
  stirring, startStir(), stir(quality 0..1), stirs (0..4), done (bool), take() -> 3 (potions ladled
  out; the level adds them), reset() }`. The liquid changes colour with each ingredient and turns
  green-gold when done. STIRRING: four stirs, one per press of E; the LEVEL judges each press against
  the beat (`ctx.music.beatPhase()`: within 0.18 of a beat = good) and passes `quality`; a bad stir
  just does not count (no failure).
- The throw: `throw(from, to, seconds, apex, target) -> id` (from `abilities.potion.onThrow`): the
  flask flies the parabola `abilities.arcY`, tumbling, with `fx.potionTrail`; on landing:
  `fx.potionSplash`, `audio.potionSmash`, and every un-transformed body of `potions.bodies` (set it:
  `potions.bodies = combat.bodies`) within `potions.splash = 1.6` m starts transforming (max 3 per
  flask). `onSplash = (x, z, bodiesHit) => {}`; a flask that hits nothing useful: `onMiss(x, z)`.
  `holdFlask(on)`: shows a flask at `platypus.holdAnchor` while aiming (the level toggles it from
  `abilities.potion.aiming`).
- THE TRANSFORMATION (2.6 s, wonderful — the showpiece of the mechanic), `transform(body)`:
  0–0.5 s the body glows from within and lifts 0.35 m off the ground, limbs relaxing;
  0.5–1.9 s `fx.transformSwirl` around it, the human shape shrinks and brightens into a ball of
  green-gold light (`body.transform()` at 1.4 s) while `audio.transform` rises;
  1.9 s the bloom: a new platypus shape unfurls from the light — event `onTransform(body, x, z)`:
  the LEVEL calls `combat.addAlly(x, z, { newborn: true })`, which shows the newborn lying on its
  side at that spot; 1.9–2.6 s the light sinks into its fur as falling glints;
  then the newborn `sitUp()`s (1.6 s), looks at the player, chirps (`audio.tribeChirp("greet")`),
  `fx.hearts`, and joins the army — `onJoined(ally)`.
  `transforming` (count in progress).
- The LIVING POTION (level 11): `living = { group, place(x, y, z), drop(x, z, fromY = 2.2) (falls,
  bounces twice, rolls, comes to rest upright; `audio.livingPotion` when it settles; `resting`),
  setGlow(0..1), pickUp(anchor), hide(), pick (a proxy mesh for `ctx.pick`) }` — a larger, ornate,
  heart-shaped crystal bottle of slowly swirling rose-gold light on a braided cord, with a parchment
  LABEL tied to its neck that reads **LIVING POTION** in hand-drawn capitals (canvas texture, drawn
  once, readable in a close-up at 0.5 m).

## B7. `src/boss.js` — the Platypus King

`createBoss(ctx) -> boss` (key `"boss"`): `group` (add to the world's group), `setWorld(world)`,
`setArena({ x, z, r, pillars: [{ x, z, r }] })`, `place(x, z, yaw)`, `update(dt, time)`, `reset()`.

Model: `createPlatypus(THREE, { variant: "king" })` + a heavy dented GOLD CROWN with five points and
dull red stones (on `crownAnchor`; a separate object so it can fall), overlapping BONE-AND-BRONZE ARMOR
plates on chest, shoulders and tail base (on `armorAnchors`; gaps at the ANKLES and under the tail: the
weak spots, marked by a faint pulsing glow when vulnerable), a tattered deep-red CAPE (vertex-shader
cloth: sways, flares in the charge). ≤ 18 draw calls, ≤ 45k triangles, casts a shadow.

State: `x, z, yaw, r: 1.5, hp, maxHp: 300, phase (0..2), alive, vulnerable (bool), state, body` (the
platypus API). `start()` begins phase 0 with a roar; `pause(bool)`. `assist = 0 | 1 | 2` (set by the level from `checkpoint.tries`: 1 = his damage ×0.75, windups ×1.15; 2 = ×0.5, ×1.3, openings +0.5 s).

Damage to him: `boss.hit(dmg, { kind: "sting" | "slap" | "shot" | "ally" | "finisher", x, z }) ->
"weak" | "armor" | "none"`. While `vulnerable`: full damage ×3 on the weak spots — the level uses
sting 8, slap 12, shot 6 (so a vulnerable window is worth about 60–80), `audio.bossHurt(true)`,
`fx.stingBurst`. Otherwise ×0.2 with `audio.bossHurt(false)` (armor clank) and the hint "His armor is
too thick — wait for an opening!" once. Allies: each living ally within 4 m does 1 hp/s, capped at
8 hp/s in total (the army you built matters, and cannot win alone). Each phase is 100 hp; hp cannot
drop below a phase floor in one window (the phase change always plays).

Every attack is TELEGRAPHED three ways at once — pose (`body.attack(name)` windup), ground marker
(`fx.dangerZone`, filling over the windup) and sound (`audio.bossWindup(kind)`) — and never starts
within 0.6 s of the previous one ending. Windups (seconds) are those of `platypus.attacks`; phase 2
multiplies them by 0.9, phase 3 by 0.8 (never below 0.7).

| attack | telegraph zone | effect | how to survive | opening |
|---|---|---|---|---|
| TAIL SWEEP | cone 150°, r 5.0 in front-side | 25 dmg + knock-back 6 | back away or JUMP at the hit | — |
| BILL SLAM | circle r 2.4 at the player's position, locked 0.5 s before the hit | 30 dmg; `fx.slam` | walk out of the circle | his bill is stuck 1.8 s: `vulnerable` |
| CHARGE | line 18 × 2.6 m toward the player, locked at 70 % of the windup | 35 dmg + knock-back 9 | sidestep; stand in front of a pillar and dodge | hits a pillar (it cracks; 3 hits break it) or the arena wall: stunned 2.6 s, `vulnerable` |
| GROUND POUND (phase 2+) | circle r 3 under him, then `fx.shockRing` to r 12 at 9 m/s (two rings 0.9 s apart in phase 3) | 20 dmg per ring | JUMP over the ring | lands heavily: 1.2 s `vulnerable` |
| VENOM SPIT (phase 2+) | three circles r 1.5 (the player's position, then led positions 0.4 s apart) | 15 dmg each, slows 2 s | keep moving | — |
| ROAR / SUMMON (start of phases 2 and 3) | — | pushes everyone back 5 m (no dmg); event `"summon"(n)`: the LEVEL spawns n soldiers at the arena gates (potion fodder: knock them out, throw, the army grows) | — | — |

Phase 3: combos (sweep → slam; charge → pound), the cape tears away, `body.pose("wounded")` between
attacks. Pattern selection: never the same attack three times running; a CHARGE at least every fourth
attack (it is the reliable opening); after 20 s without an opening in any phase the next attack is a
BILL SLAM. Player-hit tests use `ctx.health.damage(dmg, { x: boss.x, z: boss.z, kind: "melee", knock })`
and respect jumping (`!player.grounded` clears sweeps and rings).

Events: `boss.onEvent = (type, data) => {}`: `"telegraph"(name)`, `"attack"(name)`, `"hitPlayer"(name)`,
`"opening"(seconds)`, `"closed"()`, `"hit"("weak" | "armor")`, `"pillar"(index, broken)`,
`"phase"(n)` (hp crossed a floor: he staggers 2.5 s, roars; the level sets `ui.boss.phase(n)`,
`music.setPhase(n)`, a checkpoint), `"summon"(n)`, `"finalStagger"()` (hp 0: he sways, `vulnerable`,
waits for ONE last hit by the player — any attack), `"defeated"()`, `"crownOff"()`, `"landed"()`,
`"drop"({ potion: {x, z}, paper: {x, z} })`.
`boss.setHp(hp)` / `boss.setPhase(n)` (checkpoint restore: full phase hp, pillars as they were at the
phase start, he walks back to the centre).

Defeat — `boss.defeat()` runs by itself after the last hit (≈ 9 s; the LEVEL frames it with
`cinema.play` shots tracking `boss.group`): time slows (the level), he rears up to his full height, the
crown slips (`"crownOff"`: it falls, clatters, rolls and comes to rest: `boss.crown = { group, x, z,
resting }`), `body.attack("fall")`: he topples onto his side — "he drops down" — (`"landed"` at the
impact: `fx.slam`, dust, `audio.kingFall()` started with the fall, camera shake by the level), his paw
opens: `"drop"` — the level calls `potions.living.drop(potion.x, potion.z)` and
`boss.paper.flutterDown(paper.x, paper.z)`. He stays down, still, eyes closed (`body.pose("still")`).

The paper: `boss.paper = { group, place(x, z), flutterDown(x, z) -> 2.4 (see-saws down, lands),
resting, pick (proxy mesh), setReadable(0..1) }` — a creased parchment. Two canvas textures drawn once:
SCRIBBLES (what the platypus sees: confident but meaningless loops, hooks and dots laid out as three
lines, with a tiny drawing of a cliff edge and a crossed-out paw print) and the REAL TEXT, the same
layout in the same ink: **NEVER APPROACH THE FARLANDS**. `setReadable` crossfades scribbles (0) ↔ text
(1) in the shader. `boss.paper.cam = { pos, look }` relative helper: `paperShot(out)` fills a close-up
camera pose 0.45 m above the resting paper.

## B8. `src/tribe.js`

`createTribe(ctx) -> tribe` (key `"tribe"`): `group`, `setWorld(world)`, `update(dt, time)`, `reset()`.

**Named members** (full models: `createPlatypus(THREE, { variant: "tribe", … })`; built lazily; at most
FOUR visible at once — `member.visible`): `tribe.members = { moss, burra, tika, rok, nib }`.

| key | name | who | look |
|---|---|---|---|
| `moss` | Moss | the scout whose strange call you follow; curious, quick; becomes your guide | lean, mossy-brown, a green leaf collar |
| `burra` | Old Burra | the elder; slow, kind, grave; speaks in captions | `elder`, grey muzzle, bone-bead necklace, sits on the elder's rock |
| `tika` | Tika | the crafter; busy paws, proud of her work | sandy, a vine sash with bone needles |
| `rok` | Rok | the lead hunter; big, scarred, brave; leads the raid and the base mission | large (scale 1.05), white paint stripes, a notched tail |
| `nib` | Nib | a young one who adopts you | `young`, oversized leaf hat |

Member API (the subset of friend.js that levels need): `group, body, name, x, y, z, yaw, visible,
place(x, z, yaw), distTo(x, z), lookAt(point | Object3D | null), do(behaviour, opts), emote(name)
("happy" | "chirp" | "call" | "curious" | "sad" | "scared" | "bow" | "cheer" | "war" | "mourn" |
"sniff"), busy, onEvent`. Behaviours: `"idle"`, `"wander" { center, radius }`, `"follow" { dist, side }`,
`"goto" { x, z, yaw, run }` → `"arrived"`, `"lead" { route, waitDist, run }` → `"checkpoint"(i)`,
`"arrived"` (as friend.js), `"sit" { at, lookAt }`, `"sleep" { at }` → `"asleep"`,
`"greet"` (walks up, circles once sniffing, touches bills, play-bow) → `"greeted"`,
`"feed" { food: i }` (fetches food item i and lays it at the player's feet) → `"fed"`,
`"craft" { at }` (sits working: paws weaving, pulls a vine tight with the bill),
`"dance" { center, radius }` (circling the fire in the tribe's step, on `ctx.music` beats if playing),
`"guard" { at, yaw }`, `"fight"` / `"flee" { to }` (driven by combat.js when used as a `hero` ally),
`"call"` (rears and makes THE call: `audio.mysteryCall(1)` — Moss only) → `"called"`,
`"hide" { spot }` → `"hidden"`, `"peek"` (head up over cover, ducks) .
Steering as friend.js (walk 1.6, run 3.4, swims, respects colliders/confine, keeps 0.6 m from the
player). Members never die on screen: a hero ally at 0 hp is `"hurt"` (limps to the rear, sits).

**The many** (ambience; `createPlatypusCrowd`, ≤ 36): `tribe.village.populate(spots)` (spots = jungle
`camp.spots`: `{ x, z, yaw, kind: "idle" | "sit" | "sleep" | "eat" | "work" }`),
`village.setMood("calm" | "curious" | "cheer" | "feast" | "sleep" | "alarm" | "war" | "mourn",
seconds = 1)` (curious: nearest dozen turn toward the player and creep 1 m closer; cheer: hopping;
feast: gathered round the fire eating; sleep: curled in clusters; alarm: young ones run to the
burrows, adults form a line; war: paint on, facing out; mourn: heads low, still),
`village.gather(x, z, radius, n)`, `village.disperse()`, `village.count`, `village.setCount(n)`
(level 10's losses and level 11's growth show here too), `village.lookAt(point | null)`,
`village.wave()` (a ripple of cheers travelling outward from a point).
Budget for the many: ≤ 2 draw calls.

**Food**: `tribe.food = { place(i 0..7, x, z, kind = "berries" | "grub" | "crayfish" | "egg"), eat(i),
active(i), nearest(x, z, max) -> i | −1, pos(i, out), carry(i, anchor | null), clear() }`.
**Materials** (level 9; pool of 12 pickups with `fx.beacon`): `tribe.materials = { spawn(kind, x, z)
-> id, kind(id), nearest(x, z, max, kind?) -> id | −1, pos(id, out), collect(id) -> kind, active(id),
left(kind) -> count, clear() }` with kinds `"leaf"` (a huge glossy leaf), `"vine"` (a coil), `"bone"`
(an old rib). **Crafting bench**: `tribe.bench = { group, place(x, z, yaw), need: { leaf: 4, vine: 2,
bone: 2 }, have: { leaf, vine, bone }, put(kind) -> bool (lays the piece on the frame: the armor
visibly takes shape), ready, stage (0..3), tighten(quality 0..1) (one lacing pull: the vine cinches;
quality < 0.5 = it slips, `audio.craft("slip")`, no progress), done, takeArmor() (the finished armor
lifts off the frame; hide it and call `ctx.gear.wear`), reset() }`.
**Looks for combat.js**: `export const TRIBE_LOOKS = { home: { furs: [hex…], paint: null }, rival:
{ furs: [ash greys], paint: 0xb3261e }, war: { paint: 0xf2efe6 } }` — combat tints its crowd with these.

## B9. `src/dream.js`

`createDream(ctx) -> world` (key `"dream"`, `name: "dream"`, `env.dark = true`, `swim: false`,
`maxStep: 0.5`). One world with three scenes; `setScene(name)` (call behind black) shows one and sets
`world.P`, `colliders`, `confine`, `env`: `"school"` (level 6), `"void"` (level 11 opening),
`"echo"` (level 11 ending). The ground everywhere is the level-1 cushion quilt (re-use
`createCushionField` from `cushions.js` READ-ONLY, tinted, with its squish and `heightAt`) — the dream
remembers the tutorial; `surfaceAt` is `"cushion"` (or `"water"`), footsteps `audio.cushionStep`.
`fx.dreamMotes` on while active. `setGlow(0..1, seconds)`, `fade(what, 0..1, seconds)`.

- `"school"`: night. A round island of cushions, radius 15 (walkable r ≤ 14, `confine`), floating in a
  slowly turning nebula (sky dome shader: two-layer nebula in violet/teal/rose, stars that twinkle, a
  few shooting stars; `fog: false`), smaller cushion islands drifting around and below (instanced,
  bobbing), strings of soft lantern-stars. Points: `spawn` (0, −8, yaw 0), `wizard` (0, 6),
  `ring` (0, 0) the sparring circle r 5, `soldiers[0..5]` on a ring r 4.5 around (0, 0) for the
  fighting lesson, `pool` (−8, 3) a glowing shallow dream pool r 3.2, surface y = 0, 0.25 deep
  (`waterAt`; for the pulse lesson; `poolSpots[0..2]` inside it), `cauldron` (8, 2),
  `ingredients = { glowcap: (10, −6), moonpetal: (−10, −6), dewdrop: (0, −12) }` each on its own
  little cushion mound, `potionField` (0, 10) r 5 where the fallen soldiers lie for the potion lesson
  (`fallen[0..4]`), cameras `camWide` (−12, 7, −14) → (0, 1, 2), `camWizard`, `camPool`, `camCauldron`,
  `camField` (6, 2.2, 15) → (0, 0.4, 10), `camSky` (looking up at the nebula from the spawn).
  `ENV.school`: background 0x0b0e24, soft blue-violet fill, a pale "moon" sun; far 80.
- `"void"`: the same quilt, colourless, under NO sky: black, no stars, fog black at 6–18 m. Far ahead a
  small warm light that is always 20 m away (`light` Object3D; it recedes as you walk — `update`
  moves it). Points: `spawn` (0, 0), `ahead` (0, 20). Nothing else. `ENV.void`.
- `"echo"`: dawn inside the dream: the quilt slopes up to a low rise (`rise` (0, 12), y ≈ 1.2) under a
  huge pale sun on the horizon; standing glass PILLARS in three arcs in front of the rise:
  `pillars = { count: 12, pos(i, out), standing(i), near: [0..2] (4 m away), mid: [3..7] (8 m),
  far: [8..11] (13 m), reset(), blast(x, z, radius, power) -> shattered count (each shatters with
  `fx.glassShards` + `audio.pillarShatter`) }`. Points: `spawn` (0, 0, yaw 0), `wizard` (−3, 4),
  `soldiers[0..7]` among the pillars for the last exercise, `camWide`, `camSun`.
`world.sight` is always true, `hidden` false, `lit` 0.5, `cover` empty.

## B10. `src/circus.js`

`createCircus(ctx) -> world` (key `"circus"`, `name: "circus"`, `env.dark = true`, night, `maxStep:
0.45`, `confine` to the lot, `camBounds`). A travelling circus after the last show: trampled grass and
dirt lot (y ≈ 0, gentle bumps ≤ 0.15), a board fence all round. Looks: a red-and-cream striped BIG TOP
(real canvas sag between ropes, scalloped valance, pennants on the king poles, guy ropes and stakes),
strings of warm bulbs (instanced emissive) between poles, bunting, painted wagons with gilded
scrollwork, a ticket booth, posters ("THE AMAZING PLATYPUS — TONIGHT"), barrels, crates, hay bales,
props (a unicycle, juggling clubs, a cannon), lamp pools on the ground (baked glow discs), mist low on
the grass, stars. NO real lights (LIGHT RULE): lamps and spots are emissive meshes + additive cones +
ground discs. ≤ 45 draw calls, ≤ 90k triangles.

Layout (binding; x ∈ [−40, 40], z ∈ [−30, 52]; ±0.5 m freedom if the named points stay):

| name | (x, z) | what |
|---|---|---|
| `cage` | (−30, −20) yaw π/2 | inside the cage wagon (floor y = 0.9; bars; door on the +x side). `cageDoor` (−28.2, −20), `cageOut` (−26.5, −20) on the ground |
| wagon row | x −24 … −4, z −22 … −14 | six wagons in two staggered lines; you can crawl UNDER them (`hidden`): `wagons[i] = { x, z, yaw }` |
| `cp1` | (−25, −17) | first checkpoint, behind the first wagon |
| `bell` | (−2, −18) | the high-striker: a distraction (`distractions.bell`) |
| big top | centre (0, 8), radius 17 | walls block sight and walking except: `doorWest` (−17, 8) performers' entrance, `doorSouth` (0, −9) main entrance (lit, guarded), `doorNorth` (0, 25) the back flap. King poles at (−5, 8) and (5, 8), 14 m |
| `ring` | (0, 8) r 6.5 | the ring (curb 0.35 high, sawdust inside), two sweeping spotlights; bleachers between r 9 and r 15 (walkable aisles at the four diagonals; crawl space UNDER the bleachers along the west and east arcs: `hidden`) |
| `cp2` | (−15, 8) | just inside the performers' entrance, behind a costume rack |
| `props` | (−9, 14) | prop pile with the `bottles` distraction; `drape` (9, 2) a hanging drape to hide behind |
| midway | x 20 … 36, z −20 … 20 | stalls and the ticket `booth` (22, −6); the long way round the tent (darker, one patroller, the `generator` (30, 12) distraction: lights out for 8 s) |
| `cp3` | (0, 27) | outside the back flap, in the shadow of a hay stack |
| back lot | z 27 … 38 | open ground crossed by a lamp pool; crates; the `truck` (−12, 33); the `calliope` wagon (12, 31) (distraction: plays, draws both gate guards) |
| `gate` | (0, 39) | gate in the inner fence to the helipad, two guards; `gate.open()`; `gateGap` (−18, 39) a loose board to squeeze through (found if you explore) |
| `helipad` | (0, 46) r 5 | painted H, corner lamps, windsock. `heliSpot` (0, 0.05, 46, yaw 0), `cp4` (0, 41.5) |

Objects and helpers: `cage = { door: { open(), opened }, latch: { hits (0..3), hit() -> bool broke },
rattle() }`; `gate = { open(), opened }`; `spots[0..1] = { x, z, r: 2.6 }` (the ring spotlights, moved
by `update` on fixed closed paths with period 9 s and 13 s; inside one `lit` = 1);
`lamps` (static pools: `lit` 0.8); `lit` = 0.15 in shadow; `hidden(x, z)`: under wagons, under the
bleachers, behind `drape`, in `hay` (0, 27) and inside the three `barrels`.
`distractions = { bell, bottles, generator, calliope }` each `{ x, z, radius (12 / 7 / — / 14), used,
trigger() (animation + its own sound; generator: `setLights("dark", 8)`), reset() }`.
`setLights(mode, seconds)`: `"night"` (default), `"dark"` (bulb strings and spots off: every `lit` × 0.3),
`"alarm"` (all on, spots sweeping the lot, `lit` ≥ 0.6 everywhere outside hide spots).
`routes` (binding names): `wagonsA`, `wagonsB` (two guards among the wagons), `tentDoor` (a sentry
post at `doorSouth`), `ringA` (walks the ring curb), `ringB` (walks the north aisle), `midway`,
`gateL`, `gateR` (posts), `lotSweep`. `sight` blocks through tent walls, wagons, the booth, hay, the
truck. `cover` = wagons, crates, truck. Cameras: `camCage` (inside looking out through the bars at
the tent), `camWide` (−34, 9, −30) → (0, 6, 8), `camRing`, `camGate`, `camPad`.
`reset()`: doors shut, latch 0, distractions unused, lights night.

## B11. `src/heli.js` — the helicopter and the flight

`createHeli(ctx) -> heli` (key `"heli"`): `heli.craft` (the aircraft) and `heli.world` (the corridor).

**`craft`** — a small, slightly shabby circus utility helicopter (bubble canopy, skids, open-frame
tail boom, striped paint, a painted star), main and tail rotors that really spin (blades blur into a
disc above 60 % rpm: swap to a translucent disc mesh), a cockpit with a stick and a few dials, a
`seat` Object3D where the platypus sits upright with its paws on the stick. ≤ 10 draw calls, ≤ 12k
triangles, casts a shadow.
`{ group, x, y, z, yaw, pitch, roll, vx, vy, vz, speed, rpm (0..1), hull (0..1), engineOn, grounded,
seat, locked, camDist: 10, camHeight: 1.3, camPitch: 0.26, camLag: 2.2, place(x, y, z, yaw),
launch(speed) (already flying forward at that speed, rpm 1), startEngine() -> 3.0 (spool-up; lift
only at rpm ≥ 0.85), stopEngine(), setWorld(world), control(dt, input), update(dt, time), reset(),
assist (0..1, default 0.35), windScale (1), onCrash = null (cause), onScrape = null (speed),
onLand = null (verticalSpeed, where), altitude (above the ground under it) }`.
`control` IS the vehicle interface of A3 (`ctx.vehicle.enter(craft, { seat: craft.seat })`); the level
calls `craft.update(dt, time)` every frame (rotors, wash, sound: `audio.heli.set(rpm, load)`,
`fx.rotorWash`), whether or not it is possessed.

Flight model (binding — a real, learnable model with momentum; all numbers at `assist` 0.35):
- COLLECTIVE (`input.up` / `input.down`): thrust along the rotor axis. Hover thrust = weight. Up adds
  +7 m/s² of lift, Down −6; neither = the governor trims to hold the current vertical speed toward 0
  (auto-hover strength ∝ `assist`: at 0.35 a released craft settles to ±0.3 m/s in ~1.2 s).
  Vertical speed limited to +7 / −9 m/s. GROUND EFFECT: within 2.5 m of the ground lift rises up to
  +25 % (a cushion that makes landings gentle).
- CYCLIC (`input.y`): W tilts the nose down up to 20°, S up to 14°; the tilt takes 0.5 s to build
  (inertia). Horizontal acceleration = g·tan(tilt) (≈ 3.6 m/s² at 20°), drag ∝ v² gives a top speed of
  24 m/s. Because thrust is tilted, lift drops by cos(tilt): fast forward flight SINKS unless you add
  collective — the core skill.
- YAW (`input.x`): turn rate up to 1.5 rad/s at low speed, 0.9 at top speed; the craft banks into
  turns (roll ∝ rate × speed, ≤ 30°) and the velocity vector follows the nose with a lag (0.6 s): it
  skids if you turn hard at speed.
- WIND: `world.windAt(x, z, time, out)` adds an acceleration (× `windScale`); gust zones are announced
  1.5 s ahead by `fx.windStreaks` and `audio.gust`.
- CONTACT: skids touching the ground with vertical speed ≥ −2.5 m/s and horizontal ≤ 4 m/s = a
  landing (`onLand`); harder = `hull −= 0.25` and a bounce (`onScrape`), ≥ 6 m/s vertical or ≥ 10
  horizontal into anything = crash. Obstacles (`world.obstacles`): brushing one at ≤ 5 m/s relative =
  scrape (−0.2 hull, pushed off), faster = crash. `hull ≤ 0` = crash. A crash calls `onCrash(cause)`
  with `"ground" | "obstacle" | "wire" | "shot"` after `fx.crashSparks`, `audio.crash`; the craft
  goes `locked`. The LEVEL then calls `ctx.checkpoint.respawn({ text: … })`.
- The HUD is the level's: `ui.flight.set(craft.altitude, craft.speed, craft.vy, craft.hull, warn)`
  with `warn` from `heli.world.warning(craft) -> "PULL UP" | "WIRES" | "SEARCHLIGHT" | "TOO FAST" |
  "LAND HERE" | null`.

**`world`** (`name: "flight"`, `env.dark = true`, camera `far` 320): a corridor 1300 m long running
+z, 160 m wide (soft walls: beyond |x| > 70 a steady wind pushes back in and the warning reads
"TURN BACK"), flown from night into dawn. `heightAt(x, z)`, `obstacles: [{ kind: "pole" | "tree" |
"tower" | "wire" | "bridge" | "rock", x, y, z, r, h, x2, y2, z2 }]` (wires and bridges are segments;
test capsule-vs-sphere with the craft radius 1.6), `windAt`, `warning(craft)`, `update(dt, time, fx,
fz)` (recentres instanced scenery windows, moves searchlights, blends the env by z: night →
pre-dawn from z 450 → dawn at z 850 via `ctx.setEnv`), `reset()`.

| z | section | what to learn / avoid |
|---|---|---|
| −10 … 40 | the back lot (a low-poly stand-in of the circus from above: the big top with its two king poles and pennants behind you at z −38, the fence, lamp strings) — `pad` (0, 0.05, 0) | LIFT-OFF: hold Up, clear the lamp-string WIRES strung at y 6 across z 22 (fly over: ≥ 8 m) |
| 40 … 160 | fields, hedgerows, a lane; gate rings low and wide | forward flight: nose down, add collective; first gentle turn |
| 160 … 260 | the road with POWER LINES (pylons 14 m, wires at y 11–13 across the corridor at z 210; a gap UNDER them is 9 m high and clear) | choose: over (climb early) or under |
| 260 … 400 | a checkpoint road with two SEARCHLIGHTS sweeping (period 7 s, beams r 9 on the ground); in a beam > 1.2 s: tracers come up (−0.2 hull per burst, telegraphed by `warn "SEARCHLIGHT"` and a rising tone) | timing and height (above 30 m the beams cannot reach) |
| 400 … 540 | the river valley: the ground drops 12 m, a stone BRIDGE at z 470 (arch 14 m wide, 9 m high: fly through or over), mist on the water, first light | descending and climbing under control |
| 540 … 760 | hills: a ridge slalom between two RADIO TOWERS (z 610, guy wires) and rock shoulders, GUSTS from the left then the right | wind correction; banking |
| 760 … 1100 | the JUNGLE at dawn: a sea of canopy at y 16–22 with emergent giant trees (slalom), birds lifting, sun breaking; the engine starts to cough at z 1000 (`craft.rpm` sags, warning beeps): scripted by the level | stay above the canopy, find the clearing |
| 1100 … 1260 | `landing` (15, 0, 1190) r 16: a river clearing; the ONLY open ground | get down: any touchdown inside the zone, or hull 0 inside z > 1080, is the level's (crash-)landing |

`gates[0..15] = { x, y, z, yaw, r }` (the safe line; passing one: +0.08 hull, a chime; they are a guide,
never required), `checkpoints = [{ id: "pad", x: 0, y: 0.05, z: 0, yaw: 0, speed: 0 }, { id: "fields",
z: 150, y: 14, speed: 14 }, { id: "valley", z: 400, y: 20, speed: 16 }, { id: "jungle", z: 760, y: 30,
speed: 16 }]` (x 0, yaw 0 unless given), `searchlights[0..1] = { x, z, bx, bz (beam centre now), r,
inBeam(x, y, z) -> bool }`, `P = { pad, landing, camTakeoff, camFlyby1 (the power lines), camDawn }`.
Scenery budget: ≤ 30 draw calls, ≤ 80k triangles visible: terrain as 5 strips of 260 m (only 2 visible),
instanced trees / hedges / pylons / canopy clumps (windowed around the craft), a sky dome whose
gradient and star opacity the env drives, a low sun disc, mist cards in the valley.

## B12. `src/jungle.js` — the showpiece

`createJungle(ctx) -> world` (key `"jungle"`, `name: "jungle"`, `swim: true`, `maxStep: 0.5`, `confine`,
`camBounds`). Dense layered rainforest: buttressed giant trees (5 unique trunk shapes, instanced,
30 m, canopy cards above), mid-storey palms and tree ferns, lianas and hanging vines, strangler figs,
understorey ferns / broad leaves / flowers (alpha-TESTED instanced cards that sway and bind
`fx.shock.uniform`), mossy boulders, fallen logs, leaf litter and roots on the ground (splat-painted
terrain), a clear RIVER with rapids-white at stones, lily pads, reflections faked by a sky-tint
fresnel, a waterfall, mist cards, light shafts (`fx.lightShafts`), butterflies by day, fireflies by
night, birds (`fx.birds` on `scare`). ≤ 55 draw calls, ≤ 110k triangles in view; vegetation is split
into ZONE groups shown only within 55 m of the focus (`update` toggles `visible`).

Layout (binding; x ∈ [−62, 62], z ∈ [−52, 92]; ground y 0–3, river surface y = 0):

| name | (x, z) | what |
|---|---|---|
| `crash` | (0, −40) | the landing clearing with the WRECK (`wreck.group`, `wreck.setSmoke(bool)`), broken branches, a furrow. `wake` (2, −37) where you come to |
| `carryPath` | (2, −37) → (4, −30) → (3, −24) | the path the capture party takes; `screamSpot` (3, −24) a small glade ringed by tall grass and three bird-heavy trees (`birdTrees`) |
| the river | flows west → east along z ≈ 0 (meanders ±4), 7–9 m wide, bed to −1.6 | `ford` (−10, 0) knee-deep stones; `stones` (14, 0) stepping stones; `logBridge` (30, 1) → (34, 3); `fallFoot` (−50, 4) waterfall 8 m; `pool` (−46, 2) deep pool |
| the trail | `trail[0..5]` = (8, −14), (−6, −7), (−10, 6), (−22, 18), (−12, 34), (4, 46) | the six CALL POINTS of the sound tracking: a fern bank, the river's edge, the far side of the ford, the giant fig (`fig`), the hollow log tunnel (`log`: walk through), the vine curtain |
| `meet` | (4, 50) | behind the vine curtain (`curtain = { open(), opened }`): where Moss is found |
| `campGate` | (10, 60) | a root arch; the hidden way in |
| the camp | centre `camp` (20, 74), r 15 | a sunlit clearing by a creek pool: `fire` (20, 73) the main fire (+ `fires[1..2]`), `elder` (20, 82) Burra's rock, `burrows[0..5]` in the earth bank along the north edge (z ≈ 88), `totems[0..3]` (carved platypus poles), `bench` (11, 75) the crafting frame, `foodStore` (27, 67), `bed` (14, 83) your sleeping hollow, `creekPool` (29, 79) r 4, `lookout` (30, 86) y 3 on a great root, `spots` (36 village spots, see B8), `seat` (17, 74) your place by the fire |
| materials | `leafGrove` (−30, 42) r 7; `vineWall` (−18, 62) r 5; `boneYard` (−42, 22) r 6 (an old river-bank of bleached bones and driftwood) | level 9 gathering; each `matSpots.leaf[0..5]`, `.vine[0..3]`, `.bone[0..3]` |
| rival land | across the river east: `rivalPath` (30, 6) → (40, 16) → (46, 24); `rival` (50, 32) r 12 | thorn fence with one gap (`rivalGate` (44, 26)), red-painted totems, their fire, the `hoard` (54, 36) (stolen food), `ambush[0..2]` bushes on the path |
| `field` | (−8, −22) r 16 | the wide riverbank meadow south of the river (level 11 battle); `fieldGates` = (−30, −40), (16, −44) where the army comes from; `barricade` (−4, −10) the tribe's line |
| the stone circle | `arena` = { x: −40, z: −30, r: 15, pillars: 4 at r 9 (N, E, S, W) } | an ancient ring of moss-eaten standing stones in a sunken glade, a cracked flagstone floor (flat, y 0), a fallen idol, two entrances (`arenaIn` (−26, −28) from the field, `arenaBack` (−54, −32) toward the mountains: the way to "go look for your friend"); `farTrail` (−60, −34) |
| `baseTrail` | (58, −28) | the path that leaves toward the base (level 10 start/return) |

`setTime(name, seconds = 0)`: `"day"` (high warm sun, hard shafts), `"dusk"` (amber, long shafts, deep
greens), `"night"` (blue moonlight, fireflies, fires glowing, `env.dark`), `"dawn"` (rose mist, low
shafts), `"mist"` (white, close fog 8–26 m: the tracking mood), `"storm"` (dark, rain: level 11's
battle starts in it and clears). `ENV[name]`. The camp fires: `fires[i].set(0..1)` (fx.campfire handles).
`heightAt`, `waterAt`, `depthAt`, `surfaceAt`, `sight` (trunks ≥ 0.5 m and rocks block), `hidden`
(tall-grass patches `grass[]` and fern banks; the three `ambush` bushes), `lit` (0.3 under canopy,
0.8 in clearings, fires at night 0.9), `cover` (trunks, boulders, stones of the circle),
`scare(x, z, radius)` (birds burst from `birdTrees` within radius; leaves fall), `routes` (`captors`,
`campWalk`, `rivalGuardA/B`, `fieldLine`), `reset()`.
Cameras: `camCrash`, `camGlade` (low, through grass at `screamSpot`), `camCanopy` (looking straight up
through the shafts), `camRiver`, `camFig`, `camCampReveal` (30, 9, 58) → (20, 1, 76) (the crane over
the root arch), `camFire`, `camElder`, `camArena` (−40, 10, −48) → (−40, 1, −30), `camFarTrail`.

## B13. `src/base.js`

`createBase(ctx) -> world` (key `"base"`, `name: "base"`, `env.dark = true`, `maxStep: 0.45`,
`confine`, `camBounds`). A jungle-edge military base at night: chain-link fences topped with wire
(alpha-tested), concrete and packed dirt, sodium floodlights on poles (emissive + ground pools),
two WATCHTOWERS with sweeping searchlights (additive cones + moving ground discs), corrugated-roof
barracks, a big arched HANGAR, a concrete ARMOURY bunker, a motor pool with trucks, stacks of crates
and sandbags (cover), fuel drums, a radio mast with a red blinking lamp, painted signs and stencils,
tyre tracks, puddles that mirror the floodlights. ≤ 45 draw calls, ≤ 90k triangles.

Layout (binding; x ∈ [−46, 46], z ∈ [−12, 112]; ground y = 0):

| name | (x, z) | what |
|---|---|---|
| `start` | (0, −8) | the jungle edge; tall grass (`hidden`) to z 5; `overlook` (6, −4) where the squad gathers |
| outer fence | z = 8 | `mainGate` (0, 8) (lit, a sentry box, 2 soldiers; `gates.main.open()`), `fenceHole` (−14, 8) a dug gap under the wire (the way in) |
| `cp1` | (−14, 11) | inside the fence behind sandbags |
| outer yard | z 8 … 42 | `towerW` (−32, 14), `towerE` (32, 14) (searchlights `lights[0..1]`: closed sweep paths over the yard, period 8 s / 11 s, disc r 3.5); `barracks` (−32, 30) three huts (sleeping soldiers: quiet!); `motorPool` (24, 28) three trucks; crate stacks at (−6, 18), (8, 24), (−18, 34), (14, 36); puddles |
| inner fence | z = 44 | `innerGate` (0, 44) shut; its `lever` in the `guardhouse` (10, 40): Tail Slap it → `gates.inner.open()` |
| `cp2` | (0, 46.5) | just through the inner gate |
| the apron | z 46 … 62, x −24 … 24 | open concrete in front of the hangar, floodlit, almost no cover (three sandbag rings at (−12, 52), (10, 55), (−2, 59)): THE KILLING GROUND of the story beat |
| `hangar` | (0, 74) 30 × 22, open front at z 63 | inside: a tarpaulined aircraft, crates, a mezzanine with two shooters; `cp5` (0, 50) |
| `armoury` | (−30, 80) | bunker; steel `door` on its east side (−25, 80): 3 Tail Slaps on the hinge → `doors.armoury.open()`; `cp3` (−22, 78) outside, `cp4` (−30, 82) inside. Inside: `racks = { suit: (−33, 78), glasses: (−33, 82), blaster: (−30, 85) }` (each a lit rack with the item on it: `racks.x.take()` hides it), ammo crates |
| `fuel` | (34, 60) | fuel drums: shooting them (after the gear) blows the east fence open — `fuel.explode()` (`audio.explosion`, a fireball of fx, no bodies shown) |
| `radio` | (32, 88) | the mast; the alarm starts from here |
| escape | back south | after the gear: through the yard (now `alarm`), out by `mainGate` (blown open by Rok's signal) or the fuel-dump gap `eastGap` (40, 58) → `exit` (20, −8) into the jungle |

Helpers: `lights[i] = { x, z (disc centre now), r, on, inBeam(x, z) -> bool }` (`lit` = 1 in a beam,
0.75 in floodlight pools, 0.2 elsewhere; searchlights that catch the player ≥ 0.8 s alert the tower's
squad); `setAlarm(on)` (red beacons spin, floods to full, `lit` ≥ 0.6 everywhere but hide spots);
`gates = { main, inner }`, `doors = { armoury }`, `lever = { x, z, pulled, pull() }`;
`cover` (crates, sandbags, trucks, hut corners, concrete barriers), `coverPoints: [{ x, z, facing }]`
(≥ 30, for the soldiers), `hidden` (tall grass outside, under trucks, inside the sandbag rings while
sneaking, shadowed hut porches), `sight`, `routes`: `gatePost`, `yardA`, `yardB`, `towerSquadW`,
`towerSquadE`, `apronLine` (the ambush positions), `mezzanine`, `armouryPost`, `reinforceMain`,
`reinforceNorth`, `pursuit`. `setTime("night" | "predawn", seconds)`. Cameras: `camOverlook` (the base
below from the jungle edge), `camApron` (high, from the hangar roof), `camArmoury`, `camRacks`,
`camGate`. `reset()`.

--------------------------------------------------------------------------------------------------

# Part C — the storyboards (binding, beat by beat)

Conventions for all six levels:

- Inputs. Move: WASD / arrows / left stick. Camera: mouse drag / right stick / wheel. Jump: Space /
  Jump button. Interact: E / the action prompt (`ui.setAction`). The attack actions arrive in
  `level.onAction(name)`: `"primary"` (J / left mouse / green button) = STING, `"tailSlap"` (L / Slap
  button) = TAIL SLAP, `"secondary"` (K / right mouse / blue button) = ELECTRO PULSE (needs water).
  New (A4): Q potion, R scream, F / left mouse fire, Shift or C = sneak (on foot) / descend (helicopter).
  Every beat below that introduces an input shows it with `ui.hint` in BOTH forms, chosen by
  `ctx.touch`: e.g. "Hold Q to aim, let go to throw" / "Hold the potion button, let go to throw".
- An attack handler in every fighting level is exactly:
  ```js
  function onAction(name) {
    const kind = name === "primary" ? "sting" : name === "tailSlap" ? "slap" : name === "secondary" ? "pulse" : null;
    if (!kind || platypus.acting) return false;
    if (kind === "pulse" && !player.inWater) { ui.hint("The pulse needs water!", 1.6); return true; }
    const fin = combat.wouldFinish(kind);
    const t = fin ? platypus.finisherHitTime : kind === "slap" ? platypus.slapHitTime : kind === "sting" ? platypus.stingHitTime : platypus.zapFireTime;
    if (fin) platypus.finisher(); else if (kind === "slap") platypus.tailSlap(); else if (kind === "sting") platypus.sting(); else platypus.zap();
    ctx.after(t, () => { const r = combat.strike(fin ? "finisher" : kind); if (boss.alive && bossInReach(kind)) boss.hit(...); onStrike(r); });
    return true;
  }
  ```
  (`sting`, `zap`, `stingHitTime`, `zapFireTime` are CONTRACT.md's; cooldowns: sting 0.45 s, slap 0.8 s,
  pulse 2.5 s, shown with `ui.setCooldown`).
- Sneaking: while `ctx.input.held("down")` on foot the level sets `player.maxSpeed = 1.5` and
  `platypus.pose("sneak")`; released: 3.0 × `ctx.gear.speed` and `pose(null)`.
- Every level: `cinema.titleCard({ kicker: "LEVEL n", title })` first; an objective line
  (`ui.setObjective`) at all times during play; a marker (`fx.beacon`) on the current
  goal; ends with `ctx.complete()` after its end card; the level's `win()` (A2 of LEVELS.md) jumps straight to that card from any step. Speech: Wizard Wobble speaks with `ui.say` (typed bubble, `ctx.setSpeaker`, blips as in level 5), lines of ≤ 12 words; tribe members with `audio.tribeChirp` and CAPTIONS in brackets style
  as Pip's in level 3 (the platypus understands them; humans are never understood).
- Music: one `ctx.music.play` per beat change at most; intensity follows the action
  (`setIntensity(0.25 + 0.75 × min(1, combat.alerted / 3))` in stealth and combat sections).
- Debug: `skipTo(name)` accepts every name listed under "Skip points" and sets the world exactly as a
  playthrough would have it. `state()` returns `{ step, … }` with the listed fields.
- Lengths are targets for a first-time player.

## Level 6 — ANOTHER DREAM (≈ 7 min; forgiving: no health, nothing can be failed)

Modules: `dream` (scene `"school"`), `getWizard`, `combat`, `potions`. Music: `dream`.
Abilities: sting, slap, pulse; potion from beat 7. `combat.bodyTTL = Infinity`.
Design: a playground, not a lecture. Wobble shows each idea once, then the player DOES it on
dream soldiers that are harmless but react properly. Three graded exercises: finish, pulse, potion.

1. Title card "LEVEL 6 — ANOTHER DREAM". Behind it: `dream.setScene("school")`, `ctx.setWorld(dream)`,
   player at `P.spawn` with `platypus.sleep(true)`, `audio.dreamAmbience(true)`, `music.play("dream",
   { intensity: 0.2 })`, `fx.dreamMotes(true)`.
2. Fade in on `camSky` (4 s drift down through the nebula) → the platypus asleep on the quilt;
   `wakeStretch()`. Control. Objective "Find Wizard Wobble". The wizard floats at `P.wizard`
   (`music.motif("wobble")` when within 6 m). Arriving within 2.5 m:
3. Wobble (3 lines, `camWizard`): "Welcome back, little one." / "The people who took Pip will not ask
   nicely." / "Tonight you learn to stop them." Six `dreamSoldier`s rise out of the quilt as mist at
   `P.soldiers[0..5]` (`passive: true`, facing in). `ctx.abilities.targets = combat.enemies`.
4. LESSON 1 — THE FINISH. Objective "Sting, then finish (0/3)" (the counter is part of the objective text;
   re-set it only when it changes). Hint: "Sting (J) twice to stagger — then hit again to FINISH". A staggered soldier gets the
   gold ring; the finishing hit plays `platypus.finisher()`, 0.25 s of `ctx.setTimeScale(0.35)`,
   `fx.dissolve`-ready body that stays as a glass shape. `music.setIntensity(0.5)`. After 3 finishes
   Wobble: "Faster: the tail." Hint "Tail Slap (L) knocks them flat — anything after that finishes."
   The remaining 3: counter 3/6 → 6/6. Soldiers that are not being fought slowly circle, so positioning
   matters; one of the last three is `passive: false` and tries the slow GRAB (windup 1.1 s here,
   "caught" just bumps the player back 2 m with a soft chime — the dodge is taught, never punished).
5. LESSON 2 — THE POOL. Three soldiers walk into the dream pool (`P.poolSpots`), three more stand
   on the bank. Wobble: "Water carries your spark." Objective "Pulse them from the water (K)".
   The player must wade in (`player.inWater`) and pulse: all three in the water go down at once
   (0.4 s slow motion, `fx.electroPulse` chain, `music.stinger("discover")`). The three on the bank
   then come at walking pace: free practice, any attacks. Counter to 12 fallen in total.
6. Wobble drifts to the cauldron (`camCauldron`): "They are only sleeping. I know something better."
   `potions.cauldron.place(P.cauldron)`, `.recipe = ["glowcap", "moonpetal", "dewdrop"]`, `.show(true)`.
   LESSON 3 — THE BREW. Objective "Bring the three ingredients" (0/3); beacons on the three
   `P.ingredients` mounds (each guarded by a little hop-puzzle: the glowcap mound is ringed by a moat
   to jump, the moonpetal opens only while you stand still for 1 s, the dewdrop floats 1.2 m up: jump).
   Walking into the cauldron radius (1.8 m) with ingredients: prompt "Add" (E) adds the next held one
   in ANY order the player picks — the rim runes show the right order; wrong = grey puff, the cauldron
   empties and the wrong ingredient reappears on its mound (cheap to retry). All three right:
   `cauldron.startStir()`, `music.setIntensity(0.75)`, hint "Stir on the beat (E)" with a pulsing ring
   on the cauldron driven by `music.beatPhase()`; four good stirs (within 0.18 of the beat; bad ones
   only puff) → `brewDone`, `music.stinger("transform")`. Prompt "Take potions" →
   `ctx.abilities.potion.enable({ count: 3, max: 5, targets: combat.bodies })`,
   `potions.bodies = combat.bodies`.
7. LESSON 4 — THE POTION (`camField` once, 3 s): the fallen glass soldiers have drifted to
   `P.potionField` (the level re-places 5 bodies at `P.fallen`). Wobble: "Throw it where they lie."
   Hint for Q. First throw: on `potions.onTransform` the camera eases to a low close shot of the swirl
   (`ctx.setTimeScale(0.5)` for the 2.6 s; only the first time), the newborn sits up, chirps;
   `ctx.army.show("Friends")`. Objective "Wake them as platypuses" (0/5). Potions run out at 3:
   the cauldron refills by itself every 20 s ("Take potions" again), so nobody can be stuck. Two bodies
   lie 1.2 m apart: one flask can wake both (taught by the layout, praised by Wobble: "Two with one!").
8. With 5 platypuses following in formation (`combat.order("follow")`), Wobble: "Not an end. A new
   beginning." / "Remember this when you wake." Free play 10 s (the followers copy the player's
   jumps with a delay — a small joy), then the nebula dims: `dream.setGlow(0, 5)`, the followers turn
   to motes one by one (`fx.dissolve`, in key: `music.motif("platypus")`), Wobble fades last:
   "Wake up. They are coming." `cinema.fade("black", 2.5)`.
9. End: `ui.showComplete({ kicker: "LEVEL 6", title: "COMPLETE" }, () => ctx.complete())`.

Checkpoints: none (no failure). Skip points: `fight`, `pool`, `brew`, `potion`, `ending`.
`state()`: `{ step, finished, fallen, brewed, potions, woken, army }`.

## Level 7 — THE CIRCUS (≈ 12 min; HARD BUT FAIR: stealth, then learn-by-retry flying)

Modules: `circus`, `combat` (guards), `heli`, `props` as needed. Music: `stealth` → `flight`.
Health: OFF on foot (caught = restart at the checkpoint). In the air: the craft's `hull`.
Failure is always `ctx.checkpoint.respawn(...)`: under a second, never a menu. Assist rule A2.

Part 1 — the cage and the wagons
1. Title card. Behind it: `circus.reset()`, `setWorld(circus)`, player in the cage at `P.cage`
   asleep, `audio.circusAmbience(true)`, no music.
2. Fade in `camCage` (through the bars: the lit big top, a poster "THE AMAZING PLATYPUS — TONIGHT").
   `wakeStretch`, `platypus.pose("scared")` for a moment. One caption: "This is not the zoo."
   Control inside the cage (2 × 3 m). Objective "Get out of the cage". The latch glows faintly;
   hint "Tail Slap (L) the latch". Three slaps (`circus.cage.latch.hit()`, `audio.cageRattle` /
   `latchBreak` on the third, `cage.door.open()`). BUT each slap is noise: a guard on `wagonsA`
   walks by every 14 s; slapping while he is within 8 m makes him come and look
   (`combat.noise`): crouch at the back of the cage (Shift) and he leaves after 4 s — the first
   stealth lesson costs nothing. `music.play("stealth", { intensity: 0.25 })` when the door opens.
3. Drop to `P.cageOut`; `checkpoint.set("cp1", …)`. `ui.setSeen(0)` appears; hint "Hold Shift to
   sneak. Stay out of the light cones." (`combat.showCones(true)`).
   SECTION A — the wagon row, 2 guards (`wagonsA`, `wagonsB`, crossing patrols with a 5 s window).
   Tools taught here: crawl UNDER wagons (hidden), the BELL (`distractions.bell`: Tail Slap it from
   behind its post → both guards walk to it for 6 s), the silent TAKEDOWN from behind (hint the first
   time the player is behind an unaware guard: "Sting from behind!"). Any route works.
   Goal: `doorWest`. Objective "Sneak into the big top".
Part 2 — the big top
4. `checkpoint.set("cp2")` inside. `camRing` flash (2 s, skippable): the empty ring, two spotlights
   sweeping, a guard on the curb (`ringA`), one in the north aisle (`ringB`), a sentry at `doorSouth`.
   SECTION B — cross the tent to `doorNorth`. Three honest routes: (a) under the west bleachers
   (hidden, slow, one gap of 4 m in the open timed against `ringB`); (b) straight across the ring
   between the two spotlights (their periods 9 s and 13 s leave a clear diagonal every ~6 s; standing
   in a spot fills `seen` at ×3) — fast and thrilling; (c) knock the `bottles` at `props` to pull
   `ringA` away, then walk the east aisle behind the `drape`. Spotted → the guards run (2.7 m/s vs.
   your 3.0): reaching a hide spot unseen for 6 s calms them (`"lost"`); a completed grab = "Caught!".
   `music.setIntensity` follows `combat.alertState`; `music.stinger("danger")` on `"spotted"`.
5. Out of the back flap: `checkpoint.set("cp3")`. `camGate` flash: the gate, two guards
   (`gateL`, `gateR`), the helicopter on its pad beyond, rotor tied down.
   SECTION C — the back lot. The lamp pool in the middle must be skirted (crates as cover; `lotSweep`
   patrol). Ways through: the `calliope` wagon (interact: it wheezes into a waltz, `audio.calliope`,
   both gate guards leave for 10 s — the gate must still be opened: Tail Slap its bar, 1 slap);
   or the loose board `gateGap` (unguarded, but the truck's driver sits on the running board facing
   it and looks away only while he lights his lantern: 3 s in every 9); or take both gate guards down
   from behind one at a time while the other faces away (their heads turn on a 5 s rhythm).
6. Through: `checkpoint.set("cp4", { label: "Helipad" })`. The guards who were distracted return
   in 12 s: urgency. At the helicopter: prompt "Climb in" (E). `ui.setSeen(null)`.
Part 3 — the flight
7. Short cutscene (5 s, skippable): the platypus scrambles onto the seat, looks at the dials, slaps
   a paw on the starter; `craft.startEngine()`, `audio.heli.start()`; shouts behind, lanterns
   running. `setWorld(heli.world)` behind a 0.2 s white flash of the pad lamps (the corridor's
   stand-in circus is at the same place); `craft.place(pad)`, `ctx.vehicle.enter(craft, { seat:
   craft.seat })`, `ui.flight.show(true)`, `music.play("flight", { intensity: 0.2, at: "now" })`.
   `checkpoint.set("pad", { restore })` — restore for air checkpoints: `craft.reset()`,
   `craft.place(cp.x, cp.y, cp.z, 0)`, `craft.launch(cp.speed)` (pad: engine already at rpm 1),
   searchlight phases reset, `craft.hull = 1`.
8. LIFT-OFF. Objective "Take off!" Hints, one at a time, each cleared by doing it: "Hold Space to
   climb" → (at 4 m) "Careful — wires!" (`warn "WIRES"`) → (past z 30) "W: nose down to fly forward.
   Keep holding Space or you sink." → (z 60) "A / D to turn. Shift to descend." Touch: the Jump button
   reads "Up", the Down button shows. The guards' lanterns shrink below.
   The whole flight: `ui.flight.set(...)` every frame; gate rings via `fx.ringGate` at
   `world.gates` (next 3 visible), passing one: chime, `+0.08` hull, `music.setIntensity(+0.05)`.
9. FIELDS (z 40–160): free learning, wide and low-risk. `checkpoint.set("fields")` at z 150.
10. POWER LINES (z 210): `warn "WIRES"` from z 170; over or under. First real test.
11. SEARCHLIGHTS (z 260–400): `warn "SEARCHLIGHT"` + rising tone while in a beam; after 1.2 s a burst
    of tracers (`fx.tracer` from the ground, `audio.gunshot(0.8)`), `craft.hull −= 0.2`,
    `ui.hurtFlash()`. Two lights, opposite phases. `checkpoint.set("valley")` at z 400;
    `music.setIntensity(0.6)`.
12. VALLEY + BRIDGE (z 400–540): drop into the valley, mist, first light (`world.update` blends the
    env). Through the arch earns a flourish (`music.motif("platypus")`, hint "Nice flying!").
13. RIDGE (z 540–760): towers and gusts (`fx.windStreaks` 1.5 s ahead of each gust, pushes of 3 m/s²
    for 2 s, alternating). The hardest section. `checkpoint.set("jungle")` at z 760.
14. JUNGLE (z 760–1100): dawn breaks, `music.setIntensity(1)` — the PLATYPUS theme soars. Slalom
    between emergent trees over the canopy; `fx.birds` lift as you pass. At z 1000: the engine coughs
    (`audio.warnBeep(true)`, `craft.rpm` capped at 0.8 → 0.7: you can no longer climb, only stretch
    the glide), objective "Find somewhere to land!", `warn "LAND HERE"` with a marker on
    `world.P.landing`. `music.play("stealth", { intensity: 0.8, at: "now" })` (tension, no drums).
15. THE LANDING: inside z > 1080 any ground contact ends the flight: a soft touchdown in the zone
    (`onLand`) → proud chirp, then the tail rotor clips a branch anyway; a hard one → the crash IS the
    story. Either way: `ctx.health`-free cutscene: `ctx.setTimeScale(0.4)`, branches whip the canopy,
    `audio.crash(0.8)`, `music.duck(1, 0.2)`, cut to black on impact, `audio.heli.stop(true)`.
    Black, 2 s: dripping leaves, one bird. (Crashing BEFORE z 1080 is a normal restart at the last
    air checkpoint: `respawn({ text: cause === "wire" ? "Wires! Try again" : "Try again" })`.)
16. End: `ui.showComplete({ kicker: "LEVEL 7", title: "COMPLETE" }, () => ctx.complete())`.

Tuning: guards as B5 (range 9 m, 38°, fill ≈ 1.5 s at range); 9 guards in total, never more than 3
relevant at once. A clean stealth run ≈ 5 min, the flight ≈ 2 min 15 s; expected restarts for a
new player: 3–6 on foot, 4–8 in the air, each costing < 25 s of replay (air checkpoints ≈ every
30 s of flying). From `tries ≥ 3`: `combat.viewScale = 0.8`, `combat.aimScale = 1.25` (grab windup),
`craft.assist = 0.6`, `craft.windScale = 0.6`; from 6: 0.65 / 1.5 / 0.85 / 0.3 and a hint about the
last cause ("Climb earlier before the wires", "Stay low and wait for the beam to pass", …).
Checkpoints: `cp1`, `cp2`, `cp3`, `cp4`, `pad`, `fields`, `valley`, `jungle`.
Skip points: `wagons`, `tent`, `lot`, `heli`, `fields`, `valley`, `jungle`, `landing`.
`state()`: `{ step, checkpoint, seen, alerted, takedowns, alt, speed, hull, z, tries }`.

## Level 8 — THE SCREAM (≈ 10 min; forgiving — a story level driven by play)

Modules: `zoo`, `friend` (Pip), `props`, `jungle`, `combat` (handlers), `tribe`. Music: `flashback`
→ none → `sorrow`/`stealth` → `chill` → `tribe`.

Part 1 — flashbacks (playable memories, 25–40 s each, soft white vignette via `cinema` eye half
open: `cinema.eye.set(0.85, 1.5, 1.15)` + `cinema.tint("warm", 0.5)`, colours warm, `music.play("flashback")`, `audio` slightly muffled)
1. Title card. Then black, the sound of leaves; a music box (`music.motif("pip", { at: "now" })`).
2. MEMORY 1 — the pool. `setWorld(zoo)`, `zoo.setTime("morning")`, Pip `do("follow")`. Objective
   "Swim with Pip". Swim three laps of bubbles Pip leaves (`fx.sparkle` rings; pass through 5): each
   ring adds a layer (`music.setIntensity`). The 5th: white flash, cut.
3. MEMORY 2 — the trick. Evening zoo, Pip faces you on `showRock`. Pip does a trick, you copy it
   (`trick1..4` buttons shown; 3 rounds, wrong ones just make Pip giggle-chirp and repeat). After the
   third: `nuzzle`. The image freezes for a second (`ctx.setTimeScale(0.05)`), desaturating by
   `cinema.fade("black", 1.2)` to WHITE if available, else black.
4. MEMORY 3 — the door. Night zoo. Pip asleep at `nest`; objective "Stay close to Pip". Walking
   toward Pip makes the nest slide away (the level moves Pip back 0.8 m per metre walked) while the
   keeper's silhouette and a cage come from the door; `music.play("sorrow", { at: "now" })`,
   `music.motif("pipSad")`; Pip `emote("scared")`, reaches a paw. Hands close over the view
   (`cinema.eye.close({ duration: 0.6 })`). Black. One line: "Pip..."
Part 2 — taken
5. `setWorld(jungle)`, `jungle.setTime("day")`, `jungle.wreck.setSmoke(true)`,
   `audio.jungleAmbience(true, "day")`, `music.stop(2)`. `cinema.eye.open({ duration: 6, blinks: 2, tint: "day" })`
   on `camCanopy`: shafts of light, leaves, a butterfly. The player lies at `P.wake`
   (`pose("still")` → stirs). Control returns for a few seconds — limping (`pose("limp")`,
   `maxSpeed 1.2`) — objective "Get up". After 3 m or 6 s: voices (`audio.guardVoice("radio")`),
   four `handler`s step out of the ferns on all sides (`combat.spawn("handler", …, { passive: true })`
   then scripted). A net drops (`fx.sparkle`-free; a props net or the handlers' pole). Hint "Struggle!
   (mash J)" — a struggle meter (`ui.setCharge(frac, "STRUGGLE")`) that fills with presses and drains:
   it CANNOT be won (drain grows), but the effort is the point; at 5 s it snaps to 0.
6. CARRIED (`player.scripted = true`, `platypus.pose("struggle")`, two handlers carry the pole:
   `enemy.carry(true)`, the level follows `carryAnchor`; the camera is the follow rig, close and
   low; two more handlers walk ahead and behind; `routes.captors` along `P.carryPath`, 12 s).
   The player keeps mashing: each press = a wriggle + a rising, cracking squeak
   (`audio.screamCharge(n / 12)`), the struggle bar now fills and STAYS; `music.play("stealth",
   { intensity: 0.5 })` swelling; flash cuts (3 frames each, white) of the three memories: Pip's paw.
   Whether or not the player presses, the bar reaches full at `P.screamSpot`.
7. THE SCREAM (the set piece; uncontrolled): at full — a breath of total silence 0.4 s
   (`music.duck(1, 0.1)`, ambience off, `ctx.setTimeScale(0.15)`, close-up `camGlade` on the bill
   opening) — then `ctx.abilities.scream.force(1)` with `onRelease = (p) => { … }`:
   `platypus.scream(1, false)`, at `platypus.screamTime`: `audio.scream(1, false)`,
   `fx.screamWave(x, y, z, 1)`, `cinema.shake(1.2, 1.4)`, `combat.blast(x, z, 22, 1)` (all four handlers
   are flung outward and lie still), `jungle.scare(x, z, 40)` (every bird in the forest lifts,
   leaves rain down, the grass lies flat — `fx.shock`), a white frame, time scale back to 1 over 2 s.
   Then the long SILENCE (4 s): only the ring in the ears and a heartbeat; leaves still falling;
   the platypus on the ground among the fallen men, shaking, looking at its own paws
   (`pose("scared")`, `lookAt` each handler in turn). No music. No caption for 3 s; then: "...what
   was that?" Control returns. `checkpoint.set("glade", { silent: true })`.
   Objective "Get away from here". The handlers do not get up. (They are potion fodder in nobody's
   mind yet — leave them; `combat.bodyTTL = Infinity` here.)
Part 3 — the strange noise (audio-led tracking)
8. Walking north out of the glade the forest's sound comes back in layers
   (`audio.jungleLayers` gliding up over 20 s; birds last). `jungle.setTime("mist", 25)`.
   `music.play("chill", { intensity: 0.15 })` very low. At z > −18: THE CALL —
   `audio.mysteryCall(0.1, pan)` from `P.trail[0]`. The platypus's head snaps toward it
   (`platypus.lookAt`). Objective "What is that sound?" Hint "Listen. Follow the sound."
9. TRACKING: the call repeats every 4.5 s from the CURRENT trail point with
   `pan = sin(ctx.bearing(tx, tz))` and `closeness = 1 − dist / 45`; for 1.2 s after each call
   `ui.setPing(ctx.bearing(tx, tz), closeness, "sound")` shows the subtle arc (the visual aid; no
   map marker). Reaching within 4 m of a trail point: something small darts away through the ferns
   (`fx.leaves`, a rustle, a glimpse of a tail — `tribe.members.moss` placed 9 m on, `do("hide")`,
   `"peek"`), and the next point becomes current. The six points are six small discoveries:
   `[0]` a fern bank with webbed prints in the mud (the camera dips to them); `[1]` the river's
   edge: the call comes from ACROSS — find the `ford` (wading) or the `stones` (jumping);
   `[2]` wet prints on a rock that dry as you watch; `[3]` the giant fig: the call echoes — it comes
   from above then behind (a false echo: two quick calls, the second, louder one is the true one);
   `[4]` the hollow log: walk through its dark, the call right at the far end; `[5]` the vine
   curtain, the call from behind it, very close and clearly musical now (the PLATYPUS motif's first
   three notes: `music.motif("platypus")` answers it, quietly — the score recognises it first).
   Standing still for 8 s anywhere makes the call come again, a little louder (nobody gets lost).
   `checkpoint.set` silently at `[2]` and `[4]` (nothing can kill here; they serve `skipTo`).
10. THE MEETING: prompt "Push through" at the curtain (`jungle.curtain.open()`, `audio.vines()`).
    `P.meet`: a platypus, back turned, making the call (`moss.do("call")`). It turns. Both freeze.
    `camFig`-style two-shot. Moss `emote("curious")` → `do("greet")` (circles, sniffs, touches
    bills); the player is prompted "Greet" (E) → `platypus.playBow()`; `fx.hearts`. Caption:
    [You are like me!] / [Come. Come!] `music.setIntensity(0.6)`.
11. FOLLOW MOSS (`do("lead", { route: [meet → campGate → camp edge], waitDist: 5, run: true })`):
    a joyful run through the last trees — jump the roots with him, he looks back and chirps.
12. THE REVEAL: at `P.campGate` the camera takes over (`camCampReveal`, 9 s crane, skippable):
    `jungle.setTime("dusk", 6)`, `tribe.village.populate(jungle.P.spots)`, fires lit,
    `audio.tribeChatter(0.8)`, `music.play("tribe", { intensity: 0.8 })` hitting on the cut:
    dozens of platypuses — at the fire, in the creek pool, young ones tumbling, Old Burra on his rock.
    They all turn (`village.setMood("curious")`, `village.lookAt(player)`). Silence in the chatter
    for one beat. Then Nib waddles out and sits on the player's foot. `village.setMood("cheer")`,
    `audio.tribeCheer(1)`. Caption: "You are not the only one."
13. `cinema.fade("black", 2)`. End: `ui.showComplete({ kicker: "LEVEL 8", title: "COMPLETE" }, () => ctx.complete())`.

Checkpoints: `glade`, `trail2`, `trail4` (silent). Skip points: `memory2`, `memory3`, `wake`,
`carried`, `scream`, `trail`, `meet`, `reveal`.
`state()`: `{ step, memory, struggle, screamed, trail, moss, camp }`.

## Level 9 — THE TRIBE (≈ 12 min; forgiving: hearts, generous checkpoints, allies do half the work)

Modules: `jungle`, `tribe`, `combat` (rivals, allies), `lair`, `friend`. Music: `tribe` ↔ `chill`
→ `combat` (raid) → `tribe` → `dream`/`sorrow` (the vision).
Health: `ctx.health.enable({ max: 5, hearts: true, regen: 0.2, regenDelay: 5 })` from beat 5; rivals
do 1 heart per bite (windup 0.6 s, dodgeable). Falling to 0: restart at the last checkpoint.

1. Title card. `jungle.setTime("dusk")`, camp populated, player at `P.campGate` beside Moss.
   `music.play("tribe", { intensity: 0.5 })`, `audio.tribeChatter(0.6)`, fires on.
2. INTRODUCTIONS (free order; objective "Meet the tribe" 0/4, beacons on each): walk up + "Greet" (E)
   → each does one characteristic thing and gives one caption line and one small interaction:
   OLD BURRA at `P.elder` (`platypus.pose("kneel")`; he touches your brow: [You came from the sky.
   You are welcome here.]); TIKA at `P.bench` (holds a half-made leaf armor up against you, shakes
   her head, drops it: [Too small. Later.]); ROK at the fire (looks you over, shoves you — hint
   "Shove back! (L)" — a Tail Slap makes him laugh: [Good.]); NIB (hide and seek: he hides in one
   of three spots, giggling `tribeChirp`; find him by sound + `ui.setPing`, twice). Moss follows you
   throughout and "translates" with excited chirps. Each meeting adds a music layer.
3. FOOD: Burra thumps his tail; `village.setMood("feast")`, `village.gather(fire…)`. Rok lays a
   crayfish at your feet (`rok.do("feed", { food: 0 })`): prompt "Eat" → `platypus.eat()`,
   `audio.eatFruit`-style bites, hearts appear on the HUD for the first time as they fill
   (`ctx.health.enable`, set 2 → 5 as you eat three things: crayfish, grub, berries — Nib steals one
   berry). But the store (`P.foodStore`) is nearly empty: Burra points across the river with his
   bill: [The Ash tribe takes our food. Tonight we take it back.] `music.motif("king")` once, low —
   the first shadow. `jungle.setTime("night", 8)`.
4. THE HUNT (objective "Follow Rok to the Ash tribe"): Rok, Moss and 4 hunters (`combat.addAlly` ×4
   + `hero: rok`, `hero: moss`; `ctx.army.show("Hunters")`) set out; `village.setMood("war")` as you
   leave (paint on). `music.play("stealth", { intensity: 0.3 })`. Route: `logBridge` →
   `rivalPath`. On the bridge Rok teaches orders with one hint: allies simply follow and fight what
   you fight — nothing to manage. `checkpoint.set("bridge")`.
5. AMBUSH on the path (`P.ambush`): three `rival`s burst from the bushes (`music.play("combat",
   { intensity: 0.5, at: "now" })`). First real fight: rivals have 40 hp (two stings, or slap +
   anything), telegraph bites with a 0.6 s crouch + `fx.dangerZone` circle r 1.0, yelp and flee when
   beaten. Your hunters take one each if you do nothing for 5 s. `checkpoint.set("path")`.
6. THE RIVAL CAMP (`P.rival`, objective "Take back the food" 0/3): a thorn ring with one gate, two
   sentries at `rivalGate`, 8 rivals inside in three groups around the `hoard`. Options the layout
   offers: charge the gate with the hunters (straight fight, 10 rivals in waves of ≤ 5 active);
   or wade up the creek behind the camp where four rivals drink — one ELECTRO PULSE (K) from the
   water drops them all (hint when the player first stands in that water: "They are standing in the
   water..."); or Tail Slap the red totem by the gate: it falls on the thorn fence, a second way in
   and a distraction. Three food bundles at the `hoard` (`tribe.food`, prompt "Take" — carrying one
   = `platypus.setCarry(true)`, walk speed 2: hand it to a hunter (walk into one) and go back, or
   carry it out yourself). `music.setIntensity` with the number of active rivals. The Ash chief
   (a bigger `rival`, hp 120, paint) comes out when the 2nd bundle is taken: a mini-duel with a
   telegraphed lunge (0.8 s, line zone) — beaten, he bows his head and backs away; the rest flee.
   `music.stinger("victory")`. `checkpoint.set("hoard")`.
7. HOME with the food: a short run back over the river (`music.play("tribe", { intensity: 1 })`),
   `village.setMood("cheer")`, `village.wave()`, `audio.tribeCheer(1)`; Nib rides on your back for
   the last 20 m. Hearts refill. `ctx.army.show(false)`. `jungle.setTime("dawn", 10)`.
8. ARMOR (objective "Gather: 4 leaves, 2 vines, 2 bones" with three counters in the objective text):
   Tika taps the frame. Materials via `tribe.materials` at `leafGrove` (leaves hang 1.4 m up: jump
   and Tail Slap the stem, they spiral down), `vineWall` (hold E 1 s to pull one free; a second pull
   needs Moss, who comes when you call with E on him: he bites, you pull), `boneYard` (two ribs
   half-buried: slap the sand, then one is guarded by a grumpy river crab that pinches for 1 heart —
   lure it off with a berry or just be quick). `music.play("chill", { intensity: 0.5 })` while
   gathering; Moss and Nib tag along. Any order; `ui.setPing` toward the nearest still-needed kind
   when idle 10 s.
9. CRAFT at `P.bench`: "Place" (E) each piece (`bench.put(kind)`: the armor takes shape, Tika
   lacing with you). Then LACING, three pulls: `ui.setCharge(frac, "PULL", 0.6)` with a marker that
   sweeps 0 → 1 → 0 at 0.9 cycles/s; press E inside the green zone (0.6–0.85; the first pull's zone
   is 0.5–0.9) → `bench.tighten(1)`, `audio.craft("tighten")`; outside → `tighten(0.2)` (slips, try
   again, no penalty). Three good pulls: `audio.craft("done")`, `music.stinger("gear")`, prompt
   "Wear it" → `ctx.gear.wear("body", "leaf", { armor: 0.3 })`, a slow turntable shot (4 s),
   `village.setMood("cheer")`. All three pulls good first time: Tika adds the `"boneHelm"`.
   Rok tests it: one shove that now barely moves you.
10. NIGHT (`jungle.setTime("night", 6)`): the fire, `tika.do("dance")`, `village` dancing,
    `audio.tribeDrums(true, 0.8, music.nextBeatIn(), music.bpm)`. Optional 30 s rhythm toy: jump on
    the beat with the dancers (each on-beat jump = a cheer and sparks from the fire; no score, no
    fail). Then Burra: [Sleep. Tomorrow you tell us of the one you lost.] Objective "Go to sleep" →
    `P.bed`, prompt "Sleep": `platypus.sleep(true)`, Nib curls against you, the fire burns down
    (`fires[0].set(0.2)`), `music.play("dream", { intensity: 0.2 })`, `cinema.eye.close({ duration: 2.5, tint: "night" })`.
11. THE VISION (the dream that says 5 days): behind black `setWorld(lair)`, `lair.setVoid(false)`,
    `lair.setGlow(0.7)`, `lair.timer.setText("5 DAYS")`, Pip in the cell (`friend.attachTo
    (lair.cell.floor)`, `pose("curl")`, thinner, `emote("sad")`), `cell.sway(0.5)`.
    `cinema.play([{ day: "5 DAYS", hold: 3.2, kicker: "A DREAM" }, { cam: lair.P.camTimer, …4 s },
    { cam: lair.P.camCell, …5 s }])`: the timer above the lava reads 5 DAYS and ticks
    (`audio.timerTick`); in the cell Pip lifts its head as if it heard something, looks straight at
    the camera; `music.motif("pipSad")`; `audio.chainCreak()`. Pip's caption: [...are you there?]
    Snap to black on a tick.
12. Wake with a start in the camp at first light (1 shot, 3 s; Moss is already awake, watching you).
    Caption: "Five days." End: `ui.showComplete({ kicker: "LEVEL 9", title: "COMPLETE" }, () => ctx.complete())`.

Checkpoints: `camp`, `bridge`, `path`, `hoard`, `home`, `armor`. Skip points: `food`, `hunt`,
`rival`, `home`, `gather`, `craft`, `night`, `vision`.
`state()`: `{ step, met, food, rivals, bundles, leaf, vine, bone, pulls, armor, hp }`.

## Level 10 — THE BASE (≈ 15 min; HARD BUT FAIR: guns kill fast, restarts are instant)

Modules: `jungle` (start/end), `base`, `combat` (soldiers, officers, allies), `tribe`. Music:
`stealth` → `combat` → `sorrow` (the apron) → `combat` (armed) → `chill`/`tribe`.
Health: `ctx.health.enable({ max: 100, label: "Health", regen: 12, regenDelay: 4 })`; a rifle
bullet = 34 before armor (leaf armor 0.3 → 24: four hits; the suit 0.5 → 17: six). Level entry
re-applies `gear.wear("body", "leaf", { armor: 0.3 })`. `combat.bodyTTL = 12`.
The lesson of the first half, never stated: you cannot fight guns head-on. Cover, the dark, timing.
Every death → `respawn()` to the section's checkpoint with the squad restored (`combat.setAllies`).

1. Title card. Camp at dawn → dusk time-lapse behind one line from Burra: [They have your friend's
   scent on them. Go and see.] Cut: `setWorld(base)`, night, `P.overlook` with Rok, Moss and 6
   fighters (`ctx.army.show("Squad")`, count 8). `camOverlook` (6 s): the base below — floodlights,
   towers, searchlights, soldiers, the hangar. `music.play("stealth", { intensity: 0.3 })`.
   Rok: [Quiet. Stay in the dark.] Objective "Get inside the fence".
2. SECTION 1 — the fence (stealth, soldiers unaware; `ui.setSeen`). From the grass to `fenceHole`
   past the west searchlight (`base.lights[0]`: stay out of the disc; the squad follows in single
   file and freezes when you sneak-stop — hold Shift). One patrol (`gatePost`) walks the fence line.
   Through the hole: `checkpoint.set("cp1")`. If spotted here: the alarm (`base.setAlarm(true)`,
   `music.play("combat", { at: "now" })`) and four soldiers from `reinforceMain` — survivable only
   by retreating into the grass; teaches the stakes at once.
3. SECTION 2 — the outer yard (objective "Open the inner gate"): crate stacks as a cover chain,
   two patrols (`yardA`, `yardB`), both searchlights, sleeping barracks on the left (running within
   6 m of the huts wakes two soldiers). Takedowns from behind are possible on lone patrols
   (`"takedown"`; a squad member drags the body into shadow by itself). The `lever` is in the
   guardhouse with one officer facing the window: distract him (Tail Slap a truck in the
   `motorPool`: its horn blips — `combat.noise`) or take him down; Tail Slap the lever →
   `gates.inner.open()`, `audio.gateOpen(true)` — loud: the yard patrols come to look, go through
   NOW. `checkpoint.set("cp2")`.
4. SECTION 3 — THE APRON (the story beat: "lose a bunch"). Objective "Cross to the armoury".
   As the squad steps onto the concrete the floodlights slam on (`base.setAlarm(true)`,
   `audio.siren(true, "base")`), `music.play("combat", { intensity: 0.9, at: "now" })`:
   `apronLine` — six soldiers behind the hangar barriers and two on the `mezzanine`,
   `combat.maxShooters = 2`. Rok: [RUN!] It is a 40 m dash west along three sandbag rings to the
   armoury wall. Play: sprint from ring to ring BETWEEN bursts (watch the red lines: a burst locks
   after 0.5 s and lasts 0.3 s; then ~1.5 s when that shooter cannot fire); in a ring while
   sneaking you are safe (`cover`). The squad runs with you and is NOT safe: scripted losses —
   the level takes one ally at the 1st ring, two at the 2nd, one more at the wall (chosen from
   those in the open; never Rok, Moss — Moss is hit in the leg at the wall: `"hurt"`, Rok carries
   him). Each: the ally drops and lies still, `fx.sadMotes`, the nearest ally's `tribeChirp
   ("mourn")`, `ctx.army` counter shakes; on the first one `ctx.setTimeScale(0.5)` for 1.5 s and the
   music's drums cut out for two bars (`music.setIntensity(0.3)` then back). No blood, no lingering.
   If the PLAYER dies: restart at `cp2` (the gate already open, the squad at its `cp2` count; the
   scripted losses replay — they are the story). At the armoury wall: the bunker's blind corner is
   out of every line of fire. `checkpoint.set("cp3")`. `music.play("sorrow", { at: "bar" })` under
   the siren; 4 of 8 left; they huddle. Rok looks at the door, then at you.
5. THE DOOR: objective "Break the door (L)". Three Tail Slaps on the hinge (`doors.armoury`), each
   one answered by bullets chewing the corner (`fx.bulletImpact`, `audio.ricochet`): soldiers are
   advancing — a 25 s soft timer shown only as their red lines creeping round the corner; if it
   runs out two soldiers round the corner (fight them at point-blank: stings work, they cannot aim
   at ≤ 2 m — hint "Get close — they cannot aim!").
6. THE ARMOURY (inside, safe; `checkpoint.set("cp4")`; siren muffled; `music.play("stealth",
   { intensity: 0.2 })`). `camRacks` (3 s). Three racks with beacons; each "Take" (E) is a small
   moment (1.5 s, `music.stinger("gear")`, `audio.gearOn(kind)`):
   - SUIT: `racks.suit.take()`, `ctx.gear.wear("body", "suit", { armor: 0.5 })` — hint "Armor: you
     can take more hits."
   - GLASSES: `ctx.gear.wear("eyes", "glasses", { visor: true })`, `audio.visorOn()`: the HUD
     changes — the level now calls `ui.mark(i, sx, sy, "foe")` for up to 8 enemies (through walls,
     from `ctx.project`), `"ally"` for the squad's fallen-but-alive (Moss), `"goal"` on the exit;
     soldiers' aim lines become visible 0.25 s EARLIER (`combat.aimScale` unchanged; the level
     starts its own faint pre-line on `"aim"`), searchlight discs are outlined.
   - BLASTER: `ctx.gear.wear("weapon", "blaster")`, `ctx.abilities.shoot.enable({ ammo: 40,
     rate: 3, range: 20, muzzle: platypus.muzzle, targets: combat.enemies })`,
     `shoot.onFire = (o, dx, dz, t, d) => { platypus.fire(); audio.gunshot(0, 0, "blaster");
     fx.muzzleFlash(o, dx, dz); combat.playerShot(o, dx, dz, t, d); }` — it fires stun bolts
     (soldiers 80 hp, 50 per bolt: two bolts, or one + any melee = finish). Hint for F / mouse / the
     Fire button. Ammo crates in the room: +20 each ("Take ammo"), three of them, they refill at
     checkpoints. A firing-range moment: two cardboard targets to try it on before going out.
   The three fighters take nothing human-sized — Rok bites a strap of flash charges: that is the
   later gate explosion.
7. SECTION 4 — FIGHT OUT (objective "Escape! Back to the jungle", marker on `exit`; `music.play
   ("combat", { intensity: 1, at: "now" })` — the PLATYPUS theme in minor on the horns, the turn of
   the level: you are dangerous now). `combat.maxShooters = 3`. Waves, each a checkpoint:
   a. the apron again (`checkpoint.set("cp5")`), now from the hangar side: 6 soldiers, the two on
      the mezzanine first (shoot them: they are the ones who see everything). The visor shows them.
   b. the fuel dump: 5 soldiers and an officer behind barriers at `fuel` — shoot the drums (visor
      marks them "loot"): `base.fuel.explode()` knocks the group down and opens `eastGap`
      (the clever exit), or push through the inner gate.
   c. the yard: reinforcements from `reinforceNorth` and a truck (`audio.truckEngine`) that
      unloads 4; searchlights now hunt you (`lights[i]` track the player with a 1.5 s lag; shooting
      a tower lamp (visor "loot") blinds that tower for the rest of the level). Rok's signal: he
      and the squad blow `gates.main` (`audio.explosion`) when you reach z < 26: run.
      `checkpoint.set("cp6")` at the gate.
   Throughout: the squad fights beside you (`combat.order("attack")`), and you can still lose
   them (unscripted now): keeping all 4 alive earns one extra line from Rok at the end.
   Ammo is enough for ≈ 60 % of the enemies: melee finishes on stunned soldiers and cover play
   remain necessary. Empty: `audio.emptyClick`, hint "Out of ammo — get close!".
8. OUT: into the tall grass; the shooting thins behind (`combat.calm`, far `audio.gunshot(1)`),
   `base.setAlarm` still wailing, fading. `music.play("chill", { intensity: 0.3 })` (the victory
   cadence plays by itself). `setWorld(jungle)` behind a 0.6 s black, `jungle.setTime("dawn")`,
   `P.baseTrail` → walk (control stays with the player, 40 m) with the survivors, Moss on Rok's
   back, to the camp. `village.setCount(…)` thinner; `village.setMood("mourn")` — they count who
   came back. Burra lays four leaves on the fire, one by one (`fx.sadMotes`), `music.motif
   ("pipSad")`… then looks at your new gear, and at the tribe: [Now we know what they are.] /
   [And they know what YOU are.] The tribe lifts its heads (`setMood("war")`).
9. End: `ui.showComplete({ kicker: "LEVEL 10", title: "COMPLETE" }, () => ctx.complete())`.

Tuning: 34 dmg bullets, max 2 (later 3) shooters, 0.75 s aim with lock at 70 %, bursts of 3;
soldiers 80 hp; 38 soldiers + 3 officers in the whole level, ≤ 10 alive at once (≤ 24 with
bodies). Health regen 12/s after 4 s safe. Expected deaths for a new player: 6–12; every
checkpoint is ≤ 60 s of play from the next. Assist from `tries ≥ 3`: `combat.aimScale = 1.25`,
`damageScale = 0.75`; from 6: 1.5 / 0.5, regenDelay 2.5, and one hint about the last killer
("Wait for the red line to lock, THEN run", "Shoot the two on the balcony first", …).
Checkpoints: `cp1` … `cp6` (base.P). Skip points: `yard`, `apron`, `door`, `armoury`, `fightout`,
`fuel`, `gate`, `home`.
`state()`: `{ step, checkpoint, hp, squad, lost, alarm, gear, ammo, alive, tries }`.

## Level 11 — THE PLATYPUS KING (≈ 16 min; battle + boss: demanding, with a checkpoint per phase)

Modules: `dream` (`"void"`, `"echo"`), `jungle`, `tribe`, `combat`, `potions`, `boss`, `getWizard`.
Music: `dream` → `combat` → `boss` (3 phases) → `sorrow` → none → `dream`.
Entry re-applies: `gear.wear("body", "suit", { armor: 0.5 })`, glasses (visor), blaster.
Health 100, regen 10 after 4 s. `combat.bodyTTL = Infinity` during the battle and the boss.

Part 1 — the dream with no wizard
1. Title card. Behind it `dream.setScene("void")`, `setWorld(dream)`, `music.play("dream",
   { intensity: 0.1 })`, `audio.dreamAmbience(true)`.
2. `cinema.dayCard("3 DAYS...", { kicker: "", hold: 3.2 })`. Fade in: the grey quilt, black all
   round, the small warm light far ahead. Control. Objective "Where is Wizard Wobble?" Walking
   toward the light (it stays 20 m away; footsteps echo; the quilt squishes without colour).
   After 12 m: the light flickers. `audio.farVoice(4, 0.3)`: "Wait..." (caption, small, far).
   After 20 m: the light starts to recede faster; `farVoice(5, 0.8)`: "Wait — don't go!" The player
   is running now (the level raises `maxSpeed` to 3.6 — it still gets away). `music.setIntensity(0.8)`.
   After 30 m, or 25 s: the light stops, swells, `farVoice(7, 1)`: "Your power is within you—"
   (cut off mid-word) and it goes out. `cinema.fade("black", 1.6)`. No Wobble was ever seen.
   `music.duck(1, 1.5)`.
Part 2 — the army comes
3. Black. `audio.warCry()` far off, `tribeChirp("scared")`, a drum. `setWorld(jungle)`,
   `jungle.setTime("storm")`, `audio.rain(0.6)`, `audio.thunder(0.5)`. Wake in the camp, Nib
   shaking you. `village.setMood("alarm")`. Rok at the gate: [They followed us. All of them.]
   Burra presses three potion flasks into your paws: [Wobble showed you. I saw it in your sleep.]
   → `ctx.abilities.potion.enable({ count: 3, max: 6, targets: combat.bodies })`,
   `potions.bodies = combat.bodies`. Objective "Defend the riverbank". Run with the tribe
   (12 fighters: `combat.addAlly` ×10 + Rok + Moss(limping, stays at the `barricade`);
   `ctx.army.show("Army")`) to `P.field`. `checkpoint.set("field")`.
   `music.play("combat", { intensity: 0.6 })`.
4. THE BATTLE — three waves from `fieldGates`, `combat.maxShooters = 2`:
   WAVE 1 (8 soldiers): fight as learned (blaster 30 ammo, melee, cover behind boulders and
   trunks). The first soldier that falls gets a beacon and the hint "Remember the dream. Throw a
   potion (Q)." → the transformation, in the rain, for real: the swirl, the newborn sits up, looks
   at its paws, at you — chirps — and charges back at the soldiers. `music.stinger("armyUp")`,
   army counter +1. THE LOOP of this level: knock out → potion → your army grows → the next wave
   is easier. Potions refill: Tika runs flasks from the camp (a pickup spawns at the `barricade`
   every 12 s, `potions.spawn`, max 3 lying there), and a splash wakes up to 3 bodies lying close:
   fighting so that enemies fall TOGETHER (pulse in the river shallows, slap knock-downs side by
   side) is the skill ceiling. `checkpoint.set("wave2")` when wave 1 is down.
   WAVE 2 (12 soldiers + 1 officer, two directions; the storm peaks): `music.setIntensity(0.8)`.
   Objective shows "Army: n" as the count grows. `checkpoint.set("wave3")`.
   WAVE 3 (14 soldiers + 2 officers): by now a good player leads 15–25 platypuses and the wave
   breaks on them (`music.setIntensity(1)`, the theme in MAJOR for the first time under the minor
   ostinato). The last soldiers throw down their rifles and run (they are not chased).
   `jungle.setTime("dawn", 12)`, rain stops, `audio.tribeCheer`. Army counter stays on screen.
   Restore for each wave: the wave respawns, the army is set back to the count the player had when
   the checkpoint was taken (`combat.setAllies(n, …)`), potions to that count.
5. The ground shakes (`cinema.shake`, `audio.bossStep` ×3, birds lift from the west). Every platypus
   turns toward the stone circle. `music.play("boss", { at: "bar" })` phase 0, starting with the
   KING motif alone in low brass. Burra, quietly: [The old king. He sold us to them.] Objective
   "Face the Platypus King". Walk to `P.arenaIn` with the army behind you (a long line through the
   ferns — the image of the level). `checkpoint.set("king0")`.
Part 3 — the Platypus King
6. Entering the circle: cutscene (8 s, skippable; `camArena` then low angle): he lies on the fallen
   idol like a throne, crown glinting, cape; soldiers' helmets hung on the standing stones. He rises
   (3.2 m long), `body.attack("roar")`, `audio.bossRoar()`; the army flinches back to the ring's
   edge (`combat.order("hold", arena)`: they line the circle and join only as B7 allows — those
   within 4 m of him; the level sends in up to 8 at a time with `order("charge")` after each
   opening and calls them back on `"closed"`). `ui.boss.show("THE PLATYPUS KING", 3)`,
   `boss.setArena(jungle.P.arena)`, `boss.start()`.
7. PHASE 1 (hp 300 → 200; half-time music): tail sweep, bill slam, charge. The player learns:
   read the ground marker; JUMP the sweep; step out of the slam circle and punish the stuck bill
   (sting ×3 or slap ×2 in the window: ≈ 70); bait the charge into a pillar for the long opening.
   Hint lines are driven by `boss.onEvent("hitPlayer", name)`: the 2nd time the same attack hits,
   show its counter ("Jump over the tail!", "Stand in front of a stone, then dodge!").
   `ui.boss.set(boss.hp / 300)`. The blaster chips (6 per bolt in a window, plinks off armor
   otherwise; ammo 30, no refills in the arena).
8. `"phase"(1)`: he staggers, roars, the cape flares; `ui.boss.phase(1)`, `music.setPhase(1)`,
   `checkpoint.set("king1", { restore })`, potions +2. `"summon"(4)`: four soldiers run in through
   `arenaBack` (the King's own guard) — knock them out, POTION them: the fight feeds your army.
   PHASE 2 (200 → 100): adds ground pound (jump the ring; two soldiers are flattened by it if they
   stand close — let him do your work) and venom spit. Pillars break; fewer places to hide, fewer
   pillars to bait: openings shift to the post-pound landing (1.2 s) and the slam.
9. `"phase"(2)`: `ui.boss.phase(2)`, `music.setPhase(2)` (choir, the key lifts), `checkpoint.set
   ("king2")`, potions +2, `"summon"(6)`. PHASE 3 (100 → 0): combos, double rings, he is
   `"wounded"`; the army's chip damage is at its cap (8/s) if you built it — the theme of the level
   in the mechanics. Health pickups: none; regen is the only healing — retreat behind a stone.
10. `"finalStagger"`: he sways in the centre, `vulnerable`. Everything slows
    (`ctx.setTimeScale(0.4)`), music holds one chord. The player's LAST HIT (any attack; prompt
    "Finish it" if 4 s pass) → `platypus.finisher()`, `boss.defeat()`:
    `cinema.play` with three shots tracking `boss.group` (low side, crown close-up, wide):
    the crown falls and rolls (`"crownOff"`), he topples (`"landed"`: `cinema.shake(1.4, 1.2)`,
    dust, `music.stinger("victory")` then `music.play("sorrow", { intensity: 0.2 })`),
    time scale back to 1; the army is silent (`village`/allies: heads low — he was one of them).
    `ui.boss.hide()`. `"drop"`: from his open paw the bottle falls and rolls to rest
    (`potions.living.drop`), and a paper flutters down after it (`boss.paper.flutterDown`).
11. Control. Objective "What did he drop?" Beacon on the bottle. "Look" (E): close-up
    (0.5 m): the heart-shaped bottle, rose-gold light, the label: LIVING POTION — one caption:
    "LIVING POTION." (the label is a picture of a heart beside the words; the platypus knows what
    the picture means) — `audio.livingPotion()`, `potions.living.pickUp(platypus.holdAnchor)` then
    stowed (`platypus.setGear("back", "pack")`). Hope: `music.motif("pip")` in major, once.
12. The paper: "Look" (E): `boss.paperShot` close-up. The player sees what the platypus sees:
    scribbles (`paper.setReadable(0)`). For 2.5 s — over the platypus's tilted head — the ink
    resolves for the PLAYER only (`setReadable(1)` over 0.8 s): NEVER APPROACH THE FARLANDS — and
    dissolves back to scribbles (`setReadable(0)`). Caption: "You cannot read. It is only paper."
    The platypus sniffs it, sneezes, drops it; it blows a little way toward `farTrail`. (Dramatic
    irony: do not explain further.)
13. Burra arrives at the circle's edge with the tribe. He sees the bottle; he will not come near the
    paper. [That bottle wakes what sleeps.] / [Your friend. Go. Three days.] Rok, Moss, Nib step
    forward to come; the player shakes its head (`platypus.shake`-like no) — alone. Nib presses his
    leaf hat on you anyway. `music.play("chill", { intensity: 0.4 })`.
    Objective "Go and find Pip" — marker on `arenaBack` → `farTrail`, west, toward the mountains
    (past the paper, which the camera lets you notice lying face-up by the path).
Part 4 — the shot
14. The trail climbs out of the trees (control stays with the player; 35 m). Dawn light, the widest
    view in the game so far (`camFarTrail` blends in as a high follow): mountains, and far away a
    red glow under a peak (the lair). `music.motif("platypus")`, full and warm, intensity 0.8 — the
    player is meant to feel it is over. At the crest, mid-stride, with no warning but a single
    red glint from the trees behind (visible 0.3 s to an attentive player — the visor is OFF since
    the gear moment; fair in hindsight): `audio.shotDown()`, `platypus.collapse("shot")`,
    `ctx.health.shield = true`, `music.duck(1, 0.05)`, `music.stop(0)`, white flash 1 frame,
    `ctx.setTimeScale(0.2)`; the camera drops to the ground with the platypus: grass, the bottle
    rolled out of the pack 1 m away, glowing, unbroken; a paw reaching for it; boots at the edge of
    the frame, out of focus. `cinema.eye.close({ duration: 2.2 })`. Black. Ringing fades to nothing.
Part 5 — the echo
15. Black, 3 s. Then a single celesta note. `dream.setScene("echo")`, `setWorld(dream)`,
    `music.play("dream", { intensity: 0.3 })`. Fade in on `camSun`: the huge pale sun, the glass
    pillars, and Wizard Wobble (`getWizard`) waiting at `P.wizard` — visible at last.
    Wobble: "There you are. I am sorry I could not come." / "They keep me far away now. But not
    from here." (touches your chest) / "You have done it once. By accident." (a flash of level 8's
    scream) / "Now do it on purpose."
16. LESSON — THE SCREAM (controlled). `ctx.abilities.scream.enable({ chargeTime: 1.2, minCharge:
    0.25, cooldown: 3 })` (short cooldown: this is a school) with:
    `onStart` → `platypus.screamCharge` per frame via `onCharge(f)` (+ `audio.screamCharge(f)`),
    `onRelease(p)` → `platypus.scream(p, true)`; at `screamTime`: `audio.scream(p, true)`,
    `fx.screamWave(x, y, z, p)`, `cinema.shake(0.4 + 0.8p, 0.8)`, `music.duck(1, 0.1)` restored after
    the returned silence; `dream.pillars.blast(x, z, 8 + 14p, p)`; `combat.blast(x, z, 8 + 14p, p)`.
    `onFizzle` → `audio.screamFizzle()`, Wobble: "Deeper. From your belly."
    Three exercises (objective with counters):
    a. "Hold R, then let go" — any scream ≥ minCharge shatters the three NEAR pillars. Wobble:
       "Good! Small breath, small voice."
    b. "Break the middle ring" — needs power ≥ 0.6 (radius ≥ 8 m reaches `mid` from `spawn`):
       teaches charging longer. The charge bar's tick moves to 0.6 (`ui.setCharge` min).
    c. "All of them" — the far ring needs FULL charge and standing on the `rise` (Wobble floats
       there: "Come up here."). A full scream: the whole dream bends (`fx.shock`), every pillar goes,
       the sun flares. Wobble: "THAT is your voice."
    d. The test: eight `dreamSoldier`s rise among the stumps and walk in from all sides
       (`passive: false`, slow). One full scream drops all eight (`combat.blast`); the cooldown
       (now set to 6 s: `scream.enable({ cooldown: 6 })`) teaches that it is a moment to choose,
       not a button to mash — if some remain they keep coming and the player must dodge 6 s.
       `music.setIntensity(1)`; on success `music.stinger("victory")`.
17. Wobble, fading already (`dream.setGlow(0, 6)`): "When you wake you will be in a cage again." /
    "Do not be afraid of the dark. Be the loudest thing in it." / "Three days, little one." The sun
    sets in ten seconds; Wobble is a point of light; gone. `music.motif("wobble")`, last note held.
    `cinema.fade("black", 3)`. In the black: `audio.timerTick()` once.
18. `cinema.endCard("TO BE CONTINUED", { hold: 4, sub: "LEVEL 11 COMPLETE" }, () => ctx.complete())`.

Tuning: battle waves as listed, ≤ 12 soldiers alive at once; the King: B7 numbers; a clean kill
≈ 4–5 min; damage per mistake 15–35 of 100 with regen, so a phase allows about four mistakes in a
row. Restores: `king0/1/2` → `boss.setPhase(n)`, army and potions as at the checkpoint, summons
cleared. Assist (`tries ≥ 3` on a king checkpoint): the level scales boss damage ×0.75 and windups
×1.15 via `boss.assist = 1` (0 | 1 | 2; 2 from 6 tries: ×0.5 / ×1.3 and openings +0.5 s).
Checkpoints: `field`, `wave2`, `wave3`, `king0`, `king1`, `king2`, `after` (silent, beat 11).
Skip points: `void`, `battle`, `wave3`, `king`, `king2`, `king3`, `drop`, `trail`, `shot`, `echo`,
`test`. `state()`: `{ step, wave, alive, army, potions, bossHp, bossPhase, hp, screams, pillars, tries }`.

(B7 addition used above: `boss.assist = 0 | 1 | 2`, read by boss.js as stated.)

--------------------------------------------------------------------------------------------------

# Part D — performance (budget: Intel UHD 620, 60 fps, < 150 draw calls, < 250k triangles, one
1024 shadow map, no post-processing)

General rules for these levels:
- ONE world visible at a time. Every `setWorld` happens behind black (or the white pad flash in
  level 7). A world's `group` is detached when it is not the active world (LEVELS.md A9); modules
  that live in a world's group (combat, potions, boss, tribe) are re-parented in `enter()`.
- Shadows: only the player, named characters (≤ 4), the King, the helicopter and large static
  set pieces cast into the one shadow map (follows the player, 40 m box). Segment-instanced humans,
  the platypus crowd, vegetation cards and fx never cast; humans and crowd get blob shadows.
- Lights: the hemisphere + the one directional light only (the lair keeps its one PointLight).
  Lamps, fires, searchlights, spots, muzzle flashes are emissive / additive meshes and ground discs.
- Transparent things are alpha-TESTED where possible (foliage, fences, nets); additive cones and
  mist cards are few (≤ 12 on screen) and never stacked more than 3 deep.
- Build everything of a level in `build()` (behind the title card); nothing compiles mid-play:
  call `ctx.renderer.compile(world.group, ctx.camera)` once per world, and show each fx once at
  scale 0 in `build()` to warm its shader.
- Per-frame cost of AI: `world.sight` ≤ 24 enemies × (player + ≤ 3 nearest allies); allies think
  in 4 staggered groups (one group per frame).

Draw-call / triangle plans (worst view):

| level | scene | calls | tris | what is visible, and how |
|---|---|---|---|---|
| 6 | dream school | ≈ 60 | ≈ 120k | quilt 2, sky dome 1, drifting islands 1 (instanced), lantern-stars 1, pool 1, cauldron + ingredients 4; player 12; wizard ≈ 8; dream soldiers ≤ 12 as segment instances (10 calls) + blobs 1; platypus crowd 2 (the 5 newborns; no full models); potions 3; fx ≤ 10 |
| 7 | circus on foot | ≈ 95 | ≈ 170k | circus ≤ 45 (tent interior and exterior are separate groups: inside the tent hide the lot's wagons/midway, outside hide the bleachers and ring); guards ≤ 9 → 12 calls; cones 1; player 12; helicopter 10 (only when z > 24); fx ≤ 10. Bulb strings: one InstancedMesh; canvas sway in the vertex shader |
| 7 | flight | ≈ 65 | ≈ 130k | corridor ≤ 30 (2 of 5 terrain strips, windowed instanced scenery, far = 320 with fog matched to the sky), helicopter 10, player 12 in the seat (legs hidden under the dash: allowed to drop to a 4-call LOD by `visible` flags), gate rings 1, fx ≤ 8. Collision tests only against obstacles within ±60 m of z (the array is sorted by z; keep a moving index) |
| 8 | memories (zoo) | as levels 2–3 | | unchanged zoo budget; crowd off; Pip + player only |
| 8 | jungle + handlers | ≈ 105 | ≈ 200k | jungle ≤ 55 with zone LOD (zones > 55 m hidden; camp zone hidden until the reveal; rival/arena/field zones hidden all level); handlers 4 → 12 calls; player 12; Moss 12 (hidden until the meeting); fx ≤ 12 (the scream: screamWave is 4 calls for 2 s — nothing else spawns then) |
| 8 | camp reveal | ≈ 120 | ≈ 230k | camp zone on, far zones off; village crowd 2 calls (36 instances); named members ≤ 3 full models during the crane (Moss, Burra, Nib), Tika and Rok are crowd instances until the cut; fires 3 (one instanced fx) |
| 9 | camp | ≈ 120 | ≈ 225k | as the reveal; never more than 4 full member models + player; materials/food/bench 5 |
| 9 | raid | ≈ 100 | ≈ 190k | rival zone on, camp zone off; rivals + hunters all in the platypus crowd (2 calls), Rok + Moss full models; no humans (their 12 calls are free) |
| 9 | vision | as level 5's lair shot | | lair + Pip only |
| 10 | base | ≈ 120 | ≈ 215k | base ≤ 45 (hangar interior group hidden until z > 44; barracks interiors never modelled); soldiers ≤ 10 alive + ≤ 14 bodies → 12 calls (instances, so bodies are free in calls; cap 24 — the oldest body fades first); allies in the crowd 2; Rok + Moss 24; player 12 + gear 3; telegraphs/tracers/impacts/flash 5; searchlight cones 2; visor markers are DOM (≤ 12 elements, transform only) |
| 11 | battle | ≈ 125 | ≈ 235k | jungle field zone only (camp, arena, rival zones off) ≈ 40; soldiers ≤ 12 alive, 24 with bodies (12 calls); army ≤ 40 in the crowd (2 calls — NEVER full models for newborns; the sit-up is a crowd `anim`); Rok full, Moss full at the barricade; potions 3; transformSwirl ≤ 3 at once (pooled; a 4th waits); rain = one instanced streak mesh on the camera |
| 11 | the King | ≈ 110 | ≈ 220k | arena zone only ≈ 30 (the ring of stones, idol, floor, backdrop trees as 3 instanced card rings); King ≤ 18 calls / 45k; player 15; army crowd 2 (≤ 40 on the rim); summoned soldiers ≤ 6 (12 calls); dangerZones / shockRings 3; boss bar is DOM |
| 11 | void / echo | ≈ 40 | ≈ 90k | quilt, light, wizard, pillars (1 InstancedMesh, 12), dream soldiers ≤ 8 |

Instancing plan (who owns which InstancedMesh; sizes are maxima and fixed at build):
- combat.js: 10 human segment meshes × 24, 1 blob × 64, 1 vision-cone fan × 12, 1 platypus crowd
  × 40 (allies) + 1 × 16 (rivals) — or one crowd of 56 shared (preferred: 2 calls).
- tribe.js: 1 platypus crowd × 36 (village). In level 11's battle the village crowd is hidden
  (everyone is at the field as combat allies); in the arena the rim is the combat crowd.
- jungle.js: trunks 5 meshes, canopy cards 2, palms/ferns/broadleaf/flowers 6 (per zone: 8 zones →
  only the ≤ 3 zones within 55 m have `visible = true`; zone meshes are separate InstancedMeshes so
  culling is a flag, never a matrix rewrite), rocks 2, lianas 1, grass 1 (windowed around the
  focus, 3 000 blades max), litter 1, mist via fx.
- circus.js / base.js: bulbs/lamps 1, fence posts + panels 2, crates/barrels/sandbags 3, bunting 1,
  stakes + ropes 1, wagons share 2 geometries (instanced with per-instance colour).
- heli.js: trees 2, hedges 1, pylons + towers 1, canopy clumps 2, lights 1; scenery windows
  re-fill at most ONE InstancedMesh per frame when the craft crosses a 40 m cell (staggered).
- fx.js: every effect family is one pooled instanced/points mesh; total fx on screen ≤ 14 calls.

Things that must NOT happen per frame: creating vectors/arrays/closures in `update`, `ui` calls with
changing strings (cache), canvas redraws (labels, paper, poster, timer text are drawn once),
`InstancedMesh.count` thrash (hide by zero scale instead), `Object3D.traverse`, raycasts (use
`ctx.pick` on interact only; aiming uses the plane maths of `ctx.input.aim`), shader recompiles
(no adding/removing lights or toggling `fog` on a live material; env changes go through
`ctx.setEnv`).

Test seam for the integrator (each level's `state()` + `skipTo` above; `__platy.state().svc`):
`node tools/playtest-engine2.cjs` (engine services, menu, chain) and `node tools/playtest.cjs
--quick` (levels 1–5 unchanged) must stay green after every module lands.
