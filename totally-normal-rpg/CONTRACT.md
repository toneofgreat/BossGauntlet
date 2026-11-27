# TOTALLY A NORMAL RPG - Architecture and module contract

Seven builders work in parallel and cannot see each other's code. This file is the ONLY shared truth for APIs, ids,
file ownership and data shapes. Content and numbers come from `DESIGN.md` (section refs like D4.6).
If you need something not listed: add the smallest compatible thing inside YOUR files (e.g. an extra optional field,
an extra exported helper), keep every signature below working, and report it under "contract changes".

## 0. Global rules
- Plain ES modules, no build step, no npm runtime deps, no CDNs, no external assets, no web fonts.
- THREE r185: every module gets it as `ctx.THREE`. A file that needs it at import time imports
  `src/engine/three.js` (ENGINE), which is exactly: `export * from "../../../platypus/vendor/three.module.js";`
  Depths: `src/main.js` -> `../../platypus/vendor/three.module.js`; `src/<dir>/x.js` -> `../../../platypus/...`.
  No three addons exist; write your own.
- Online: `src/ui/*` imports `../../../platyfy-online.js`; names: `../../../platypus/src/names.js`.
- Every `.js` passes `node --check`. Imports must not touch `window`/`document` at module top level (so node can import
  pure data/logic files in tests); do DOM work inside `init`.
- Hot loops (per-frame update, collision, AI): no allocation. Keep scratch `Vector3`s at module scope. No closures
  created per frame, no array `map/filter` per frame, no string building per frame except when a UI value changed.
- Units: metres, seconds, radians. +Y up. "yaw 0" faces +Z; yaw grows counter-clockwise seen from above
  (forward = (sin yaw, 0, cos yaw)).
- Never throw out of `update`/bus handlers; catch and `console.warn("[module]", e)`.
- Reduce flashing (`state.settings.reduceFlashing`) is honoured by `engine.postfx.flash`, `ui.jumpscare`, and UI
  title effects; other modules must route flashes through those two calls (never make full-screen flashes yourself).
- All text you put on screen must fit a 390 px wide viewport.
- Everything is created once and reused; spawning/despawning uses pools.

## 1. Folder layout and ownership
```
totally-normal-rpg/
  index.html  style.css                     ENGINE
  DESIGN.md  CONTRACT.md                    LEAD (read-only for builders)
  src/main.js                               ENGINE  (boot, ctx, init order, loop start, window.__tnrpg base)
  src/engine/  three.js bus.js state.js renderer.js postfx.js sky.js terrain.js vegetation.js water.js
               materials.js lighting.js quality.js loop.js physics.js humanoid.js atmosphere.js index.js   ENGINE
  src/player/  controller.js camera.js input.js touch.js index.js                                         ENGINE
  src/world/   index.js zones.js lobby.js area1.js area2.js area3.js offworld.js npcs.js portals.js props.js  WORLD
  src/combat/  index.js stats.js items.js itemMeshes.js enemies.js ai.js bosses.js drops.js ngplus.js save.js  COMBAT
  src/events/  index.js sequencer.js postking.js chase.js collapse.js throne.js hollowDesert.js girl.js
               hollow2.js sword.js endings.js idle.js final.js monsters.js                                 EVENTS
  src/story/   index.js dialogue.js lines.js objectives.js secrets.js phases.js endings.js                    STORY
  src/audio/   index.js synth.js instruments.js music.js tracks.js sfx.js voice.js reverb.js                  AUDIO
  src/ui/      index.js title.js particles.js names.js hud.js objective.js dialogue.js menus.js shop.js
               leaderboard.js endings.js screens.js jumpscare.js icons.js ui.css(optional, loaded by ui)       UI
  tools/       browserlock.cjs serve.cjs playtest.cjs check.cjs                                              ENGINE (playtest: shared, see 14)
```
You may add files ONLY inside your own folder(s). Filenames inside your folder are a suggestion except `index.js`
(must exist and export `init`). UI may inject its own `<style>` or load `src/ui/ui.css` via a `<link>` it creates.

## 2. Boot, ctx and init order (ENGINE writes main.js exactly like this)
```js
import * as THREE from "./engine/three.js";
import { createBus } from "./engine/bus.js";
import { createState } from "./engine/state.js";
import * as Engine from "./engine/index.js";     // each index.js: export async function init(ctx) -> api
import * as Save from "./combat/save.js";        // export async function init(ctx) -> save api (runs early)
import * as Audio from "./audio/index.js";  import * as UI from "./ui/index.js";
import * as World from "./world/index.js";  import * as Combat from "./combat/index.js";
import * as Story from "./story/index.js";  import * as Events from "./events/index.js";
const ctx = { THREE, bus: createBus(), state: createState(), scene: null, camera: null, renderer: null,
  engine: null, save: null, audio: null, ui: null, world: null, combat: null, story: null, events: null };
window.__tnrpg = { ctx };                               // debug base (13)
ctx.engine = await Engine.init(ctx);                    // sets ctx.scene / ctx.camera / ctx.renderer too
ctx.save   = await Save.init(ctx);                      // loads localStorage into ctx.state
ctx.audio  = await Audio.init(ctx);
ctx.ui     = await UI.init(ctx);                        // title screen shows NOW (2D canvas, instant)
ctx.world  = await World.init(ctx);                     // builds all zones (may yield with await engine.yieldFrame())
ctx.combat = await Combat.init(ctx);
ctx.story  = await Story.init(ctx);
ctx.events = await Events.init(ctx);
ctx.engine.vegetation.scatter();                        // after WORLD registered exclusions
ctx.engine.start();                                     // starts the loop
ctx.bus.emit("game:ready", {});
```
- Rules: during your `init` you may call APIs of modules initialised BEFORE you. Modules initialised after you are
  reached lazily through `ctx.x` at call time (in handlers / update), never cached as `null` during init.
- `init` failures: main.js wraps each in try/catch, logs, and continues (a broken module must not black-screen the game).
- Each module registers its per-frame work with `ctx.engine.addSystem(name, fn, priority)`.
- While the title screen is up, `state.ui.screen === "title"`: the 3D loop still renders (behind the opaque title) at
  low cost, but systems check `ctx.state.rt.playing` (false until `game:start`) and skip gameplay.
- Play flow: UI title -> (name entry) -> UI emits `ui:play` {newGame} -> STORY handles: `story.beginRun()` which sets
  `state.rt.playing = true`, places the player (ENGINE), emits `game:start` {newGame, cycle}. UI fades in.

## 3. Event bus (`src/engine/bus.js`)
```js
bus.on(name, fn) -> off()      bus.once(name, fn) -> off()      bus.off(name, fn)
bus.emit(name, payload)        // synchronous, in registration order; handler errors are caught + logged
```
Payload objects may be reused by the emitter for hot events (`player:step`, `boss:hp`): copy fields, don't keep them.
| Event | Payload | Emitted by |
|---|---|---|
| `game:ready` | `{}` | main |
| `ui:play` | `{ newGame:bool }` | UI |
| `game:start` | `{ newGame:bool, cycle:int }` | STORY |
| `game:pause` | `{ paused:bool }` | UI (pause menu) |
| `settings:change` | `{ key, value }` | UI |
| `input:attack` | `{ phase:"down"|"up", held:sec }` | ENGINE |
| `input:dodge` `input:jump` `input:interact` `input:inventory` `input:menu` | `{}` | ENGINE |
| `input:activity` | `{ t }` (throttled to 4/s) | ENGINE |
| `player:jump` `player:dodge` | `{}` | ENGINE |
| `player:land` | `{ fall:m/s }` | ENGINE |
| `player:step` | `{ surface, run:bool }` | ENGINE |
| `player:fell` | `{ y }` (below region kill Y) | ENGINE |
| `player:attack` | `{ kind:"punch"|"slash"|"heavy"|"bolt", weapon:itemId }` | COMBAT |
| `player:hurt` | `{ amount, hp, maxHp, source }` | COMBAT |
| `player:died` | `{ source, zone }` | COMBAT |
| `player:respawn` | `{ zone }` | COMBAT / EVENTS |
| `zone:enter` / `zone:exit` | `{ id, prev }` / `{ id }` | WORLD |
| `portal:enter` | `{ id, to }` | WORLD |
| `portal:denied` | `{ id, need, have }` | WORLD |
| `gate:open` | `{ id }` ("area2","area3") | WORLD |
| `interact:focus` | `{ id, label }` or `{ id:null }` | WORLD |
| `interact:use` | `{ id }` | WORLD |
| `npc:talk` | `{ npc }` | STORY |
| `dialogue:open` / `dialogue:close` | `{ npc }` | UI |
| `enemy:spawn` | `{ id, kind }` | COMBAT |
| `enemy:hit` | `{ id, kind, dmg, crit, heavy }` | COMBAT |
| `enemy:killed` | `{ id, kind, boss:bool, levels, first:bool, pos:{x,y,z} }` | COMBAT (also EVENTS for hollow1/2/3) |
| `boss:start` | `{ id, kind, name, maxHp, segments? }` | COMBAT / EVENTS |
| `boss:hp` | `{ id, hp, maxHp, phase }` | COMBAT / EVENTS |
| `boss:end` | `{ id, kind, won:bool }` | COMBAT / EVENTS |
| `level:gain` | `{ amount, total, source:kind }` | COMBAT |
| `level:set` | `{ total }` | COMBAT (debug/reset) |
| `milestone` | `{ id, threshold }` (ids in 8.3) | COMBAT |
| `item:get` | `{ id, first:bool }` | COMBAT |
| `item:equip` | `{ slot, id }` | COMBAT |
| `unlock` | `{ id }` ("area2","area3","kingPortal","villager_morph","iron_armor","golden_armor") | COMBAT |
| `objective:set` | `{ id, text, target:{x,y,z}|null }` | STORY |
| `secret:found` | `{ id, name, count, total }` | STORY |
| `story:phase` | `{ phase, prev }` | STORY |
| `seq:start` / `seq:end` | `{ id }` | EVENTS |
| `ending` | `{ id }` | STORY |
| `audio:lyric` | `{ text }` ("" clears) | AUDIO |
| `save:written` | `{}` | COMBAT(save) |
| `run:reset` | `{ cycle }` | STORY (every module resets its run state on this) |

## 4. Shared state (`src/engine/state.js`, ENGINE writes `createState()` returning exactly this default)
```js
{
  v: 1,
  profile: {               // persisted, survives new game
    name: "", onlineName: "", secrets: {},   // secrets: { [id]: timestampMs }
    endings: {},           // { [endingId]: count }
    runs: 0, playMs: 0, signReads: 0, npcsTalked: {}   // npcsTalked: { [npcId]: true }
  },
  settings: {              // persisted
    reduceFlashing: false, master: 0.8, music: 0.7, sfx: 0.9, sensitivity: 1, invertY: false,
    pointerLock: true, quality: "auto", showFps: false, hints: true
  },
  run: {                   // persisted, reset by new game / new cycle
    cycle: 0, level: 0, phase: "intro",
    equip: { sword: "fists", armor: null, morph: null, crown: null, charm: null },
    owned: {},             // { [itemId]: true }
    kills: {},             // { [enemyKind]: count }
    villagerNoWood: 0,     // villager kills since start without wooden sword (pity)
    flags: {},             // free-form booleans/numbers, keys namespaced "world.x" "story.x" "events.x" "combat.x"
    buried: {},            // { [graveId]: true }
    deaths: 0, startedAt: 0, kingWins: 0
  },
  choiceSnapshot: null,    // persisted: deep copy of run at the start of phase "choice" (EVENTS sets via save)
  player: { hp: 100, maxHp: 100, alive: true, invuln: 0, lastHurt: 0, lives: 0 },   // runtime (COMBAT)
  world:  { zone: "lobby", region: "main" },                                        // runtime (WORLD)
  ui:     { screen: "title", modal: false },   // screen: title|name|game|dialogue|menu|death|ending|cinematic
  rt:     { playing: false, paused: false, timeScale: 1, god: false, fast: 1, cinematic: false, idleLock: false }
}
```
Write rules: each slice has one writer - profile.secrets/endings/signReads/npcsTalked/run.phase/run.buried: STORY;
profile.name/onlineName/settings: UI; run.level/equip/owned/kills/villagerNoWood/deaths/kingWins, player.*: COMBAT;
world.*: WORLD; run.flags: anyone, only under its own namespace prefix; rt.cinematic: EVENTS; rt.playing: STORY;
rt.paused: UI; rt.timeScale/fast: ENGINE (debug); rt.god: COMBAT. Others read only.
Additions (resolve overlaps): `player.lives`: EVENTS (final boss) - COMBAT never touches it; `rt.cinematic`: EVENTS and
STORY (`reachEnding` only); `rt.idleLock`: EVENTS (true while the choice idle watcher is armed); `ui.*`: UI;
`profile.runs`: STORY (+1 in beginRun when newGame or a new cycle); `profile.playMs`: COMBAT(save) (accumulated while
`rt.playing && !rt.paused`). `save.load/newGame/restoreChoice` may overwrite any persisted slice (they run outside the
other writers' handlers). `run.phase` may be written directly (not via a transition) only by STORY's resume
normalisation (D4.10) and by `startCycle`/`newGame`.
Run-state rule (everyone): apply run-dependent state (gates, portals, eyes, sign, Bram, enemies, props) on BOTH
`run:reset` (clear) and `game:start` (rebuild from `state.run`), because CONTINUE emits only `game:start`.

## 5. ENGINE API (`ctx.engine`)
### 5.1 Core
```js
engine.renderer, engine.scene, engine.camera            // THREE objects (also ctx.renderer/scene/camera)
engine.addSystem(name, fn(dt, t), priority=50) -> remove()   // dt = scaled game dt (clamped <= 0.05), t = game time
engine.time            // game seconds (scaled by rt.timeScale * rt.fast), engine.realTime real seconds
engine.yieldFrame() -> Promise   // await to spread heavy builds over frames
engine.start()
engine.every(sec, fn) -> cancel()  engine.after(sec, fn) -> cancel()   // game-time timers (fast-forwardable)
```
System priorities: input 0, events 10, story 20, combat 30, player controller 40, world 50, camera 60, audio 70,
ui 80, postfx/render 100.
Each frame (paused: only ui + render run): systems in priority order, then render. `rt.fast` (debug) multiplies dt
for game timers (ENGINE caps each simulated sub-step at 0.05 s and runs up to 8 sub-steps per frame).
### 5.2 Physics (`engine.physics`, player-only collision; enemies use it for ground and simple wall avoidance)
```js
physics.addBox({ center:{x,y,z}, size:{x,y,z}, yaw=0, tag="", walkable=true, surface="stone" }) -> id
physics.addCylinder({ base:{x,y,z}, radius, height, tag="", surface="wood" }) -> id
physics.addRamp({ from:{x,y,z}, to:{x,y,z}, width, surface }) -> id     // walkable slope strip (stairs, ramps)
physics.move(id, center, yaw?)   physics.setEnabled(id, bool)   physics.remove(id)
physics.addTrigger({ center, size?, radius?, height=4, tag, onEnter(), onExit(), once=false }) -> id
physics.raycast(origin, dir, maxDist, mask?) -> hit|null
   // hit is a REUSED object { point:Vector3, normal:Vector3, dist, id, tag }: copy what you keep. mask: tag prefix.
physics.groundAt(x, z, yTop=1e4) -> { y, surface, id }   // REUSED object; highest walkable (terrain or collider top) <= yTop
physics.setKillY(region, y)        // default: main -60, others -40; below -> "player:fell"
physics.clearTag(prefix)           // remove every collider/trigger whose tag starts with prefix (zone rebuilds)
```
Player capsule: radius 0.4, height 1.8, step-up 0.45 m, max walkable slope 45 deg. Triggers test the player only.
### 5.3 Player controller (`engine.player`)
```js
player.object        // THREE.Group (the avatar root); player.position === object.position (live Vector3)
player.velocity      // live Vector3      player.yaw (get/set)      player.onGround (bool)
player.teleport({x,y,z}, yaw?)           // snaps, zeroes velocity, resets camera behind, sets onGround probe
player.setControl(bool)                  // movement + jump + dodge input on/off (look stays unless setLook(false))
player.setLook(bool)
player.speedMul = 1; player.jumpMul = 1; player.gravityMul = 1   // writable (status effects, final boss gravity flip)
player.knockback({x,y,z} impulse)        player.root(sec)   // rooted: no movement
player.forward(out:Vector3) -> out       player.isMoving() -> bool    player.isSprinting() -> bool
player.dodging (bool, i-frames active)   player.lastSafe (Vector3: last stable ground, for void catches)
player.avatar  // a Humanoid (5.9) built by ENGINE; COMBAT/EVENTS dress it:
player.setMorph("human"|"villager"|"scarecrow"|"hollow")
player.attach(slot:"hand"|"back"|"head"|"body", Object3D|null)     // COMBAT attaches item meshes
player.setArmorLook(null | { color, metalness, roughness, plates:bool })
player.play(action, opts?)               // forwards to avatar.play (5.9)
player.setNameTag(text)                  // small billboard above head
```
Movement: walk 5 m/s, sprint 8, accel 40 (ground) / 12 (air), jump v0 7.2, gravity 20, coyote 0.12 s, jump buffer
0.12 s, dodge roll 6 m over 0.45 s (i-frames 0.25 s, cooldown 0.9 s). Camera-relative movement.
### 5.4 Input (`engine.input`)
```js
input.move  // live { x, y } in [-1,1] (keys or joystick)          input.look // live { dx, dy } this frame
input.down(action) -> bool     input.pressed(action) -> bool (this frame)
   // actions: "attack","jump","dodge","interact","sprint","inventory","menu"
input.idleSeconds() -> number  // game seconds since last ANY input (keys, mouse move/button, touch, wheel)
input.invert(sec)              // final boss: invert move axes for sec
input.mode                     // "keys" | "touch" (last used)
input.setEnabled(bool)         // all gameplay input (UI menus still work)
```
Desktop mapping per D3. No pointer lock: a left press that moves < 6 px and lasts < 250 ms = attack; drag with any
button = look. Pointer lock (setting, default on): click the canvas to lock; Esc unlocks and opens the menu. Right
mouse button tap or Q = dodge. Wheel = camera distance. Typing in an INPUT element never triggers game actions.
### 5.5 Touch (`engine.touch`, ENGINE owns visuals in `#touch`)
Floating joystick left half, look-drag right half, buttons ATTACK (hold = heavy), JUMP, DODGE, MENU, plus
`touch.setInteract(label|null)` (contextual button; UI calls it when the interact prompt changes).
`touch.setVisible(bool)` (hidden on title/dialogue/endings). Shown only on coarse-pointer devices or after a touch.
### 5.6 Look: atmosphere, postfx, terrain, vegetation, water, materials
```js
engine.setAtmosphere(presetId, { dur=2 })      // base preset (WORLD calls on zone enter)
engine.pushAtmosphere(tag, presetId, { dur }) / engine.popAtmosphere(tag, { dur })   // overrides (EVENTS)
   // presets: "title","day","afternoon","golden","kingDark","desertFog","desertNight","forest","forestNight",
   //   "houseInterior","collapse","throne","throneDark","hollowDesert","final"
   // when state.run.cycle >= 1 ENGINE automatically blends a corrupted grade (redder, darker sky) on top.
   // a preset sets: sun dir/colour/intensity, hemi colours, sky shader params, fog colour/density, exposure, grade.
engine.postfx.flash({ color="#fff", peak=1, dur=1.5 })  // honours reduceFlashing (soft grey 1.2 s fade, peak 0.35)
engine.postfx.set({ vignette, grain, aberration, saturation, contrast, tint:[r,g,b] })   // partial; EVENTS use
engine.postfx.reset()
engine.camera3p.shake(amplitude, dur)    // see 5.8
engine.terrain.heightAt(x, z) -> y       // -1e9 where there is no terrain (pockets built by WORLD/EVENTS)
engine.terrain.regionAt(x, z) -> "main"|"desert"|"forest"|"hollowDesert"|"none"
engine.terrain.surfaceAt(x, z) -> "grass"|"dirt"|"rock"|"sand"|"forest"
engine.vegetation.exclude(x, z, radius)  engine.vegetation.excludeRect(x0, z0, x1, z1)   // before scatter()
engine.vegetation.scatter()              // main.js calls once
engine.vegetation.setRegionVisible(region, bool)
engine.water.setVisible(bool)
engine.materials.get(name, opts?) -> MeshStandardMaterial (shared; opts {color, repeat:[u,v]} returns a cached variant)
   // names: grass dirt rock sand bark leaves woodPlank woodDark thatch roofTile stoneBrick cobble plaster
   //   clothRed clothBlue clothWhite clothGreen leather iron gold cheese furRat furCat skin hair obsidian ink
   //   glassBlack portal bone cactus straw paper cardboard rust
engine.materials.texture(name) -> CanvasTexture (albedo) for custom materials
engine.quality.level   // 0 low, 1 medium, 2 high, 3 ultra;  engine.quality.onChange(fn(level)) -> off()
engine.showRegion(region)   // hides other regions' terrain/vegetation/water (WORLD calls on zone change)
```
Terrain spec (ENGINE implements, WORLD builds on it):
- Region `main` x -220..220, z -120..560. Rolling hills amplitude 6 m (noise), FLAT PADS (height lerped to the pad
  height inside the radius, smooth 12 m falloff): lobby (0,0) r 36 y 0; ratField (0,100) 40 x 30 rect y 0; ratKing ring
  (0,148) r 18 y -1.5 (sunken); village (0,240) r 50 y 0; barn (-80,236) r 18 y 0; guardPost (0,300) r 22 y 0; castle
  rect x -50..50 z 395..515 y 18; graves (30,-6) r 10 y 0. Castle road: z 335..400 rises linearly 0 -> 18 (8 m wide).
- River carved along X between z 54 and 66 (bed y -2.5, water surface y -0.6), from x -220 to 220. Waterfall cliff:
  terrain at x < -66 for z 40..80 rises to y 14 (a cliff face at x = -70), cave entrance (WORLD geometry) at (-72,1,60).
- Void: x < -40 for z -40..30 falls to -400 (cliff with rock). Kill Y for main: -60.
- Roads (dirt mask, 4 m wide): (0,10)->(0,175)->(0,332)->(0,400) and the village ring r 34.
- Region `desert` centre (0,-2000) 800 x 800, dunes amplitude 4 m, y 0 near (0,-1700). Region `forest` x -2300..-1700,
  z -250..250, gentle 1.5 m, trail mask from (-1750,0) to (-2150,0). Region `hollowDesert` centre (0,-4150) 600 x 600,
  flat within r 70 of (0,-4150) and around (0,-3990). Everything else: no terrain (`-1e9`).
- Vegetation: grass/flowers/bushes/oak/birch on main (not on roads, pads' cores, river, void); pines dense in forest
  (not on the trail, 3 m each side, nor within 25 m of (-2160,0)); cacti + dry shrubs in desert/hollowDesert.
### 5.7 Quality scaling
Auto: rolling average frame time over 3 s; > 22 ms -> level down (min 0); < 13 ms for 10 s -> up (max 2 on auto;
3 only by setting). Level drives: pixel ratio (0: 0.75 cap 1, 1: 1, 2: min(dpr,1.5), 3: min(dpr,2)), shadow map
(0: 512/no soft, 1: 1024, 2: 2048, 3: 2048), grass density (0: 15%, 1: 40%, 2: 70%, 3: 100%), tree LOD distances,
bloom (off at 0), particles budgets (modules read `engine.quality.level`).
### 5.8 Camera (`engine.camera3p`)
Third-person orbit following the player, collision against physics (raycast), distance 2.5-7 (wheel), pitch -60..+70 deg.
```js
camera3p.shake(amp, dur)   camera3p.setFov(deg, dur=0.5)   camera3p.setDistance(m, dur=0.5)
camera3p.take(owner) -> ctl   // scripted control; returns a controller, follow mode pauses
   ctl.set(pos, lookAt)                          // instant
   ctl.move(pos, lookAt, dur, ease="inOut") -> Promise
   ctl.follow(object3D, offset:{x,y,z}, lookOffset?)   // track a target (bosses, cutscenes)
   ctl.firstPerson(bool)                         // camera at player head, avatar hidden (house, jumpscares)
   ctl.roll(rad, dur)                            // final boss / throne tilt
   ctl.release(dur=0.6)                          // blend back to follow
camera3p.owner -> string|null
camera3p.lockTarget(object3D|null)               // soft lock-on (COMBAT boss fights may use)
```
### 5.9 Humanoid builder (`src/engine/humanoid.js`, used by ENGINE, WORLD, COMBAT, EVENTS)
```js
import { createHumanoid } from "../engine/humanoid.js";
createHumanoid(THREE, engine, {
  height=1.8, build="normal"|"slim"|"heavy"|"child", skin="#e0b090", shirt="#6b7d5a", pants="#4a3c2c",
  hair="#3a2a1a"|null, beard=false, hat=null|"straw"|"hood"|"helmet"|"royalHelmet"|"crown"|"bandana",
  cape=null|color, dress=null|color, eyes="normal"|"red"|"glow"|"none"
}) -> h
h.root (Group, feet at origin, faces +Z)   h.hand (right-hand attach Object3D)   h.head (Object3D)
h.update(dt, speed, airborne)              // procedural walk/run/idle blend; call each frame while visible
h.play(action, { speed=1, loop=false }) -> Promise (resolves at the action's end)
   // actions: idle walk run jump fall punch slash heavy block hurt die sit kneel dig wave talk cry scared take
h.setEyes(mode)   h.setColors({ skin, shirt, pants, hair, cape, dress })   h.setVisible(bool)   h.dispose()
```
Low-poly-but-smooth (lathe/capsule parts, ~1.5k tris), shared geometries; one draw call per material.
### 5.10 Debug (ENGINE adds to `window.__tnrpg`): `fastTime(mult)` sets rt.fast (1..120), `fps()`, `teleportTo(x,y,z)`,
`quality(level)`, `frameStats()` -> { fps, ms, calls, tris }.

## 6. WORLD API (`ctx.world`)
WORLD builds every zone's static geometry, props, NPC bodies, colliders, portals, gates, interactable registry,
waypoints and spawn points. Zone/coordinate truth: D6. Build all zones at init (hidden ones `visible=false`).
```js
world.zones            // { [zoneId]: Zone }
   // Zone = { id, name, region, atmo:presetId, music:trackId, bounds:{x0,z0,x1,z1,y0,y1}, spawn:{pos:{x,y,z}, yaw},
   //          root:Group }
   // ids: lobby graves voidEdge path1 bridge waterfall rookieShack ratField ratKing gate2 village barn guardPost gate3
   //      castle throne kingDark desert forest forestHouse hollowDesert finalArena   (collapse is EVENTS' own; see 10.4)
world.zoneAt(x, y, z) -> zoneId|null   // smallest containing bounds; null -> the zone tracker keeps the previous zone
world.registerZone(zone)               // EVENTS adds `collapse` (same Zone shape); WORLD then tracks/emits it like its own
   // On game:start WORLD emits zone:enter { id: spawn zone, prev:null } and calls audio.zoneMusic(music, { delay:4 }).
   // WORLD wraps the player in the desert (D6.2 looping) and owns the forest/hollowDesert boundary colliders.
world.current -> zoneId                // also state.world.zone
world.goto(zoneId, { pos?, yaw?, fade=true }) -> Promise   // fade out (ui.fade), teleport, showRegion, atmo, fade in
world.point(name) -> {x,y,z}   // named points: spawn, bridgeFar, ratField, ratKingGate, gate2, villageSquare,
   //  exchange, guardPost, gate3, courtyard, kingPortal, throneDoor, throneSeat, lobbyBack, graveShovel,
   //  grave0..grave5, voidLeap, well, towerLetter, portrait, basement, underBridge, waterfallCave, kitten0..kitten2,
   //  barnDoor, rookieShack, cactusFlower, totem, desertArrive, forestArrive, forestHouseDoorOut (inside, cycle 0),
   //  forestHouseDoorFront (outside (-2153,0,0), cycle 1 "Open the door"), desertExitNg (0,0,-1850), forestHouseInside,
   //  hollowArrive, girl, hollowFar, hollowArena, homePortal, finalArrive, finalBoss, kingArrive, kingSpot,
   //  forestBackPortal, desertBackPortal
world.spawns(kind) -> [{ pos:{x,y,z}, yaw, radius }]  // kind: rat (12 field points, radius = scatter), ratKing,
   //  villager (8, index = house), fydor, myles, royalGuard (6), king, cat, rookie, shadowRat (8 around throne)
world.waypoint(id) -> {x,y,z}|null       // same names as point(); STORY uses for objectives
// interactables (single registry for the whole game; WORLD runs focus + E handling)
world.addInteractable({ id, pos:{x,y,z} (live object ok), radius=2.5, label, enabled:()=>bool,
                        onUse:()=>void, priority=0 }) -> remove()
world.setInteractLabel(id, label)
// portals (WORLD builds the visuals: ring + swirl + hum + trigger)
world.portal(id) -> { setActive(bool), setPos({x,y,z}), active, pos, onEnter: fn|null }
   // ids & default destinations (used when onEnter is null):
   //  kingPortal (castle -> kingDark, requires combat.canEnter("kingPortal")), kingReturn (kingDark -> castle hall),
   //  lobbyBack (lobby -> desert), desertBack (desert -> lobby), desertExit (desert -> forest; inactive, EVENTS places),
   //  forestBack (forest -> desert), homePortal (hollowDesert -> lobby)
   //  If onEnter is set (EVENTS override), WORLD calls it INSTEAD of the default and emits portal:enter.
// gates
world.gate(id) -> { open(animated=true), close(), isOpen }   // "area2", "area3"; WORLD opens on `unlock`, and checks
   //  combat.canEnter(id) at the gate trigger (denied -> bus portal:denied + ui.toast)
// NPC bodies
world.npc(id) -> { id, root, pos (live Vector3), human:Humanoid, lookAt({x,y,z}|null), setVisible(bool),
                   play(action) }   // ids: bram nessa tobin ilsa pell odo wren fydorIdle mylesIdle sign
   // fydorIdle/mylesIdle = the guards standing at the post before their fight (COMBAT hides them while fighting:
   //  world.npc("fydorIdle").setVisible(false) and spawns its own combat bodies)
world.graves -> [{ id:"grave0".."grave5", name, pos, setBuried(bool) }]   // 0 ratKing 1 villagers 2 guards
   //  3 royalGuards 4 king 5 elsie (labels: "The Rat King", "The Villagers", "Fydor & Myles", "The Royal Guards",
   //  "The King", "Elsie")
world.prop(id) -> Object3D|null   // named props EVENTS/STORY may animate: lobbyRockingChair, throne, throneCrack,
   //  barnBell, wellBucket, lobbyRug, trapdoor, kitten0..2 (meshes), cactusFlower, totem, shovel, voidFence
world.resetRun()   // on run:reset: close gates, deactivate post-King portals, show Bram, reset props
```
- Zone change: WORLD tests the player against zone bounds 4x per second; on change emits `zone:exit`/`zone:enter`,
  calls `engine.setAtmosphere(zone.atmo)`, `engine.showRegion(zone.region)`, `audio.zoneMusic(zone.music)`.
- WORLD reads `state.run.cycle` for red-eyed NPCs (`human.setEyes("red")`) and the "?" on the sign (on `run:reset`).
- Interact focus: nearest enabled interactable within radius whose `enabled()` is true and is in front of the player
  (dot > 0.2) wins; emits `interact:focus`; UI shows the prompt; on `input:interact` WORLD calls `onUse` and emits
  `interact:use`. Disabled while `state.ui.modal` or `rt.cinematic`.
- WORLD registers vegetation exclusions for all its footprints during init.
- Kitten meshes, the well bucket, letter, portrait, etc. are WORLD props; STORY registers the interactables for them.

## 7. COMBAT API (`ctx.combat`)
Owns stats, levels, gear, drops, enemies + their models/AI (rats, Rat King, villagers, Fydor, Myles, royal guards,
King, shadow guards, Cat Boss, Rookie Boss, golden rat), player HP/damage/death/respawn, NG+ modifiers, save.
```js
combat.level() -> number                 combat.mult() -> number      // current MULT (D4.2)
combat.addLevels(base, source, { flat=false }) -> gained   // applies MULT unless flat; emits level:gain, milestones
combat.setLevel(n)                       // debug; also fires milestone/unlock checks
combat.rec(kind) -> number               // recommended level incl. cycle modifier ("rookie" -> max(1, level))
combat.out(rec) -> number   combat.inc(rec) -> number      // D4.5 multipliers (OUT, IN)
combat.damagePlayer(raw, { rec, source, dir? ({x,y,z}), knock=0 }) -> applied   // applies IN, DR, i-frames, god
combat.healPlayer(n)   combat.killPlayer(source)   combat.setInvuln(sec)
combat.addHittable(h) -> remove()        // for EVENTS bosses/props:
   // h = { id, kind, pos:Vector3 (live), radius, height, rec, team:"enemy", isAlive:()=>bool,
   //       onHit({ dmg, heavy, crit, dir:Vector3, point:Vector3 }) }   (dmg already includes OUT and weapon)
combat.spawn(kind, pos, opts?) -> Entity    // opts { yaw, zone, noReward, rec, hpMul }
   // Entity = { id, kind, root, pos (live), hp, maxHp, rec, alive, boss, zone, despawn() }
combat.enemies -> Entity[] (live list, do not mutate)
combat.killAll(filter?)    // debug: filter kind or "boss"; grants rewards as real kills
combat.give(itemId, { silent=false, equip=true }) -> bool(first)   combat.has(itemId) -> bool
combat.remove(itemId) -> bool   // burying: removes from owned; if equipped, re-equips the best owned item of that slot
combat.startFight(id) -> bool   // "ratKing"|"guards"|"cat"|"rookie" (D4.6 "How fights start"); false if already
                                //  running / locked (cat needs state.profile.secrets.kittens)
// key items (shovel, girls_ribbon, fydors_locket, mylesletter) are given by STORY/EVENTS via give(id, {equip:false})
combat.equip(itemId)   combat.unequip(slot)   combat.inventory() -> [{ id, name, slot, owned, equipped, mult, desc }]
combat.items -> catalog { [itemId]: { id, name, slot, mult, dmg, cd, reach, hp, dr, desc, bad:bool } }
combat.shop() -> [{ id, name, need, state:"claimed"|"claimable"|"locked" }]   combat.claim(id) -> { ok, reason? }
combat.need(id) -> number      // requirement incl. cycle: "area2","area3","kingPortal" + shop ids
combat.canEnter(id) -> { ok, need, have }
combat.setDeathHandler(fn | null)   // fn({ source }) -> true if it handled respawn (EVENTS); else default D4.8
combat.respawn()                   // default: ui.deathScreen, then world.goto("lobby", spawn) + full HP
combat.fightActive() -> bool       // any boss fight running (COMBAT or EVENTS-reported via boss:start/end)
combat.resetRun(cycle)             // on run:reset
combat.setGod(bool)
combat.weapon() -> itemDef         // equipped sword-slot item (or fists)
```
- Player attacks: COMBAT listens to `input:attack`; on "down" starts; on "up" with held >= 0.6 s -> heavy, else light.
  Hit resolution after the swing's hit frame (0.12 s light, 0.2 s heavy) against `combat.enemies` + hittables in a
  cone (reach, 100 deg; punch 70 deg). King's Staff heavy = bolt projectile (pooled). Emits `player:attack`, `enemy:hit`.
- Boss fights COMBAT owns: ratKing, fydor+myles (one fight, `id:"guards"`), king, cat, rookie. Royal guards are normal
  enemies with a small health bar; `boss:start` for the bosses (UI shows the boss bar).
- King fight: on `portal:enter` kingPortal WORLD moves you to kingDark; COMBAT spawns the King when zone kingDark is
  entered, sets `engine.setAtmosphere("kingDark")` lights, and on win: `addLevels(100000, "king", { flat:true })`,
  give kings_staff (first), `run.kingWins++`, activates `world.portal("kingReturn")`.
  `kingFlawless`: COMBAT sets `run.flags["combat.kingHitless"]=true` on a hitless win; STORY awards the secret.
- Auto milestones (emit `milestone` and give): 5 smelly_armor, 125 cheese_armor, 1e6 kings_crown (cycle 1: bad_ ids).
  Unlock events when thresholds pass: area2, area3, kingPortal; shop items become claimable (UI toast).
- Drops: D4.2 / D4.7. First-kill swords via `give`. Wooden sword: 20% roll per villager kill while not owned;
  `villagerNoWood` pity at 10.
- Boss music: COMBAT calls `audio.pushMusic("boss", "boss"|"bossRookie")` on its boss:start (not the King: kingDark
  zone music) and `popMusic("boss")` on boss:end. `unlock` ids are the BASE ids in every cycle (the shop/claim gives the
  `bad_` item in cycle 1). `combat.shop()` also lists `area3` ("Castle Pass", auto-claimed, never "claimable").
- Enemy spawning: on `run:reset` COMBAT despawns everything; on `game:start` it populates from `world.spawns(kind)`
  (never both, so no double spawn); only enemies in or near
  the player's region update AI (others frozen + hidden). Enemy LOD: beyond 60 m simple animation, beyond 120 m hidden.
- NG+: `state.run.cycle >= 1` -> rec x2, HP x1.5, dmg x1.4, red eyes, extra abilities, bad_ items (D4.7).
- Death: hp <= 0 -> `player:died`; if a death handler returns true nothing else; else default respawn (D4.8).
  `player:fell` default (no handler): fade 0.8 s, teleport to `engine.player.lastSafe`, -10% HP. EVENTS may handle
  falls by installing a death handler (fall calls it with source "fall").
- COMBAT owns `src/combat/save.js` (`ctx.save`, 8.5).

## 8. Shared ids and data
### 8.1 Enemy kinds
`rat goldenRat ratKing villager fydor myles royalGuard king shadowGuard cat rookie` (COMBAT),
`shadowRat hollow1 hollow2 hollow3 creature` (EVENTS; reported through bus with these kinds).
### 8.2 Items (COMBAT catalog; D4.2/D4.7 values)
sword: `fists smelly_sword cheese_sword wooden_sword iron_sword gold_sword kings_staff cat_claws`
armor: `smelly_armor cheese_armor iron_armor golden_armor`; morph: `villager_morph`; crown: `kings_crown`;
charm: `rookie_badge toms_bell`; key: `girls_ribbon fydors_locket mylesletter shovel`.
Cycle-1 horrible variants: `bad_` + id for every sword/armor/morph/crown (e.g. `bad_kings_staff` "Bent Twig Staff",
`bad_villager_morph` "Scarecrow Morph"). Display names D4.7. Grave items accept either variant:
grave0 cheese_sword, grave1 wooden_sword, grave2 iron_sword, grave3 gold_sword, grave4 kings_staff, grave5 girls_ribbon.
### 8.3 Milestone ids
`smelly_armor`(5) `area2`(50 / c1 100) `cheese_armor`(125) `villager_morph`(200) `iron_armor`(1000)
`area3`(50000 / c1 100000) `kingPortal`(100000 / c1 200000) `golden_armor`(250000) `kings_crown`(1000000).
### 8.4 Story phases (`state.run.phase`, STORY is the only writer: `story.setPhase(p)`)
`intro area1 area2 area3 postKing desert forest forestHouse chase collapse throne` (cycle 0) then
`ng` (cycle 1 until its King win) `ngPostKing hollowDesert girl hollow2 choice finalBoss ended`.
Allowed transitions are FORWARD in that order (skipping ahead is allowed, for debug jumps and level skips), plus:
any -> `ended`; `choice` -> `finalBoss` -> `ended`|`choice`(via remember); `ended` -> `choice` (remember),
`finalBoss` (Winner rematch) or `intro` (start over); `throne` -> `ng` only through `startCycle(1)`. STORY ignores
illegal transitions (warn). Resume normalisation on CONTINUE: D4.10.
### 8.5 Save (`ctx.save`, file `src/combat/save.js`, key `tnrpg.save.v1`, backup `tnrpg.save.bak`)
```js
save.load() -> bool            // into ctx.state (profile, settings, run, choiceSnapshot); called in init
save.write()                   // debounced 500 ms; also on pagehide/visibilitychange hidden
save.writeNow()
save.has() -> bool             // a run in progress exists (CONTINUE)
save.newGame(cycle=0)          // reset run to defaults with run.cycle = cycle, keep profile + settings, write
save.snapshotChoice()          // state.choiceSnapshot = deep copy of state.run; write
save.restoreChoice() -> bool   // state.run = deep copy of choiceSnapshot
save.wipe()                    // debug: everything
```
Stored JSON: `{ v:1, t:ms, profile, settings, run, choiceSnapshot }`. Unknown `v` or parse error -> copy raw to
`tnrpg.save.bak`, use defaults. Writes are try/catch (private mode). Autosave every 20 s while playing and on
`level:gain` (debounced), `item:get`, `secret:found`, `zone:enter`, `story:phase`, `ending`.

## 9. STORY API (`ctx.story`)
Owns dialogue content (all NPC lines incl. Fydor/Myles legends, rumors, cycle-1 variants), the objective director,
the secrets registry, phases and the ending state machine, and the interactables for NPCs + story props.
```js
story.beginRun()                     // on ui:play: place player at world spawn, rt.playing=true, emit game:start
story.phase -> string   story.setPhase(p)
story.talk(npcId) -> Promise         // runs dialogue via ui.dialogue; marks npcsTalked
story.say(speaker, text, { dur }) -> Promise   // non-blocking subtitle line (EVENTS use for cutscene lines)
story.objective(id|null)             // force an objective (EVENTS use during sequences); null = director decides
story.secret(id) -> bool(new)        // registers, emits secret:found, saves, (UI submits leaderboard)
story.secrets -> [{ id, name, hint, found:bool }]  story.secretCount() -> { count, total:26 }
story.reachEnding(id) -> Promise     // id: monster world warrior idiot winners sigma (see 9.2)
story.startCycle(n)                  // save.newGame(n), phase n ? "ng" : "intro", emit run:reset { cycle:n },
                                     //  then beginRun() (emits game:start { newGame:true, cycle:n })
story.newGame()                      // = startCycle(0) (profile kept). ui:play { newGame:true } also calls this.
// Talk ids = world.npc ids except the guards: talk "fydor"/"myles" use bodies "fydorIdle"/"mylesIdle";
//  npcsTalked keys for `allNpcs`: bram nessa tobin ilsa pell odo wren fydor.
story.remember()                     // "Remember the choice": save.restoreChoice(), setPhase("choice"),
                                     //   events.enterChoice()
```
### 9.1 Objectives
Director table D5.5. STORY calls `ui.setObjective(text, target)` with target from `world.waypoint()` (or a live
entity pos), re-evaluated on relevant events (level:gain, zone:enter, enemy:killed, item:get, story:phase) and 2x/s
for nearest-target updates. Emits `objective:set`.
### 9.2 Ending state machine
- Endings reachable only in phase `choice` (and `finalBoss` for idiot/winners/sigma).
- `reachEnding(id)`: set `rt.cinematic`, `story.secret("end_" + id)`, `profile.endings[id]++`, phase `ended`, emit
  `ending`, `await events.playEnding(id)` (the cinematic), then `const b = await ui.ending(id, { buttons })`:
  buttons `remember`, `startOver`, `title` (+ `winner` first for winners). Handle: remember -> `story.remember()`;
  startOver -> `story.newGame()`; title -> `ui.showTitle()`; winner -> `events.startFinal({ rematch:true })`.
- Triggers: take sword (EVENTS calls `story.reachEnding("monster")`), void leap (STORY's interactable at
  `world.point("voidLeap")`, enabled only in `choice`; confirm via `ui.confirm("Stay?", ["Stay","Let go"])`, then
  `reachEnding("world")`), graves (STORY interactables on `world.graves`; shovel first; `run.buried[graveId]`;
  all six -> `reachEnding("warrior")`), final boss outcomes (EVENTS calls `reachEnding("idiot"|"winners"|"sigma")`).
### 9.3 Names (UI implements in `src/ui/names.js`; STORY only reads `state.profile.name`)
```js
export function validateName(raw) -> { ok:true, name, special:bool } | { ok:false, reason, hint }
   // name = cleanName(raw) (trim, collapse spaces). lower = name.toLowerCase()
   // if lower === "idiot" || lower === "mygranniesamotherfucker": ok, special = (lower !== "idiot")
   // length 3..24 else "short"/"long"; /^[A-Za-z0-9 _-]+$/ else "chars"; >= 2 letters else "letters";
   // isRude(name) -> "rude" (hint: 'That word is too bad. The worst you can say is "idiot".')
export function onlineNameFor(name) -> string
   // special -> "MyGrannie"; else if checkName(name).ok -> name; else first 16 chars trimmed if checkName ok,
   // else "MyGrannie". UI claims it with claimName(); on "taken" retry with 2 random digits appended (<= 16 chars),
   // 3 tries; on "rude"/"invalid" use "MyGrannie"; the result is stored in profile.onlineName.
```
### 9.4 Secrets registry (ids exact; names/hints D10)
`catBoss rookieBoss kittens underBridge waterfall goldenRat basement normalSign allNpcs fydorLocket mylesLetter
portrait throneSeat kingFlawless crown cactusFlower totem voidWhisper ngplus girlRibbon end_monster end_world
end_warrior end_idiot end_winners end_sigma` (26). STORY detects most from bus events/triggers itself (kills, items,
zones, interactables, standing timers via `physics.addTrigger`). EVENTS calls `story.secret("ngplus")` and
`story.secret("girlRibbon")`.

## 10. EVENTS API (`ctx.events`)
Owns every scripted sequence and the monsters: post-King desert timer + exit portal, forest timers, house wake-up,
forest-night jumpscare, chase legs, the `collapse` zone (its own geometry/colliders under tag `ev.collapse`), the
throne fight (Hollow I) + scurry + NG reset, cycle-1 desert/forest shortcut, the girl (model + song trigger +
jumpscare + ribbon), Hollow II, the liquid sword, the `choice` state + idle watcher, all ending cinematics, the final
giant boss (Hollow III) + rematch.
```js
events.trigger(id, opts?) -> Promise    // start a sequence by id (debug + internal); ids:
   //  postKing desert forest forestHouse forestNight chase collapse throne ngReset ngShortcut hollowDesert girl
   //  hollow2 liquidSword choice final rematch
   //  end_monster end_world end_warrior end_idiot end_winners end_sigma   (cinematics only)
events.active -> id|null               events.stop()   // abort the current sequence (debug)
events.playEnding(id) -> Promise       // cinematic for ending id (STORY awaits it)
events.enterChoice()                   // place player at the black sword (hollowDesert), sword visible, arm idle watch
events.startFinal({ rematch=false }) -> Promise
events.skipTimers()                    // finishes every running wait/timer of the current sequence immediately
events.resetRun()                      // on run:reset
```
### 10.1 Sequencer helper (EVENTS-internal, recommended)
`seq.wait(sec)` (game time, skippable), `seq.until(pred)`, `seq.walkSeconds(sec)` (counts only while
`engine.player.isMoving()`), `seq.fade(to, dur, color)`, `seq.say(...)`. Every sequence: emit `seq:start`, set
`rt.cinematic` only during non-interactive cuts (player has control during chases/fights), restore camera/atmosphere/
music/death handler in a `finally`, emit `seq:end`.
### 10.2 Hooks EVENTS listens to (start conditions)
- `enemy:killed` kind king, `run.kingWins` was 0, cycle 0 -> `postKing` (portal lobbyBack active, Bram hidden,
  `story.setPhase("postKing")`). Cycle 1 first King win -> `ngShortcut` (phase `ngPostKing`; desertExit already
  active at `world.point("desertExitNg")`, forest-house door interactable "Open the door" at
  `world.point("forestHouseDoorFront")`). Hollow I/II/III `rec` and HP: D8.6 / D9.3 / D9.5 (rec frozen at fight start).
- Throne fight death handler: respawn at `throneDoor`, boss resets to its current phase start.
- `zone:enter desert` in phase postKing -> `desert` (walkSeconds(60) -> place desertExit 70 m ahead).
- `zone:enter forest` (postKing/desert phase) -> `forest` (60 s -> `audio.pushMusic("ev","forestCreep")`; 60 s more
  -> fade, `world.goto("forestHouse", inside)` -> `forestHouse`).
- door used (EVENTS' interactable at `world.point("forestHouseDoorOut")`) -> `forestNight` -> jumpscare -> `chase`.
- chase: overrides `world.portal("forestBack").onEnter` / `desertBack.onEnter` to route to the next leg, and
  desertBack -> collapse start. `collapse` end trigger -> `world.goto("throne")` -> `throne`.
- throne win -> scurry -> `ngReset`: `story.secret("ngplus")`, `await ui.showRedTitle(4)` (see 12), then
  `story.startCycle(1)`.
- cycle 1 forest-house door -> `hollowDesert` -> girl at 3 m (`Say hi`) -> `girl` -> `hollow2` -> `liquidSword` ->
  `save.snapshotChoice()` -> `choice`.
- `choice`: interactable "Take the sword" (confirm) -> `story.reachEnding("monster")`. Idle watch:
  `engine.input.idleSeconds() >= 600` while phase choice and not in a menu -> `final`.
### 10.3 Monsters
EVENTS builds the Hollow forms (creature/hollow1/hollow2/hollow3), shadow rats, the girl, the liquid sword (shader).
They are damaged through `combat.addHittable` and hurt the player through `combat.damagePlayer(raw, { rec })`.
Boss bars via bus `boss:start/hp/end` (UI listens). Final boss lives: `state.player.lives` (3, or 1 on rematch), shown
by UI when `lives > 0`. Death handling with `combat.setDeathHandler`.
Final outcomes (exact): first fight loss -> `reachEnding("idiot")`; first fight win -> `reachEnding("winners")`; rematch win with 0 deaths ->
`reachEnding("sigma")`; rematch death -> `reachEnding("winners")` (no new secret since already found).
Flashbang = `engine.postfx.flash(...)` + `audio.sfx("tinnitus")`; jumpscare = `ui.jumpscare(kind)` +
`audio.sfx("jumpscare")`; invert = `engine.input.invert(4)`; camera roll via `camera3p.take()`.
### 10.4 Collapse zone
EVENTS owns zone `collapse` (geometry under a Group added to scene, colliders tagged `ev.collapse`), region "none",
centre (3000,0,0) -> (3000,18,600), 6 sections + checkpoints (D8.5). It calls `engine.setAtmosphere("collapse")`,
`engine.showRegion("none")`, `audio.music("chase")` itself. Built lazily on first use (spread with yieldFrame).

## 11. AUDIO API (`ctx.audio`)
One AudioContext (created on first gesture: `audio.unlock()` - UI calls it on the first pointerdown/keydown).
Master -> limiter (DynamicsCompressor, threshold -6 dB) -> destination. Buses: music, sfx, ui, voice.
```js
audio.unlock()
audio.music(trackId|null, { fade=2 })            // base track (null = silence)
audio.zoneMusic(trackId, { delay=0 })             // WORLD: base track for the zone; cycle>=1 auto-uses `${id}_ng`
                                                  //   when that variant exists
audio.pushMusic(tag, trackId, { fade=1.5 }) / audio.popMusic(tag, { fade=2 })   // overrides (bosses, events)
audio.stinger(id)                                 // one-shot musical sting, ducks music 60%
audio.sfx(id, { pos?:{x,y,z}, vol=1, rate=1, detune=0 }) -> handle|null   // pos = 3D (HRTF off, equalpower)
audio.loop(id, { pos?, vol=1 }) -> { stop(fade=0.3), setVol(v), setPos(p) }   // ambient/hums
audio.song("girl", { pos }) -> { stop(fade), setPos(p) }   // emits audio:lyric
audio.voice(text, { kind:"hollow"|"rookie"|"blip", pitch }) // short synthesized vocal gibberish under subtitles
audio.setVolumes({ master, music, sfx })          // UI calls on settings change (also reads state.settings at init)
audio.duck(amount, dur)    audio.muffle(on, dur)   // muffle = lowpass for flashbang/underwater
audio.heartbeat(intensity 0..1)                    // low-HP / chase layer
audio.tracks -> string[]   audio.sfxIds -> string[]   audio.now -> AudioContext time
```
Listener follows `ctx.camera` each frame (priority 70). Scheduler: 100 ms lookahead, 25 ms tick. Max 24 concurrent
sfx voices (oldest quietest stolen). Footsteps are driven by AUDIO listening to `player:step`.
Track ids: `title title_ng area1 area1_ng area2 area2_ng area3 area3_ng boss boss_ng bossRookie king king_ng desert
forestQuiet forestCreep house chase throne girl hollow2 final redTitle`.
Sting ids: `secret levelUp itemGet unlock bossWin death ngReveal end_monster end_world end_warrior end_idiot end_winners
end_sigma`.
SFX ids (callers use exactly these; AUDIO may alias): `step_grass step_dirt step_wood step_stone step_sand step_forest
jump land land_hard whoosh_punch hit_punch whoosh_sword hit_flesh hit_metal hit_wood block heavy_charge heavy_release
dodge hurt player_death item_equip ui_hover ui_click ui_toast ui_error type blip door_open door_close creak gate_open
portal_enter portal_hum bell well_chain dig rain wind birds river waterfall crickets fire chickens dog tree_fall
ground_crack rock_tumble collapse rat_squeak rat_bite rat_death ratking_roar ratking_squeak cheese_roll villager_shout
grunt halberd shield_bash armor_clank king_laugh king_whisper staff_charge staff_bolt teleport cat_hiss meow purr
rookie_oof hollow_breath hollow_shriek hollow_step melt solidify jumpscare tinnitus clock_tick heartbeat sob sand_hiss
crow woodpecker rumble glitch chair_creak torch_whoosh fissure cheese_bomb pounce kitten_purr`.
Title music: UI calls `audio.unlock()` then `audio.music("title")` on the first gesture; `ui.showTitle()` does the same.

## 12. UI API (`ctx.ui`)
DOM under `#ui` (ENGINE's index.html provides `<div id="ui">`). UI owns: title (2D particle canvas), name entry,
HUD, objective + waypoint marker (projects 3D target with `ctx.camera`), interact prompt, dialogue box, inventory,
shop, settings, pause, toasts, boss bar, lives, damage numbers, death screen, ending cards, jumpscare overlay
(procedural canvas faces), confirm dialogs, fades, letterbox, subtitles, the secrets leaderboard corner.
```js
ui.showTitle()               // back to the title (music "title"); hides HUD
ui.showRedTitle(sec) -> Promise   // the NG+ red title flash (red particles, music "redTitle"), then resolves
ui.fade(to:0|1, dur=0.8, color="#000") -> Promise    // full-screen fade layer above the canvas
ui.letterbox(on, dur=0.6)
ui.hud(visible)
ui.toast(text, { kind:"info"|"good"|"warn"|"secret", dur=3 })
ui.banner(title, sub="", dur=3)           // big centre text ("AREA 2 UNLOCKED")
ui.setObjective(text|null, target:{x,y,z}|null)   // target may be a live Vector3; marker updates each frame
ui.prompt(label|null)                     // interact prompt (also calls engine.touch.setInteract)
ui.dialogue({ speaker, lines:[string], choices?:[string], voice? }) -> Promise<choiceIndex|-1>
   // typewriter, tap/click/E/space advances; sets state.ui.modal; pauses nothing else
ui.subtitle(text, dur=3)                  // bottom-centre line (also shows audio:lyric)
ui.confirm(text, [labelA, labelB]) -> Promise<0|1>
ui.openMenu("inventory"|"shop"|"settings"|"pause")   ui.closeMenu()
ui.bossBar   // driven by bus boss:start/hp/end automatically; ui.bossBar.hide() for scripted ends
ui.lives(n|0)                             // hearts row (0 hides)
ui.damageNumber(pos:{x,y,z}, text, kind:"hit"|"crit"|"levels"|"hurt")
ui.jumpscare(kind:"creature"|"girl"|"hollow"|"giant", { dur=0.9 }) -> Promise   // honours reduceFlashing (no strobe)
ui.deathScreen({ title="YOU DIED", hint }) -> Promise   // resolves when it finished (2.5 s)
ui.ending(id, { buttons:[ "winner"? , "remember", "startOver", "title" ] }) -> Promise<buttonId>
ui.fakeScreen(kind:"youWin"|"connectionLost", dur) -> Promise   // final boss tricks
ui.glitch(dur, strength)                  // CSS/canvas glitch overlay (no flashing; safe at any setting)
ui.leaderboard.refresh()
```
- UI listens: `secret:found` (toast + submitScore), `level:gain` (counter + `+N LV` number), `item:get` (toast),
  `unlock` (banner), `player:hurt` (vignette), `interact:focus` (prompt), `boss:*`, `audio:lyric`, `objective:set`.
- Settings changes: write `state.settings`, `bus.emit("settings:change")`, `audio.setVolumes`, `save.write()`.
- Name entry: `validateName` (9.3); on success `profile.name`, `profile.onlineName = onlineNameFor(name)` then claims
  online in the background (never blocks), `ctx.engine.player.setNameTag(name)`, emit `ui:play`.
- Leaderboard (D13): board `tnrpg-secrets`, `getTop(board, 5)`, `submitScore(board, count, { name: onlineName, min:0,
  max:26 })`. Offline-safe.
- Shop menu uses `combat.shop()` / `combat.claim(id)`; inventory uses `combat.inventory()` / `combat.equip(id)`.
  STORY opens the shop when Odo is talked to (`ui.openMenu("shop")` after his line).
- UI calls `engine.touch.setVisible(false)` on title/name/dialogue/menus/ending cards/cinematics (`seq:start` with
  rt.cinematic) and `true` when returning to `screen === "game"`.
- `show hints` OFF: UI hides the waypoint marker and tip toasts; objective text stays (D5.5).
- ENGINE's `#touch` sits below `#ui` overlays but above the canvas; UI panels use `pointer-events:auto` only on
  interactive elements.

## 13. Debug hooks (`window.__tnrpg`), for tests. Each owner adds its keys during init.
| Hook | Owner | Does |
|---|---|---|
| `ctx` | main | the ctx |
| `fastTime(mult)` `fps()` `teleportTo(x,y,z)` `quality(l)` `frameStats()` | ENGINE | 5.10 |
| `play(name="Tester")` | UI | skips title + name entry: validates, sets name, emits ui:play, resolves when playing |
| `teleport(zoneId)` | WORLD | `world.goto(zoneId, { fade:false })` (also accepts point names) |
| `setLevel(n)` `give(itemId)` `godMode(bool)` `kill(kind\|"all"\|"boss")` `defeat(bossId)` | COMBAT | `defeat` = instantly win that COMBAT boss fight with full rewards (spawns it if needed): ratKing guards king cat rookie |
| `setCycle(n)` | STORY | `story.startCycle(n)` |
| `secret(id)` `phase(p)` `ending(id)` `secrets()` | STORY | award / force phase / `reachEnding` / list |
| `trigger(id)` `skipTimers()` `winBoss()` `loseBoss()` `idle()` | EVENTS | run sequence; finish waits; instantly win/lose the current EVENTS boss (hollow1/2/3, chase=reach end); idle = pretend 600 s idle |
| `wipe()` | COMBAT(save) | wipe save + reload |
| `state()` | main | `JSON.parse(JSON.stringify(ctx.state))` |
| `ready` | main | true after game:ready |
| `errors` | main | array of caught init/update errors (strings) |
All hooks return Promises or plain values and never throw.

## 14. Tests and tools
- `tools/browserlock.cjs` (ENGINE): exactly `module.exports = require("../../adventure-cube/tools/browserlock.cjs");`
  (shares the ONE machine-wide lock file; do not copy the code - a copy would use a different lock path).
- `tools/serve.cjs` (ENGINE): tiny node http static server rooted at `C:\Users\krist\Desktop\BossGauntlet`
  (`path.resolve(__dirname, "../..")`), port 0 (random) or argv[2]; correct MIME for .js (text/javascript), .html,
  .css, .json, .png; exports `start() -> Promise<{ url, close }>`; game URL `${url}/totally-normal-rpg/`.
- `tools/check.cjs` (ENGINE): runs `node --check` on every .js under the folder, then dynamic-imports the pure files
  `src/ui/names.js` (asserts: "idiot", "IDIOT", "MyGranniesAMotherFucker" ok; "mygranniesamotherfucker2", "fuck",
  "idiotfuck" rejected; 24 chars ok, 25 rejected) and `src/combat/stats.js` if it exports `simulatePacing()`
  (asserts each milestone <= 40 kills).
- `tools/playtest.cjs` (ENGINE writes the harness; it only uses the debug hooks above). One browser, inside the lock:
  ```js
  const lock = require("./browserlock.cjs"); const puppeteer = require("../../node_modules/puppeteer");
  await lock.acquire("tnrpg-playtest");
  let browser; try { browser = await puppeteer.launch({ headless: "new", args: ["--use-gl=swiftshader",
     "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required"] }); ... }
  finally { if (browser) await browser.close(); lock.release(); }
  ```
  Before page scripts: `window.__PLATYFY_ONLINE_TEST = { prefix: "pfo-test-tnrpg:", relay: "https://127.0.0.1:9" }`
  (offline, no real board writes). Viewport 1280x720 (and one 390x844 mobile pass with `hasTouch`).
  Steps (each: wait, screenshot to `tools/shots/NN-name.png`, collect console errors + `__tnrpg.errors`):
  1 title (wait 3 s) - 2 `play("Tester")` - 3 spawn/lobby - 4 teleport bridge - 5 ratField: kill rat, assert
  owned smelly_sword, level >= 1 - 6 `defeat("ratKing")` assert cheese_sword - 7 setLevel(50) teleport village; kill
  villager - 8 setLevel(600) `defeat("guards")` assert iron_sword - 9 setLevel(50000) teleport castle; kill royalGuard
  assert gold_sword - 10 setLevel(100000) teleport kingDark `defeat("king")` assert kings_staff + phase postKing -
  11 trigger desert (fastTime 60) screenshot - 12 forest - 13 forestHouse - 14 forestNight (jumpscare) - 15 collapse
  (screenshots 3 sections) - 16 throne `winBoss()` -> assert cycle 1 + secret ngplus - 17 cycle-1 red-eyed area1
  screenshot - 18 setLevel(200000) `defeat("king")` -> trigger hollowDesert -> girl -> `winBoss()` (hollow2) -> assert
  phase choice + choiceSnapshot - 19 ending("monster") screenshot card -> remember - 20 world ending (trigger via the
  void interactable path: teleport voidLeap + press E + confirm 1) - remember - 21 warrior (give the 6 items, bury via
  E at each grave) - remember - 22 `idle()` -> final -> `loseBoss()` -> idiot - remember - 23 idle -> `winBoss()` ->
  winners -> click Winner -> `winBoss()` -> sigma - 24 settings: reduceFlashing ON, trigger a jumpscare, screenshot -
  25 mobile pass: title + HUD + dialogue at 390 px; assert no element wider than viewport
  (`document.documentElement.scrollWidth <= 390`). Final assert: secrets() count >= 20, no errors.
  Exit code 1 on any failed assert. Print a summary table. Runs in the foreground; total < 4 min. The shared lock
  treats a lock older than 4 min as stale, so call `lock.touch()` after every step.
- Performance check (`tools/playtest.cjs --perf`): 20 s in lobby/village/castle at quality auto, logs
  `frameStats()` (draw calls target < 250, tris < 600k at level 2).

## 15. Performance and visual conventions (everyone)
- Static props: merge per zone per material (BufferGeometryUtils is not vendored - write a tiny merge helper in your
  folder) or InstancedMesh for repeats (fences, houses parts, rocks, haystacks, graves, cacti, torches).
- Only `engine` adds lights except: one PointLight per zone allowed for WORLD (torches use emissive + fake glow
  sprites, not lights), the King's staff light (COMBAT), the player weapon glow in dark zones (COMBAT), EVENTS one
  light per sequence. All extra lights `castShadow=false`.
- `castShadow` only on: player, enemies within 30 m, NPCs, buildings' main meshes. `receiveShadow` on terrain + floors.
- Hidden zones: `root.visible=false` and their AI/update loops skip.
- Particles: one pooled Points system per module, budgets by `engine.quality.level` (low 200 / high 2000).
- Text sprites/name plates: canvas textures created once and cached by text.
- Never call `renderer.compile` per frame; pre-warm materials at zone build (render once hidden).
- Colours: realistic, slightly desaturated naturals; red (#c0141c) is reserved for danger telegraphs, red eyes and
  cycle-1 corruption.
