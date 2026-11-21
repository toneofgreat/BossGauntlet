# PLATYPUS — LEVELS.md (binding spec for levels 2–5)

This is the only shared knowledge between parallel builders. Read CONTRACT.md (engine rules, budget, level-1
module APIs) and STORY.md (the owner's brief) first; this file tells you exactly what to build against.
Part A is the engine as it EXISTS today (implemented and tested). Part B is the contract for modules that
are being written in parallel: build yours to it exactly, and call the others exactly as written.
Part C is the storyboard of each level. Part D is performance.

Rules that apply to everything (from CONTRACT.md): plain ES modules, vendored three.js, no assets, no
build step; no per-frame allocations, no per-frame canvas-texture redraws, no per-frame geometry
rebuilds; InstancedMesh for anything repeated; every file passes `node --check`; modules never touch the
DOM (only `main.js`, `ui.js`, `cinema.js` do) and never add input listeners. Units metres, +Y up,
characters face +Z in local space. Do not launch a browser in a build phase.

File ownership. ENGINE (do not edit; ask for a change instead): `index.html`, `src/main.js`, `src/ui.js`,
`src/cinema.js`, `src/progress.js`, `src/game.js`, `src/levels/level1.js`, `src/levels/common.js`.
`src/levels/level2.js … level5.js` are placeholders: each level builder REPLACES the body of their file
(keep the exports) and stops importing `placeholder.js`. One builder per file listed in Part B.

--------------------------------------------------------------------------------------------------

# Part A — the engine (exists)

## A1. Flow

Main screen (five circles: 1 grey, 2–4 blue, 5 white; locked ones dimmed with a padlock) → click →
black cover → the engine `import()`s `src/levels/levelN.js`, calls `createLevel(ctx)` once, `build()` once,
then `enter()` and `start()` → the level runs → the level calls `ctx.complete()` → fade to black →
`exit()` → main screen, where the next circle plays its unlock animation. Progress is in localStorage.
A small "‹ levels" button (visible whenever the HUD is visible) calls `ctx.quit()`.

Level objects and worlds are created once and KEPT; `enter()`/`exit()` run on every visit, so a level must
be fully replayable: `enter()` resets everything it owns.

## A2. Level module interface

```js
// src/levels/levelN.js
export const meta = { n: 2, title: "THE CHAOS REALM" };
export function createLevel(ctx) {
  return {
    build() {},            // once, behind black. Create / fetch worlds and actors here (heavy work allowed).
    enter() {},            // every visit, behind black. Reset all state. MUST call ctx.setWorld(world).
    start() {},            // every visit, right after enter(). The screen is black (cinema fade = 1).
                           // Show the title card and reveal the world yourself (see example).
    update(dt, time) {},   // every frame while the level is active. dt is SCALED by the time scale.
    exit() {},             // leaving for the main screen. Stop your own loops/ambience; see A9.
    onAction(name) {},     // optional. Input events, see A5. Return true only to consume "jump".
    onJump() {}, onLand(impact) {},            // optional: the player left the ground / landed (0..1)
    onSwim(on) {}, onDive(under, depth) {},    // optional: started/stopped floating; went under / surfaced
                                               // (on surfacing, depth = deepest metres reached in that dive)
    state() { return { step }; },  // plain JSON for tests; MUST contain `step` (string)
    skipTo(name) { return true; }, // debug: jump to a named step (see each level's skip points); false if unknown
    win() {},                      // debug: finish the level now (must end in ctx.complete() by itself, or via
                                   // a ui.showComplete card whose button calls ctx.complete())
    STEPS: ["intro", "..."],
  };
}
```

## A3. The context object `ctx`

| member | what it is |
|---|---|
| `THREE, renderer, scene, camera, canvas` | three.js things. Never add objects to `scene` directly: put them in your world's `group`. |
| `platypus` | the player's model (`createPlatypus(THREE)`), shared by all levels, always in the scene. |
| `player` | player state, see A4. |
| `cam` | follow-camera rig `{ yaw, pitch, dist, wantDist, tx, ty, tz, manualT, minDist, maxDist }`. Set `yaw/pitch/wantDist` to frame things; `manualT = seconds` stops the auto-drift behind the player. Reset on every level entry (pitch 0.42, wantDist 3.7). |
| `takeCamera()` / `releaseCamera(blend = 0.8)` | take the camera away from the follow rig (then write `camera.position`/`lookAt`/`fov` yourself every frame) and give it back with a blend in seconds. `cinema.shot`/`cinema.play` do this for you. |
| `audio, fx, ui, cinema, progress` | services (A6–A8, CONTRACT.md, Part B extensions). |
| `time` | `{ scale, now, real, dt, rawDt }` — `now` = scaled game clock, `real` = wall clock, both in seconds. |
| `setTimeScale(s, rampSeconds = 0)` | slow motion: scales dt for player, level, world, fx, timers. Cinema, UI and the camera blend run on real time. Reset to 1 on exit. |
| `after(seconds, fn)` / `clearTimers()` | one-shot timers on the SCALED clock; all dropped automatically on exit. |
| `setWorld(world)` / `world` | make a world the active one (A4b); `ctx.world` reads it. May be called mid-level to change place (do it behind a fade; the first activation compiles shaders, a visible hitch otherwise). |
| `setEnv(env, seconds = 0)` | restyle background/fog/lights, optionally blended (time of day). See A4b. |
| `floorAt(x, z)` | where the player would stand/float at that point in the active world. |
| `colliders` | array of `{ x, z, r, on }` circles the player cannot enter, for transient level things. Emptied on exit: add yours in `enter()`. (A world's own static circles go in `world.colliders`.) |
| `pick` | clickable world objects, A5. |
| `project(v, out, yOff = 0)` | world → screen. `v` Vector3 or Object3D; `out = { x, y, visible }` in CSS pixels (reuse one object). For `ui.floatText`. |
| `setSpeaker(object3D \| null, height = 2.12)` | whose head the speech bubble (`ui.say`) points at. |
| `shared(key, make)` | one instance per key for the whole game: `ctx.shared("zoo", () => createZoo(ctx))`. ALWAYS use it for worlds, the friend, crowd, props (keys in Part B) so levels share GPU resources. |
| `input` | `held(name)` (is that action's key/button down), `x`, `y` (raw move input −1..1, right / forward, readable even when the player is disabled). |
| `touch` | true on touch devices (word your key hints: `ctx.touch ? "tap …" : "press E"`). |
| `complete()` / `quit()` | beaten → save, fade, main screen (unlock animation) / leave without beating. |
| `debug` | the `window.__platy` object; hang test handles on it if useful. |

## A4. The player

`ctx.player` fields you may read and write:

- `x, y, z, yaw` position / heading; `speed` (m/s, read), `moving`, `grounded`, `vy`, `turn`, `pitch`, `roll`.
- `enabled` (false on entry: set true when gameplay starts; input moves the player only when true,
  `lock <= 0` and no cutscene is playing). `lock` seconds of root lock (set it to an animation's duration);
  `face` yaw to turn toward while locked (or null). `kx, kz` knock-back velocity (decays).
- `maxSpeed` (3.0; reset on entry). `canJump`, `canDive` (true). `invuln` seconds (counts down).
- `hidden` (model invisible: first-person shots). `flicker` (blink while `invuln`; level 1 only).
- `carrying` (bool, passed to the model's animation state; set together with `platypus.setCarry`).
- `inWater` (feet wet), `swimming` (afloat), `diving` (under), `diveDepth` — computed by the engine.
- `scripted = true`: the engine stops ALL physics and does not move the model; you place
  `platypus.group` yourself every frame (being carried, special trick moves). The model's `update` still
  runs with `player.speed/grounded/swimming/…` as you set them. Set back to false and `teleport` after.
- `teleport(x, z, yaw)` — also snaps the camera. `walkTo(x, z, { speed: 0.7, then, face })` — walks there
  by itself with normal physics (works with `enabled` false and during cutscenes; `speed` is a fraction of
  maxSpeed; `then()` on arrival within 0.16 m; `face` = final yaw). `stop()`, `walking` (bool).

Engine behaviour: camera-relative WASD/arrows/left stick; Space/jump button jumps (6 m/s, gravity 17)
when `canJump`. The player stands on `max(world.heightAt, world.waterAt − 0.1)`. In a world with
`swim: true`, where the water is deeper than 0.2 the player FLOATS (`swimming`); holding Space / the
jump button DIVES (down to 2.4 m or the bed) and letting go floats back up; swim speed ×1.12, dive ×1.3.
`world.maxStep` blocks ledges taller than that (jump onto them). Tricks, slaps, eating etc. are
animations inside the model: call the model, set `player.lock = duration`; the group does not move.

## A4b. Worlds

A world is a place. Only the active world's `group` is in the scene. Shape (extra fields are fine):

```js
{
  name: "zoo",
  group,                       // Object3D with EVERYTHING of this place (levels add actors/props to it too)
  heightAt(x, z),              // required: ground height (solid bed under water). Cheap, analytic, no allocation.
  waterAt(x, z),               // optional: water surface height there, or -Infinity
  swim: true,                  // optional: deep water floats / dives the player (see A4)
  maxStep: 0.45,               // optional: tallest ledge the player waddles up
  colliders: [{ x, z, r, on }],// optional static circles
  confine(obj, radius),        // optional: clamp obj.x / obj.z in place to the walkable area (player, friend, ball)
  camBounds: { minX, maxX, minZ, maxZ, maxY }, // optional: the follow camera is clamped into this box
  env: { ... },                // optional: applied when the world is activated (see below)
  update(dt, time, focusX, focusZ), // optional per-frame (scaled dt); focus = player position
  onFootstep(wx, wz, strength, footIndex, wet, pan), // play the step sound / puff here
  onJump(x, z, floorY), onLand(x, z, floorY, impact, wet),
  onSwim(on, x, z), onDive(under, x, z),             // splash / underwater sound + fx
  warm(),                      // optional: create anything lazily-created so its shaders compile; return an undo fn
  onEnter(), onLeave(), onEnv(o),
}
```

`env` (every field optional; missing = level 1's white studio):
`{ background: 0xbfe3ff, fog: [color, near, far], hemi: [skyColor, groundColor, intensity],
sun: [color, intensity], sunDir: [x, y, z] (direction TOWARD the sun), far: 60 (camera far), dark: false }`.
`dark: true` switches HUD labels to light text. `ctx.setEnv(env, seconds)` blends everything.

LIGHT RULE: the scene has exactly one HemisphereLight and one shadow-casting DirectionalLight (1024 map,
a 20 m box that follows the player), owned by the engine and styled through `env`. Worlds add NO lights,
except: `lair` and `stage` may each contain at most 2 non-shadow PointLights that exist for the whole life
of the world (animate `intensity`, never `visible` — changing the light count recompiles every shader).
Spotlights, lamps, lava glow, alarm beacons are emissive/additive meshes and sprites.
Sky domes, far backdrops: own mesh with `fog: false`, inside the world group, radius < `env.far`.

## A5. Input

Movement and camera orbit are the engine's. Actions arrive at `level.onAction(name)` while the level is
running and no `cinema.play` sequence is playing:

| name | keyboard / mouse | touch |
|---|---|---|
| `"jump"` | Space (return `true` to consume it; otherwise the normal jump/dive happens) | jump button |
| `"interact"` | E (only if no speech bubble is open; E/Enter/tap advance the bubble first) | the action prompt (`ui.setAction`) |
| `"trick1"`…`"trick4"` | 1–4 — delivered ONLY while `ui.setTricks([...])` is showing | trick buttons |
| `"tailSlap"` | L | Slap button (`ui.setAbilities({ slap: true })`) |
| `"hold"` | H (toggle: pick up / drop) | Hold button (`ui.setAbilities({ hold: true })`) |
| `"primary"` | J or left mouse (if the click did not hit a pickable) | green Sting button (level 1 only) |
| `"secondary"` | K or right mouse | blue Pulse button (level 1 only) |

M toggles sound. Enter (held) or holding the on-screen pill skips a skippable cutscene.
Levels 2–5: `"primary"` (left click / J) may be used as a convenience alias (e.g. throw while holding).

Picking: `const h = ctx.pick.add(object3D, { onClick(h), onHover(bool), maxDist: 60 })` → handle
`{ object, enabled, remove() }`. Mouse hover shows a pointer cursor; click/tap fires `onClick`.
Meshes under the object are ray-tested, so register ONE simple proxy mesh (a box/plane; it may be
`material.visible = false` but must be `visible`). Picks work during cutscenes too (set `h.enabled`).
All picks are removed on exit; `ctx.pick.clear()`; `ctx.pick.at(cssX, cssY)` → handle or null.

## A6. UI (`ctx.ui`)

HUD visibility: the HUD is hidden on entry. `ui.showHud(true)` when gameplay begins; `cinema.play`
hides it while a cutscene runs and restores it. Everything is reset on entry and exit (`resetHud`).

- `setObjective(text | null, keysHint)`, `objectiveDone()` (tick + pop; then set the next one).
- `hint(text, secs = 2.4)` (= `toast`): small dark toast. `banner(title, sub, secs = 3.5)`: big calm
  story banner ("YOU ARE FRIENDS").
- `say(text, { who = "Wizard Wobble", onBlip(ch), onTyped(), onDone() })` typed speech bubble anchored
  to `ctx.setSpeaker`; `advance()`, `clearSpeech()`, `speaking()`. One line at a time: chain in `onDone`.
- `setFriendship(frac | null, label)` heart meter (top-left). `setExcitement(frac | null, label)` crowd
  meter (top-centre; pulses when ≥ 0.8).
- `setCoins(n | null)` shows/sets the counter; `addCoins(d)` → new total, with the pop animation;
  `ui.coins`. `floatText(text, sx, sy, kind = "coin" | "heart" | "plain")` rising number at a screen
  point from `ctx.project` (pool of 10).
- `setQuests([{ id, text, done?, current? }] | null, heading = "To do")` (max 6 rows);
  `setQuest(id, { text?, done?, current? })`.
- `setAction(label | null, key = "E")` contextual prompt "E Eat" (bottom-centre; on touch a tap button).
  Pressing it delivers `"interact"`. Set it only while the action is possible; `ui.actionOn`.
- `setTricks([{ label, enabled? } ×≤4] | null)` trick buttons, slot i = key i+1 (a null entry hides a
  slot); `setTrickState(i, { enabled?, want? })` (`want` = glowing "do this one");
  `flashTrick(i, good = true)`; `ui.tricksOn`. `setCombo(n | null, label = "combo")` (hidden below 2);
  `call(title, sub, "perfect" | "good" | "miss" | undefined)` big centre call-out ("BACKFLIP!", "+6").
- `setAbilities({ sting, zap, slap, hold, jump })` which round buttons exist (default: only jump, on
  touch). `setCooldown("sting" | "zap" | "slap" | "hold", frac)`, `setHolding(bool)` (glow on Hold).
- Rhythm track (level 4): `beat.show(bool)`; `beat.spawn(lane 0..3, leadSeconds, label?)` → id (0..15,
  −1 if full): a note that slides to the hit circle in `lead` seconds of REAL time;
  `beat.timeLeft(id)` (negative = late, NaN = gone); `beat.resolve(id, ok)` (pop / grey out);
  unresolved notes vanish 0.6 s late; `beat.clear()`.
- `showComplete({ kicker, title (html, `<br>` ok), sub, button = "Continue" }, cb)` the white level
  card; `hideVictory()`. `setHearts(n, max)` / `setHearts(null)`, `setHumanHp` (level 1).
- `setDark(bool)` (normally via `env.dark`). `after(secs, fn)` real-time UI timer (cleared on entry/exit).
- Do not show the quest list and the crowd meter together on phones (they collide); level 4 uses no quests.

## A7. Cinema (`ctx.cinema`) — runs on real time, owns the overlays in `#cine`

- `fade("black" | "white" | "clear", seconds, cb)`; `faded` (0..1). A level starts with fade = black.
- `titleCard({ kicker: "LEVEL 2", title: "THE CHAOS REALM", hold = 2.4, sound = true }, cb)`: (fades
  to black if needed,) shows the text, fades the TEXT away, calls `cb` with the screen still black.
  Plays `audio.titleCard()`.
- `endCard("TO BE CONTINUED", { hold = 4, sub }, cb)`: fades to black, shows the text, fades it, `cb`.
- `letterbox(bool)`; `tint("night" | "alarm" | "warm" | "sad" | null, opacity = 1)` full-screen colour
  wash (alarm pulses red; sad desaturates); `shake(amp, secs)`.
- `caption(text | null, seconds, { who, narr })` subtitle at the bottom (`who` = speaker label,
  `narr: true` = italic narration). Default duration from the text length.
- The eye (first-person lids over the 3D view; soft curved furry lids, vignette, blur and exposure
  that settle): `eye.shut(tint)` closed now (use while black, then `fade("clear")`);
  `eye.open({ duration = 7.5, blinks = 3 (1..4), tint = "day" | "night" | "alarm", sway = 1, onDone })`
  flutter-close-open several times, clearing blur, head-lift sway; clears itself when done.
  `eye.close({ duration = 5, tint, sway, onDone })` falling asleep; stays shut afterwards.
  `eye.set(openness, blurPx, brightness)` hold a squint; `eye.clear()`; `eye.active`, `eye.openness`.
  The sway only moves the camera while cinema owns it: give a first-person `shot` first
  (camera at the model's eye — e.g. `platypus.billTip` world position + 0.12 up — and
  `player.hidden = true`).
- `shot(spec)` takes the camera and holds/moves it; `releaseCamera(blend = 0.8)` gives it back.
  ```
  spec = { pos: [x,y,z] | Vector3,          // omit = start from the current camera pose
           look: [x,y,z] | Vector3 | Object3D, lookY: 0.2,  // an Object3D is tracked every frame
           fov: 40,                          // omit = keep
           to: { pos, look, fov },           // optional end pose → dolly / crane / zoom over `dur`
           dur: seconds, ease: "inOut" | "in" | "out" | "linear",
           track: Object3D, trackYaw: bool,  // pos / look arrays become offsets from this object (follow shot;
                                             // trackYaw rotates the offsets with the object's heading)
           hand: 0..1, roll: radians }       // hand-held drift, dutch angle
  ```
- `play(steps, { skippable = true, onSkip(), onDone(skipped), bars = true, release = 0.8 | null })`
  runs a cutscene: letterbox on, HUD hidden, player input off, action events suppressed. `steps` is an
  array run in order; each step is a function (called), a number (wait seconds) or ONE of:
  `{ shot: spec }` (blocks for `spec.dur`; `hold: false` lets the next step start at once),
  `{ wait: s }`, `{ call: fn }`, `{ until: () => bool, max: s }`,
  `{ caption: text, dur, who, narr }` (blocks; `hold: false` not to),
  `{ fade: "black" | "white" | "clear", dur }`, `{ bars: bool }`, `{ time: scale, ramp }`,
  `{ tint: name, opacity }`, `{ shake: amp, dur }`, `{ eye: "open" | "close", ...eye options }` (blocks),
  `{ card: { kicker, title, hold } }` (blocks).
  Hold-to-skip (Enter / on-screen pill, 0.9 s): quick fade to black, `onSkip()` — which MUST put every
  actor and flag in its after-cutscene state — then `onDone(true)`, fade back in. `onDone` always runs
  exactly once. `release: null` keeps the camera for a following shot/sequence.
  `playing`, `hasCamera`, `skip()` (debug), `slowMo(scale, ramp)` (= `ctx.setTimeScale`),
  `after(secs, fn)` (real-time timer), `reset()` (engine calls it on entry/exit).

## A8. Progress and the debug seam

`ctx.progress`: `unlocked`, `beaten[5]`, `isUnlocked(n)`, `isBeaten(n)` (use it for small replay
variations only). Saved under `platypus.progress.v1`.
`window.__platy`: `state()` (the level's `state()` plus `mode` "menu|loading|level|leaving", `levelN`,
`running`, `progress`, `player`, `cam`, `cinema`, `timeScale`, `fps`, `render`), `startLevel(n)` (promise),
`unlock(n)`, `unlockAll()`, `resetProgress()`, `level()` (the active level object: `state/skipTo/win`),
`skipTo(name)`, `win()`, `quit()`, `tp(x, z, yaw)`, `look(yaw, pitch, dist)`, plus `ctx, player, cam,
renderer, scene, camera, platypus, fx, audio, ui, cinema, progress, world`.
Tests: `node tools/playtest.cjs` (`--quick`, `--chain`) plays level 1 and the unlock chain; it drives
levels 2–5 only through the seam: it holds Enter to skip cutscenes, then calls `win()` and clicks the
Continue card if one appears. So `win()` must work from ANY step, including during the intro.

## A9. Clean-up contract

On exit the engine: stops the loop, clears timers/colliders/picks/speaker, resets the player, the HUD,
cinema, time scale and camera, calls `fx.clear(true)`, `audio.stopAll()`, and removes the world.
The level's `exit()` must additionally: stop behaviours of its actors (`friend.reset()`,
`crowd.reset()`, `props.reset()`, world `reset()`), and restore anything it changed on SHARED objects
(platypus pose/carry/sleep, `player.scripted`, reparented groups). `enter()` must not assume a clean
previous exit of another level: reset shared actors there too, and re-add shared groups to your world
group (`world.group.add(friend.group)` — a group has one parent; the last level to add it wins).

## A10. Complete example (works today)

```js
import { getWizard } from "./common.js";            // shared Wizard Wobble (level 5)
export const meta = { n: 9, title: "EXAMPLE" };
export function createLevel(ctx) {
  const { THREE, player, platypus, ui, cinema, audio, fx } = ctx;
  let world, step = "boot";
  const eye = new THREE.Vector3(), look = new THREE.Vector3(), scr = { x: 0, y: 0, visible: false };
  function build() {
    const group = new THREE.Group();
    const ground = new THREE.Mesh(new THREE.CircleGeometry(30, 40).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x8aa06a, roughness: 1 }));
    ground.receiveShadow = true;
    group.add(ground);
    world = { name: "example", group, heightAt: () => 0,
      env: { background: 0xbfe3ff, fog: [0xbfe3ff, 16, 42], hemi: [0xdff1ff, 0x6f7f52, 1.25], sun: [0xfff2d8, 2.1] },
      onFootstep(wx, wz, s, i, wet, pan) { audio.cushionStep(s * 0.5, pan); } };
  }
  function enter() { step = "intro"; ctx.setWorld(world); player.teleport(0, 0, 0); }
  function play() {
    step = "play";
    ui.showHud(true); ui.setCoins(0);
    ui.setObjective("Press E to finish", ctx.touch ? "tap Finish" : "E"); ui.setAction("Finish");
    player.enabled = true;
  }
  function start() {
    cinema.titleCard({ kicker: "LEVEL 9", title: "EXAMPLE" }, () => {
      platypus.billTip.getWorldPosition(eye); eye.y += 0.12;
      look.set(eye.x, eye.y + 0.2, eye.z + 4);
      player.hidden = true;
      cinema.eye.shut("day");
      cinema.play([
        { shot: { pos: eye, look, fov: 62, dur: 0 } },
        { fade: "clear", dur: 0.6 },
        { eye: "open", duration: 6.5, blinks: 3 },
        () => { player.hidden = false; },
        { shot: { pos: [2.6, 1.1, 3.2], look: platypus.group, lookY: 0.25, fov: 40, to: { pos: [-2.2, 0.8, 3] }, dur: 4.5 }, hold: false },
        { caption: "A new day.", dur: 4.5, narr: true },
      ], { onSkip() { player.hidden = false; }, onDone: play });
    });
  }
  function win() {
    if (step === "done") return;
    step = "done"; player.enabled = false; ui.setAction(null);
    ui.showComplete({ kicker: "LEVEL 9", title: "COMPLETE", sub: "" }, () => ctx.complete());
  }
  return { build, enter, start, exit() { step = "boot"; }, win, STEPS: ["intro", "play", "done"],
    update(dt, time) {},
    onAction(name) {
      if (name === "interact" && step === "play") {
        ctx.project(platypus.group, scr, 0.5); ui.addCoins(1); ui.floatText("+1", scr.x, scr.y); win();
      }
    },
    state() { return { step }; },
    skipTo(name) { if (name === "play" && step === "intro") { cinema.skip(); return true; } return false; } };
}
```

--------------------------------------------------------------------------------------------------

# Part B — modules being built in parallel (contracts)

Conventions for all of them: factories take `ctx` (use `ctx.THREE`, `ctx.audio`, `ctx.fx`); return
objects have `group` (Object3D), `update(dt, time)` (the LEVEL calls it every frame with its scaled dt,
unless stated), and `reset()` (back to the freshly-built state, everything transient hidden). Named
points are plain `{ x, y, z }` (optionally `yaw`). Callbacks are single settable properties
(`onEvent = null`). Any call may be made before `update` ever ran. Levels feature-detect NOTHING: every
function below must exist. Shared-instance keys: `ctx.shared("zoo" | "stage" | "lair" | "friend" |
"crowd" | "props", …)`.

The friend's name is **Pip** (given at the end of level 2's friendship moment; levels 3–5 call
`friend.setName("Pip")` in `enter()`).

## B1. `src/platypus.js` — EXTENSIONS (everything in CONTRACT.md stays exactly as is)

`createPlatypus(THREE, opts)` — `opts` optional: `{ variant: "player" (default) | "friend", scale, fur,
belly, bill }` (hex overrides). `"friend"` defaults: scale 0.9, lighter warm chestnut fur, a clear cream
chest/cheek patch, paler bill with a small pink freckle, slightly rounder tail — instantly
distinguishable from the dark player at a glance, same anatomy and rig. Geometry and textures are cached
at module level and shared by both instances (materials differ). Budget per instance: < 30k triangles,
< 12 draw calls.

`update(dt, s)`: `s` gains optional `swimming`, `diving`, `carrying`, `inWater` (bools). `swimming`:
body level at the surface, front-foot paddling stroke, hind feet and tail steering, small wake bob;
`diving`: streamlined, eyes shut (platypuses close their eyes underwater), strong front strokes, pitch
follows `group.rotation.x` set by the caller. `carrying`: see hold.

New API (all durations in seconds; all animations play INSIDE `group`, whose transform the caller owns;
they blend in/out over ≤ 0.15 s and return to locomotion by themselves):

- `trick(name) -> duration`. `tricks = { spin: { dur: 0.9, apex: 0.45, height: 0.25 }, backflip:
  { dur: 1.15, apex: 0.5, height: 0.9 }, tailStand: { dur: 1.6, apex: 0.7, height: 0.35 }, roll:
  { dur: 0.9, apex: 0.45, height: 0 }, twirlLeap: { dur: 1.2, apex: 0.55, height: 1.1 }, wave:
  { dur: 1.1, apex: 0.5, height: 0 }, bow: { dur: 1.2, apex: 0.6, height: 0 }, waterLeap:
  { dur: 1.4, apex: 0.6, height: 1.3 }, diveFlip: { dur: 1.0, apex: 0.5, height: 0 },
  tailSplash: { dur: 0.8, apex: 0.35, height: 0 } }` exposed as `platypus.tricks` (those numbers are
  binding; `apex` = the showy moment, `height` = how far the body rises inside the group).
  spin: a fast full turn on the spot with a little hop. backflip: crouch, full backward somersault,
  land with squash. tailStand: rears up and balances on the flat tail, front paws out, holds, drops.
  roll: sideways barrel roll on the ground. twirlLeap: high jump with a double spin. wave: sits up and
  waves a front paw. bow: play-bow, chest down, rump up. waterLeap: arcs up out of the water and
  noses back in (use while swimming). diveFlip: underwater somersault. tailSplash: slaps the surface
  with the tail (while swimming). Calling `trick` during a trick restarts with the new one.
- `acting` (bool): a trick / slap / eat / stretch one-shot is playing.
- `onEvent = null`: `(type, name)` with types `"apex"`, `"land"` (tricks that leave the ground: the
  moment of touchdown), `"slap"` (tail slap contact), `"bite"` (each eat bite), `"done"`.
- `tailSlap() -> 0.7`; `slapHitTime = 0.28`. Whips round and cracks the flat tail down/sideways —
  reads as HARD. `tailTip`: Object3D at the end of the tail (fx position).
- Hold: `holdAnchor` — Object3D between the front paws under the bill (≈ local (0, 0.17, 0.4)); things
  parented to it look carried. `setCarry(on)`: carry pose — front paws and bill grip, chest raised,
  hind-leg waddle with the tail as a prop; walk cycle keeps working at ≤ 2 m/s. `throwAnim() -> 0.5`
  (`throwReleaseTime = 0.22`).
- `eat() -> 1.4`; `eatBiteTimes = [0.3, 0.65, 1.0]` (bill dips and chews; fires `"bite"`).
- `sleep(on)`: curls up on its side-belly, tail over the nose, eyes closed, slow deep breathing (blend
  1.2 s). `wakeStretch() -> 2.2` (yawn, long front-paw stretch, shake).
- `pose(name | null, blend = 0.5)` persistent overlays: `"sit"` (upright on haunches, watching),
  `"sad"` (head and tail low, slow blink), `"limp"` (favouring a hind leg while walking), `"still"`
  (lying on its side, eyes closed, NO breathing, no blinking — completely motionless), `"curl"` (= sleep
  pose with breathing), `"balance"` (head up, bill level, small corrective sway: ball on the bill),
  `"carried"` (held under the belly by a person: limbs dangling, small wriggles), `"scared"` (low,
  flattened, quick breathing). `null` = normal.
- `playBow() -> 1.1`, `nuzzle() -> 1.4` (head rubs forward and sideways; caller puts the two animals
  facing each other 0.75 m apart), `shake() -> 0.8` (water shake-off).
- `lookAt(worldVec3 | null)`: head/neck aim toward a world point (clamped ±70° yaw, ±35° pitch,
  smoothed); null releases. `blink()`; `setEyes(open 0..1 | null)` (null = automatic blinking).
- `ballAnchor`: Object3D on top of the bill near the tip (the ball rides here).
- `setWet(0..1)`: wet-fur sheen/darkening (dries by itself over ~8 s when set once).

## B2. `src/friend.js`

`createFriend(ctx) -> friend` — Pip: an autonomous platypus built on `createPlatypus(THREE,
{ variant: "friend" })`. The level adds `friend.group` to its world group, calls `friend.setWorld(world)`
and `friend.update(dt, time)` every frame.

- Fields: `group`, `body` (the platypus API), `x, y, z, yaw` (read; write only via `place`), `speed`,
  `name` ("" until `setName`), `behaviour` (current name), `busy` (a one-shot is playing), `radius` 0.32,
  `swimming`, `visible` (get/set).
- `setWorld(world)`, `place(x, z, yaw)`, `setName(name)`, `reset()` (idle, normal pose, visible, events
  cleared), `distTo(x, z)`, `lookAt(point | Object3D | null)`.
- Steering: walks 1.6 m/s, runs 3.4, swims 3.4; smooth turn (≤ 7 rad/s) and acceleration; stays on
  `max(heightAt, waterAt − 0.1)`; swims/dives automatically in water (route points may carry `y` to dive
  to); hops up ledges ≤ 0.9 m with the jump animation, paths around taller ones by sliding; respects
  `world.colliders`, `ctx.colliders`, `world.confine`; keeps 0.6 m from the player (never pushes them).
  Footsteps/splashes go through `ctx.audio.step` at 60 % volume and `ctx.fx`.
- `do(name, opts)` starts a behaviour (replacing the current one). `onEvent = null`: `(type, data)`.

  | behaviour | opts | events |
  |---|---|---|
  | `"idle"` | — stands, looks about, grooms, glances at the player | |
  | `"wander"` | `{ center: {x,z}, radius: 4 }` | |
  | `"follow"` | `{ dist: 1.3, side: 0.7 }` trots beside/behind the player, waits when they stop | |
  | `"goto"` | `{ x, z, yaw?, run: false }` | `"arrived"` |
  | `"lead"` | `{ route: [{x,z,y?}…], waitDist: 4.5, run: true }` runs ahead point by point; if the player falls more than `waitDist` behind it stops, looks back and chirps ("call") | `"checkpoint"` (index, when BOTH are within 1.6 m of route point i), `"arrived"` (last one) |
  | `"circle"` | `{ radius: 1.1, laps: 2 }` runs rings round the player | `"done"` |
  | `"nudge"` | — trots up and bumps the player's side (tiny `player.kx/kz` push) | `"nudged"` |
  | `"nuzzle"` | — comes to 0.75 m in front, faces the player, nuzzles | `"nuzzled"` |
  | `"chase"` | `{ role: "it" \| "runner", tagDist: 0.75 }` it: chases at 92 % of player max speed; runner: flees with jukes, dives into the pool, never corners itself | `"tag"` (who: "friend" \| "player") — then it stops and waits for the next `do` |
  | `"hide"` | `{ spot: {x,z,yaw} }` sprints there, then crouches motionless; giggle-chirps every 4–6 s (`audio.friendChirp("giggle", …)` panned/attenuated by distance) | `"hidden"`; after `friend.found()` → pops up, happy emote → `"found"` |
  | `"playBall"` | `{ ball }` (props.ball) positions itself 4–6 m from the player; when the ball comes within 0.9 m headbutts it back toward the player (`ball.kick`) | `"pass"` (count) |
  | `"fetch"` | `{ ball }` chases the ball and dribbles it back to the player | `"returned"` |
  | `"splash"` | `{ at: {x,z} }` swims there, circles, tail-splashes (fx + audio) | `"splash"` (each) |
  | `"sit"` | `{ at?: {x,z}, lookAt?: Object3D \| point }` sits and watches (default: the player) | `"arrived"` |
  | `"sleep"` | `{ at: {x,z,yaw} }` walks there, yawns, curls up | `"asleep"` |
  | `"still"` | — lies still (`body.pose("still")`), ignores everything | |
- One-shots (work during most behaviours; `busy` while playing): `trick(name, delay = 0)` (same names as
  the model; fires `"trickDone"`), `emote(name)` with `"happy"` (hop + chirp + `fx.hearts`),
  `"chirp"`, `"call"` (looks at the player, beckoning hop), `"laugh"`, `"curious"` (head tilt),
  `"sad"`, `"scared"`, `"yawn"`, `"bow"` (play-bow); `eat()` (model eat + crunch).
- Scripted pieces for level 5:
  `glassLeap({ from: {x,z}, to: {x,z}, apex: 1.6, duration: 1.1 })` — runs to `from`, then a ballistic
  leap along the line to `to` (duration in SCALED seconds, so slow motion stretches it); fires
  `"leap"` at take-off, `"glass"` when it crosses `world.glass.z` (data: the crossing point `{x,y,z}`),
  `"landed"` at the end, then slides 0.8 m, comes to rest and goes `"still"` by itself.
  `attachTo(object3D | null)` — parent the group to an anchor (the cell floor) with a `"curl"` pose and
  slow breathing; `null` detaches back to free roaming.

## B3. `src/zoo.js`

`createZoo(ctx) -> world` (A4b shape, `name: "zoo"`, `swim: true`, `maxStep: 0.45`, `confine`,
`camBounds`, `env` = noon). The habitat of STORY.md level 2 item 4 — the visual showpiece.

Layout (binding; ±0.5 m freedom as long as the named points stay where stated). Interior:
x ∈ [−13, 13], z ∈ [−10, 10]. Glass viewing wall along z = +10 (2.4 m tall, open above); visitor hall
beyond it (walkway z ∈ [10.6, 14.5], back wall at z = 15 carrying the posters, facing −z). Rock walls
3–5 m on the other three sides, trees and sky beyond. Keeper door in the east wall at (13, −2).
Pool (water surface y = 0, bed down to −1.8) centred (−5.5, 2), about 9 × 7; a stream (0.25 deep, surface
y = 0) runs into it from a waterfall at (−9.5, −7.5) falling from a 2.2 m ledge reachable by rock steps
on its east side. Dry ground is y ≈ 0.15–0.3 (sand bank east of the pool), rocks up to 2 m.

`zoo.P` named points (y = standing height):

| name | (x, z) | what |
|---|---|---|
| `nest` | (9, −7.5) yaw toward (0,0) | cosy burrow mouth, the player's sleeping spot; `nestFriend` (8.1, −6.9) beside it |
| `lookout` | (5.5, −7) y ≈ 1.8 | top of the rock terrace (steps of ≤ 0.4 m from (3.5, −4.5)) |
| `hollowLog` | (2, −6) | walk-through log (hide spot) |
| `logBridge` | (−7.5, −3.2) y ≈ 0.6 | log across the stream; ends `logBridgeA` (−6.2, −3.6), `logBridgeB` (−8.8, −2.8) |
| `fallTop` | (−9.5, −7) y ≈ 2.2 | top of the waterfall (slide start); `fallSteps` (−7.6, −7.4) foot of the steps |
| `fallBehind` | (−10.6, −8.3) | ledge behind the falling water (hide spot) |
| `reeds` | (−10.5, 5.5) | tall reeds at the pool's west edge (hide spot) |
| `ferns` | (11, 3) | fern thicket (hide spot) |
| `sandbank` | (0.5, 2.5) | east shore, flat sand |
| `sunRock` | (−1, −2.5) y ≈ 0.5 | big flat warm rock |
| `divingRock` | (−2, 5.5) y ≈ 0.9 | rock overhanging the pool |
| `poolCenter` | (−5.5, 2) | `poolDeep` (−6.5, 2.5, y = −1.7) the deepest point; `sunkenLog` (−4, 0.5, y = −1.3) |
| `showRock` | (3, 7.2) y ≈ 0.35, yaw 0 (facing the glass) | flat rock in front of the glass: the trick spot; `showFriend` (4.6, 7.0) |
| `hoop` | (6.5, 4) | standing toy hoop on land: also `zoo.hoop = { x, y: 0.75, z, yaw, r: 0.55 }` (axis along x) |
| `ring` | (−5.5, 4.5) | ring floating upright half in the water: `zoo.ring = { x, y: 0.15, z, yaw, r: 0.6 }` |
| `ballSpot` | (4, 1) | where the ball rests |
| `bowl` | (10, −1.5) | where the keeper puts the food bowl; `bowlFriend` (10.9, −0.6) |
| `doorIn` / `doorOut` | (12.3, −2) / (14.5, −2) | just inside / outside the keeper door; `outside` (14.5, 9) the corner of the service path; `hallEnd` (9, 12.5) on the visitor walkway |
| `glassMid` | (0, 10) | `leapFrom` (5, 7.6), `leapTo` (5.6, 12.4) for the level-5 leap (crossing the glass at x ≈ 5.3) |
| `poster` | (5, 2.4, 14.9) | centre of the main poster; `riddle` (6.3, 1.75, 14.9) the small one — to the LEFT of and a little lower than the main poster as seen from inside the habitat |
| `posterCam` | (5.4, 2.2, 11.3) | camera spot that frames both posters looking +z; `posterClose` (5.0, 2.4, 12.6) main poster only |
| `camWide` | (−11, 6.5, 9) looking at (0, 0.5, −1) | establishing shot (every `cam*` point in `zoo.P` and `stage.P` is a `{ pos, look }` pair of `{x,y,z}`; `posterCam`/`posterClose` look at `poster`); `camNest` (6.6, 1.1, −5.4) looks at `nest`; `camPool` (−1, 1.6, 6.5) looks at `poolCenter`; `camGlass` (0, 1.5, 4) looks at `glassMid` |

Extras:

- `heightAt`, `waterAt`, `depthAt(x, z)` (0 on land), `inPool(x, z)`, `surfaceAt(x, z)` →
  `"sand" | "rock" | "grass" | "wood" | "water"`; the world hooks play `audio.step(surface, …)`,
  `audio.splash`, `fx.splash`, `audio.underwater(on)`, `fx.bubbles` themselves.
- `walkway = { x0: −12, x1: 12, z0: 10.8, z1: 14.2 }`; `glass = { z: 10, x0: −13, x1: 13, height: 2.4,
  broken, shatter(x, y) }` — `shatter` removes a ragged ~2.2 m section centred on x (cracks spreading on
  the neighbouring panes) and calls `fx.glassShards` + nothing else (the level plays the sound);
  `glass.reset()`.
- `fish`: a school of 14 (one InstancedMesh, vertex-shader tail wag) cruising the pool with simple
  avoidance (each other, walls, the player and friend within 1.4 m: they dart away at 3.2 m/s, cruise
  0.9). `fish.count`, `fish.pos(i, outVec3)`, `fish.alive(i)`, `fish.nearest(x, y, z, maxDist) -> i | −1`,
  `fish.catch(i)` (gone with a bubble puff; respawns from the stream after 25 s unless
  `fish.respawn = false`), `fish.scare(x, y, z, r)`, `fish.reset()`.
- `setTime(name, seconds = 0)`: `"morning"` (cool, low sun, light mist), `"noon"`, `"evening"` (golden,
  long shadows), `"night"` (deep blue, lamps and hall lights on, moon rim), `"alarm"` (night + red
  rotating beacon glow pulsing over everything). Calls `ctx.setEnv` with its preset and animates its own
  emissives. `zoo.ENV[name]` are the env objects.
- `poster.setText(line1, line2)` — canvas texture redrawn only on this call. Level texts:
  `("PLATYPUS TRICKS", "IN 2 DAYS")`, `("PLATYPUS TRICKS", "1 DAY LEFT")`.
  `riddle`: `{ object (pick proxy mesh), fall() -> 2.6 (one pin lets go: it swings, the other pin
  tears, it flutters down to the floor — plays `audio.posterFall()` itself), fallen, reset() }`. It reads
  **WHY DID THE PLATYPUS CROSS THE ROAD?**; on the wall behind it, faint as old pencil:
  **TO GET TO PLATYFY** (visible only once it has fallen).
- `door.open(on)` (keeper door swings, 0.8 s); `reset()` (glass, riddle, door, fish, time = noon).

## B4. `src/crowd.js`

`createCrowd(ctx) -> crowd` — people. `group` (the level adds it to the active world's group),
`update(dt, time)`, `reset()` (nobody visible).

Visitors behind the zoo glass (≤ 24, instanced body parts with per-instance colour: adults and
children, varied clothes/hair/hats/skin; walk cycles and gestures in the vertex shader or by instance
matrices; ≤ 8 draw calls, ≤ 14k triangles):

- `setLane(walkway, glassZ)` (from `zoo.walkway`, `zoo.glass.z`).
- `stroll(n)`: keep about n people wandering through (enter at one end, amble, stop at random to look,
  leave). `gather(x, n)`: n people come to the glass around x (spread ±3 m, children at the front, faces
  toward −z) and stay watching; repeated calls adjust x and n. `disperse()`: watchers drift back to
  strolling. `watchers(x, radius = 5) -> count` of people standing and watching near x right now.
- `react(kind, intensity = 0.6)`: `"ooh"` (lean in), `"clap"`, `"cheer"` (arms up, bounce), `"point"`,
  `"laugh"`, `"gasp"`, `"wave"` — animates the watchers AND plays `audio.crowd(kind, intensity)` muffled
  (behind glass).
- `tossCoin(cb)`: one watcher does a toss; `cb(from)` is called at the release moment with the hand
  position `{ x, y, z }` (reused object) — the level then calls `props.coins.toss(from, to, value)`.
  Returns false (and never calls back) if nobody is watching.
- `panic(on)`: everyone runs back and forth and out, arms up, bumping; the level starts
  `audio.panic(true)`.

Staff (two articulated humans in the style of `createHuman`, different outfits: `staff[0]` the keeper —
green zoo polo, cap, bucket; `staff[1]` a handler in a dark jacket; < 20k triangles, < 16 draw calls
each, only visible while used): each has `group`, `visible`, `x, z, yaw`, `place(x, z, yaw)`,
`walkTo(x, z, cb, run = false)`, `kneel(cb)` (crouch and place something: `cb` at the put-down moment),
`stand()`, `wave()`, `carry(on)` (arms cradle something against the chest), `carryAnchor` (Object3D in
the cradle: the level copies its world transform onto `platypus.group` each frame while
`player.scripted`), `handAnchor` (Object3D at the right hand: bowl), `lookAt(point | null)`,
`reach(point)` (arm stretches toward a point). They walk on the active world's `heightAt` and ignore
walls (the level routes them through `zoo.P.doorOut → doorIn`).

Arena audience (level 4): `audience.build(seats)` — `seats` = `stage.seats` (Float32Array of
x, y, z, yaw per seat, ≥ 400); ONE InstancedMesh of a ~40-triangle seated figure with instance colour,
all motion in the vertex shader. `audience.setExcitement(0..1)` (0 = sitting still, 0.5 = bobbing and
clapping, 1 = standing, arms waving), `audience.wave()` (a stadium wave sweeps once),
`audience.flashes(rate 0..1)` (twinkling camera flashes: a second small instanced/points draw),
`audience.group`, `audience.reset()`. Sound is the level's job (`audio.crowd`, `audio.crowdBed`).

## B5. `src/stage.js`

`createStage(ctx) -> world` (`name: "stage"`, `swim: true`, `maxStep: 0.5`, `confine`, `camBounds`,
`env.dark = true`). The PLATYPUS TRICKS arena: a round thrust stage, show pool, platforms, hoops,
spotlight cones (additive meshes), banners reading PLATYPUS TRICKS, a big screen, a backstage tunnel,
tiers of seats on three sides.

Layout (binding): stage floor y = 0, walkable x ∈ [−11, 11], z ∈ [−7, 7]. Audience tiers from z = 9
rising back and wrapping to x = ±14. Backstage tunnel mouth at (0, −7) leading to z = −13. Show pool
(surface y = −0.05, 1.6 deep) centred (0, 3), 9 × 4.5. `stage.P`: `tunnelStart` (0, −12), `tunnelMouth`
(0, −7.5), `centre` (0, −2.5), `markL` (−4.5, −2.5), `markR` (4.5, −2.5), `friendMark` (1.6, −2.5),
`poolEdge` (0, 0.4), `poolCentre` (0, 3), `towerTop` (−8, 1) y = 1.6 (ramp from (−8, −3)), `podium`
(8, 0) y = 0.8, `bow` (0, 5.9), `cannonL` (−9, 0, 6), `cannonR` (9, 0, 6), cameras `camWide`
(0, 7, 16) → look (0, 1, 0), `camCrane` (−12, 9, −4), `camLow` (0, 0.6, −6.5), `camPool` (6, 2.2, 7.5),
`camHero` (0, 1.2, 8.2) → look (0, 2.2, 3).
`hoops = [{ x: −2.6, y: 1.3, z: 3, yaw, r: 0.7 }, { x: 2.6, y: 1.3, z: 3, yaw, r: 0.7 },
{ x: 0, y: 2.3, z: 3, yaw, r: 0.8, flaming: true }]` (axis along x: you pass through travelling ±x).
`seats` (see B4).

Extras: `setCue(name, seconds = 1)`: `"preshow"` (house dim blue, haze), `"entrance"` (two white
spots on `tunnelMouth`), `"show"` (bright stage wash, colour spots sweeping slowly), `"water"` (cool
blue-cyan, spots on the pool), `"duet"` (two warm spots), `"finale"` (everything, gold, spots fanning),
`"blackout"`, `"house"` (warm, lights up). `spots[i].follow(Object3D | point | null)` for i = 0..3.
`setEnergy(0..1)` scales light motion/brightness (drive it with the excitement meter).
`setHoopFlame(on)` (the flaming hoop: additive flame sprites + glow, no light). `screen.setText(a, b)`
(big screen canvas, redrawn only on call). `reset()`. No strobing: nothing flashes faster than 2 Hz.

## B6. `src/lair.js`

`createLair(ctx) -> world` (`name: "lair"`, `confine` to the ledge, `env.dark = true`, fog black-red).
A vast dark rock cavern; a lake of flowing, glowing lava far below (animated in the fragment shader:
slow convection cells, bright cracks, darker crust drifting; no real light — one PointLight allowed for
the under-glow on characters); a jail cell of iron bars hanging on chains over the lava; a big timer
display above it; a safe rock ledge for training.

Layout (binding): training ledge, flat, y = 0, x ∈ [−7, 7], z ∈ [−5, 5]; lava surface y = −7 everywhere
else. The cell hangs at (0, 3.2, 13) (2.2 m cube, floor at y = 3.2), chains up into the dark; the timer
at (0, 7.2, 13), about 5 m wide, facing −z, dim red glowing segments/letters.
`lair.P`: `spawn` (0, −3) yaw 0 (facing the cell), `wizard` (−2.2, 1.6), `dummy` (3, 0.5), `cushion`
(−3.2, −0.6), `dropRing` (0, 1.5). Cameras are `{ pos, look }` pairs of `{x,y,z}`: `camWizard`
(−0.9, 1.5, −1.2) look (−2.2, 1.6, 1.6), `camRise0` (0, 1.2, 2) look (0, 1.5, 13), `camTimer`
(0, 7.6, 4.5) look (0, 7.2, 13), `camCell` (2.2, 3.9, 9.4) look (0, 3.7, 13), `camLava` (5, −3, 9) look
(0, 3.2, 13), `camTrain` (0, 2.4, −6.5) look (0, 0.5, 0).

Extras: `timer.setText("8 DAYS")` (canvas, redrawn only on call; ticks visually by itself: a colon/dot
pulse in the shader). `cell.floor` (Object3D: `friend.attachTo(cell.floor)`), `cell.sway(amount 0..1)`.
`setVoid(on)`: everything hidden/black except what the level adds (used for the wizard-in-the-dark
moment); `setGlow(0..1, seconds)` fades the lava light up. Heat shimmer and embers: the lair calls
`fx.embers` / `fx.heat` itself from `update`. `reset()`.

## B7. `src/props.js`

`createProps(ctx) -> props` — `group` (add to the active world's group), `setWorld(world)`,
`update(dt, time)`, `reset()` (everything hidden and at rest). Physics: gravity 17, bounce and roll on
`world.heightAt`, float on `world.waterAt`, kept inside `world.confine`. Everything pooled.

- `addPusher(obj, radius)` / `clearPushers()`: bodies that shove rolling things. `obj` needs `x, y, z`
  and either `speed` + `yaw` (ctx.player, friend) — walking into the ball dribbles/kicks it at
  1.25 × the pusher's speed.
- `ball`: `{ group, x, y, z, vx, vy, vz, r: 0.22, active, place(x, z), kick(dirX, dirZ, speed, up = 2),
  resting, onBounce = null (strength), balanceOn(anchorObject3D | null), tilt (−1..1, read/write while
  balanced: the level drives the wobble; the ball visibly leans and rolls on the bill),
  drop() (falls off the anchor with its current lean) }`. Beach-ball stripes; soft bounce sound via
  `audio.ballBounce`.
- `hoop(spec) -> { passed(x, y, z) -> bool, reset() }`: pure logic for ring triggers. `spec` is a
  `{ x, y, z, yaw, r }` (zoo.hoop, zoo.ring, stage.hoops[i]); call `passed` every frame with a moving
  point: true on the frame the point crosses the ring's plane inside the ring.
- `shinies` (pool of 8 small treasures: shells, a marble, a key, a bottle cap — they glint):
  `place(i, x, y, z)`, `collect(i)` (sparkle pop, hides), `active(i)`, `nearest(x, y, z, maxDist) ->
  i | −1`, `count`, `clear()`.
- `snacks` (pool of 8 single food items; `kind` `"worm" | "yabby"`): `place(i, x, z, kind,
  buried = false)` (buried: only a faint bump until `reveal(i)` pops it out of the sand),
  `reveal(i)`, `eat(i)` (hides, crumbs), `active(i)`, `buried(i)`, `nearest(x, z, maxDist) -> i | −1`,
  `pos(i, outVec3)`, `clear()`.
- `bowl`: `{ group, place(x, z), attach(anchorObject3D | null) (carried by the keeper), fill(kind, n),
  left, bite() -> bool (one item goes, crumbs fx; false when empty), hide() }`.
- `coins` (pool of 48, one InstancedMesh, spinning, glinting): `toss(from, to, value = 1)` (arc over
  the glass, bounce, settle), `rain(cx, cz, radius, n, value = 1)` (fall from 6 m above; level 4),
  `magnet = obj | null` (object with x, y, z: coins within 1.3 m fly to it and are collected),
  `onCollect = null` `(value, x, y, z)` — the LEVEL then calls `ui.addCoins`, `ui.floatText`,
  `audio.coin`; `lying` (count on the ground), `clear()`.
- `cushion` (a small square white cushion, ~0.35 m, like the level-1 ones in miniature):
  `{ group, x, y, z, state: "ground" | "held" | "flying", place(x, z), canPickUp(x, z) -> bool (within
  0.9 m), pickUp(anchorObject3D) (snaps into the grip), drop() (falls at the holder's feet),
  throwAt(dirX, dirZ, speed = 6, up = 3.5), onLand = null (x, z), onHit = null — set
  hitTarget = { x, y, z, r } and onHit fires if it passes within r while flying }`.
- `toys.duck`: `{ place(x, z), group }` a floating rubber duck that bobs and can be nudged (set dressing).

## B8. `src/audio.js` — EXTENSIONS (all through the existing master limiter; all procedural)

Housekeeping: `stopAll()` — stops every looping layer below and the level-1 ambience (the engine calls
it on exit). `titleCard()` — the deep hit under a title card. `levelUnlock()` — bright rising chime for
the main-screen unlock. Loops take `(on)` or `(level 0..1)` and fade ≥ 0.3 s; calling twice is safe.

- World: `step(surface, strength = 0.6, pan = 0)` with `"sand" | "rock" | "grass" | "wood" | "water" |
  "stage"`; `zooAmbience(on, time = "day" | "night")` (birds, breeze, water trickle, faint murmur behind
  glass; night: crickets, hum); `waterfall(level 0..1)` (the level sets it from distance);
  `splash(size 0..1)`, `diveIn()`, `surface()`, `underwater(on)` (low-pass on the world bus + bubbling);
  `ballBounce(strength)`; `doorOpen()`.
- Friend: `friendChirp(mood, volume = 1, pan = 0)` with `"happy" | "call" | "giggle" | "curious" |
  "sad" | "scared" | "sleepy" | "growl"` (soft low platypus growl-purr); `eat()` (crunch),
  `yawn()`, `nuzzle()` (soft purr), `snore(on)`.
- Rewards: `coin()` (clink, pitch varies), `payout(n)` (a run of clinks), `questDone()`,
  `friendship()` (the warm jingle of the friends moment), `trickWhoosh(kind = 0..3)`, `trickLand(good)`,
  `comboUp(n)`.
- Crowd: `crowd(kind, intensity = 0.6, muffled = true)` with `"ooh" | "clap" | "cheer" | "laugh" |
  "gasp" | "roar"`; `crowdBed(level 0..1)` (arena murmur → roar loop); `panic(on)` (stylised shouting,
  running footsteps; not horrifying).
- Show: `showMusic.start(bpm = 112)`, `.stop(fadeSeconds = 1)`, `.setIntensity(0..1)` (adds layers:
  drums → bass → chords → lead → sparkle), `.time()` → seconds since the music's bar 1 beat 1 on the
  AUDIO clock (0 before start), `.beat()` → the same in beats (float), `.bpm`; `.sting("good" | "miss" |
  "perfect")` in key. `preShow(on)` (tense drone + distant crowd), `afterShow()` (short warm cadence).
- Story: `lullaby(on)`, `alarm(on)` (siren, not harsh), `glassShatter(slow = false)` (the slow version:
  pitched down, long shimmering tail), `heartDrop()` (everything else ducks to silence over 0.4 s — a
  low heartbeat, then nothing) and `sadTheme(on)` (few slow notes, lots of space; releases the duck),
  `wizardMotif()`, `lavaRumble(level 0..1)` (rumble + bubbles), `chainCreak()`, `timerTick()`,
  `tailSlap()` (woody crack) and `tailSlapHit()` (crack + thud on the dummy), `pickup()`, `drop()`,
  `throwWhoosh()`, `cushionHit()`, `posterFall()` (paper rip, flutter, slap on the floor),
  `eyeOpen()` (soft airy swell for the wake-up), `sensePulse(closeness = 0)` (the bill's electro-sense
  ping: a soft sonar blip whose pitch rises with closeness 0..1).

## B9. `src/fx.js` — EXTENSIONS (pooled, closed-form motion in shaders, ≤ 4 extra draw calls in total)

All respect the scaled dt passed to `fx.update` (so slow motion slows them). `clear()` clears them too.

- `splash(x, y, z, size 0..1)` (crown + droplets + ring on the surface y), `droplets(vec3, n)`,
  `bubbles(x, y, z, n, surfaceY)` (rise and pop at the surface), `bubbleRing(x, y, z, yaw, r)` (a
  vertical ring of bubbles that hangs ~6 s: the dive trail), `wake(x, z, surfaceY, strength)` (call
  while swimming).
- `coinSparkle(vec3)`, `hearts(vec3, n = 3)` (small hearts drifting up), `sparkle(vec3, colorHex,
  n)`, `crumbs(vec3)`, `sandPuff(x, y, z, strength)`, `dust(x, y, z, strength)`.
- `confetti(vec3, dirVec3 | null, n)` (max 300 live, colourful, flutter and settle),
  `spotDust(on, box)` (slow drifting motes in the arena air).
- `glassShards(x, y, z, dirX, dirZ, n = 60)` (pooled thin triangles/quads, glinting, tumbling;
  beautiful in slow motion; fade after landing).
- `embers(x, y, z, spread, n)` (rise, flicker, die), `heat(x, y, z, w, h)` → handle `{ remove() }`
  (a refraction-free shimmer card: additive wavering streaks; cheap).
- `slapRing(x, y, z, yaw)` (tail-slap impact: sharp expanding ring + wood-chip sparks),
  `zzz(vec3)` (one soft "z" puff rising — call every ~1.5 s), `sadMotes(vec3, n)` (few slow pale
  motes sinking; subtle), `senseRing(x, y, z, dirX, dirZ)` (electro-sense: a ring that stretches toward
  the direction given).

--------------------------------------------------------------------------------------------------

# Part C — the levels

Shared set-up for the zoo levels (2, 3, 5): in `build()` fetch `zoo`, `friend`, `crowd`, `props` with
`ctx.shared`; in `enter()`: `zoo.reset()`, `zoo.group.add(friend.group, crowd.group, props.group)`,
`friend.setWorld(zoo)`, `props.setWorld(zoo)`, `crowd.setLane(zoo.walkway, zoo.glass.z)`,
`props.addPusher(player, 0.35)`, `props.addPusher(friend, 0.32)`, `props.coins.magnet = player`,
`ctx.setWorld(zoo)`, `audio.zooAmbience(true)`. In `update`: `friend.update`, `crowd.update`,
`props.update`, `audio.waterfall(distance-based)`. Every quest ends with `audio.questDone()`,
`ui.setQuest(id, { done: true })`, `friend.emote("happy")`.

TRICKS AND MONEY (levels 2, 3, 5 — identical rules, one helper per level file is fine):

- A trick starts on its key if the player is grounded (or swimming for water tricks), not locked:
  `d = platypus.trick(name)`, `player.lock = d`, `audio.trickWhoosh`, `ui.flashTrick(slot)`; it is
  scored at its `"apex"` event.
- Seen = `crowd.watchers(player.x) > 0` and the player is in the show zone (z > 3, i.e. within 7 m of
  the glass). The first trick in the show zone calls `crowd.gather(player.x, 3)`; each paid trick adds
  one watcher (max 9 in level 2, 12 in level 3, 14 in level 5); 12 s with no trick → `crowd.disperse()`.
- Base values: spin 1, roll 1, wave 1, bow 1, backflip 2, tailStand 2, twirlLeap 3, waterLeap 3,
  hoop jump 4, ball balance 1 per half second held (max 8).
- Combo: a trick DIFFERENT from the previous one, started within 3 s of the last one ending, raises the
  combo by 1 (max ×5); the same trick twice in a row pays half (rounded down, min 0), resets the combo
  to 1 and the watchers `"laugh"`. `ui.setCombo(n)`.
- Coins = `ceil(base × combo × (0.5 + 0.1 × watchers))`. Not seen → 0 coins and, once per level,
  `ui.hint("Nobody saw that! Do tricks near the glass.")`.
- Paying: `ui.call(NAME + "!", "+" + coins, combo ≥ 3 ? "perfect" : "good")`,
  `crowd.react(coins ≥ 6 ? "cheer" : coins ≥ 3 ? "clap" : "ooh", …)`, then `min(coins, 5)` physical
  coins: `crowd.tossCoin(from => props.coins.toss(from, landingPointNearPlayer, value))` with the values
  summing to `coins`. Money counts when PICKED UP (`props.coins.onCollect` → `ui.addCoins(v)`,
  `ui.floatText("+" + v, …)`, `audio.coin()`).
- Ball balance (slot shown as "Ball" when the ball is within 1.6 m): the ball hops onto the bill
  (`props.ball.balanceOn(platypus.ballAnchor)`, `platypus.pose("balance")`, `player.maxSpeed = 1.2`);
  `tilt` drifts with a random walk plus the player's turn rate; the player steers against it with
  A/D / the stick (`ctx.input.x`); it pays every 0.5 s; it ends at |tilt| ≥ 1 (ball drops, crowd
  "ooh"), after 4 s (success: "cheer"), or on the key again.
- Water leap: no key — dive at least 1.0 m and let go while moving; when `onDive(false, depth)` fires
  with depth ≥ 1.0 and speed > 1.5 the level plays `platypus.trick("waterLeap")` + `fx.splash`. Through
  `zoo.ring` (`props.hoop(zoo.ring).passed(...)` at the apex) it counts as "RING LEAP" worth 5.

## C2. Level 2 — "THE CHAOS REALM" (target 8–10 minutes)

Trick slots: 1 Spin, 2 Backflip, 3 Tail stand, 4 Ball (contextual). Time of day: morning → noon →
(ending) evening. Friendship meter visible from beat 4; each of the four quests adds 25 %.

1. `cinema.titleCard({ kicker: "LEVEL 2", title: "THE CHAOS REALM" })`. Behind it: `zoo.setTime("morning")`,
   player at `P.nest` with `platypus.sleep(true)`, friend placed 0.6 m in front of the player's face
   looking at them, `crowd.stroll(4)`.
2. Wake: `player.hidden = true`, first-person shot from the player's eye toward the friend
   (`look: friend.group, lookY: 0.2`), `cinema.eye.shut("day")`, `fade("clear")`,
   `{ eye: "open", duration: 8, blinks: 3 }`, `audio.eyeOpen()`. During the blinks the friend tilts its
   head (`emote("curious")` at 40 %), chirps at 75 %. Caption (narr) after: "Good morning."
3. Cutscene (same `cinema.play`, ~35 s, skippable; `onSkip`: player standing at nest, friend at
   `sandbank`, `platypus.sleep(false)`): cut to `camNest`: the player does `wakeStretch`; the friend
   `nudge`s, `circle`s, play-`bow`s; crane from `camWide` over the whole habitat (caption: "This is
   home."); the friend runs to the pool and `splash`es (`camPool`), turns and `call`s; visitors stroll
   past the glass (`camGlass`, caption: "And that… is a friend?"). End: camera releases behind the player.
4. Quest 1 — ROCK RACE ("Follow your friend!"): `friend.do("lead", { route: [hollowLog, logBridgeA,
   logBridgeB, fallSteps, sunRock, lookout foot (3.5, −4.5), lookout] })`. `fx.ring` on the next
   checkpoint every 0.85 s; on `"checkpoint"` a hint the first time a jump is needed ("Jump! Space").
   On `"arrived"`: both on the lookout, `friend.trick("spin")`, +25 %. Mechanic: movement and jumping.
5. Quest 2 — HIDE AND SEEK ("Find your friend ×3"): three rounds, spots drawn without repeat from
   `reeds, fallBehind, hollowLog, ferns, nest`. Each round: caption "Close your eyes… 3, 2, 1",
   `cinema.eye.close({ duration: 2.2, sway: 0.2 })` while `friend.do("hide", { spot })`, wait for
   `"hidden"`, `cinema.eye.open({ duration: 1.6, blinks: 1 })`. Hot/cold: the giggles get louder with
   proximity, and within 5 m a `fx.hearts` puff every 2 s. Within 1.4 m: `ui.setAction("Found you!")` →
   `friend.found()`. After the third: +25 %.
6. Quest 3 — FISH DIVE ("Catch 5 fish"): the friend `do("splash", poolCenter)` then swims along
   (`follow`). First time afloat: hint "Hold Space to dive". A fish is caught when the player is diving
   and within 0.45 m (`zoo.fish.nearest`) → `fish.catch(i)`, `platypus.eat()` (no lock), `audio.eat()`,
   `fx.bubbles`. Fish flee, so approach from behind/above. Counter in the quest text. +25 %.
7. Quest 4 — PLAY BALL ("Pass the ball 6 times"): `props.ball.place(ballSpot)`,
   `friend.do("playBall", { ball })`; walk into the ball to knock it toward Pip; each `"pass"` counts;
   if the ball rests for 6 s the friend `fetch`es it back. +25 % → friendship full.
8. BECOME FRIENDS (short unskippable 12 s `cinema.play`, `tint("warm")`): `friend.do("nuzzle")`,
   the player `platypus.nuzzle()` on `"nuzzled"`, `fx.hearts` ×3, `audio.friendship()`,
   `ui.banner("YOU ARE FRIENDS", "Your friend's name is Pip")`, `friend.setName("Pip")`.
9. Feeding: `zoo.setTime("noon", 20)`; `zoo.door.open(true)`, `crowd.staff[0]` (keeper) with
   `props.bowl.attach(handAnchor)` walks `doorOut → doorIn → bowl`, `kneel` (→ `bowl.attach(null)`,
   `bowl.place(P.bowl)`, `bowl.fill("yabby", 6)`), `wave`, leaves, door closes. Objective "Eat your
   breakfast": at the bowl `ui.setAction("Eat")`; each E = `platypus.eat()` + `player.lock` +
   `bowl.bite()` on `"bite"`; three presses; Pip `do("goto", bowlFriend)` and `eat()`s too.
10. Tricks school: Pip `do("sit", { at: showFriend })` after demonstrating; objective per trick:
    "Press 1 to SPIN" (Pip does it first: `friend.trick("spin")`), then 2 BACKFLIP, 3 TAIL STAND, then
    "Balance the ball: 4" (ball placed next to `showRock`), then hint about the water leap. The first
    trick makes the visitors gather; first coins fly in: hint "Walk over the coins to pick them up".
11. Show time: objective "Earn 30 coins"; free play with all tricks, combos, Pip mirroring
    (`friend.trick(name, 0.3)`). `ui.setCoins` visible since beat 10.
12. Ending (at 30 coins collected): `zoo.setTime("evening", 6)`, `crowd.react("cheer")`,
    `zoo.poster.setText("PLATYPUS TRICKS", "IN 2 DAYS")`. `cinema.play` (not skippable,
    `release: null`): over-shoulder of the two friends looking at the glass → push through to
    `posterClose` (5 s, `fov` 50 → 30) → hold 3 s → drift to `posterCam` framing both posters.
    Then: `ctx.pick.add(zoo.riddle.object, { onClick })` and, after 2.5 s, `ui.showHud(true)` with only
    `ui.setAction("Continue")`. Click on the riddle → `zoo.riddle.fall()`, when it has fallen a slow
    2 s push-in on the answer, hold 3 s → complete. Continue (E/tap) → complete. Completing:
    `cinema.fade("black", 1)` → `ctx.complete()`.

Skip points (`skipTo`): `"wake"`, `"cutscene"`, `"race"`, `"hide"`, `"dive"`, `"ball"`, `"friends"`,
`"feed"`, `"school"`, `"show"`, `"poster"`, `"done"`. `state()`: `{ step, friendship, coins, quest
counters, riddleFallen }`.

## C3. Level 3 — "ANOTHER DAY" (target 8–10 minutes)

All-new games. Trick slots: 1 Spin, 2 Backflip, 3 Roll (new), 4 Twirl leap (new); contextual: hoop
jump (new), water leap, ring leap. Time: morning → noon → golden evening. No eye-blink here.

1. Title card "LEVEL 3 — ANOTHER DAY"; fade in on `camNest`: both asleep in their own spots (player
   `nest`, Pip `lookout`), `zoo.setTime("morning")`; Pip wakes first, hops down, `nudge`s the player;
   `wakeStretch`. 12 s, skippable. Friendship meter shown full and labelled "Pip".
2. Quest 1 — BREAKFAST HUNT ("Sniff out 6 yabbies"): the keeper scatters breakfast (walks the bank
   tossing; `props.snacks.place(i, x, z, "yabby", true)` at 6 fixed spots: 2 in the sand bank, 2 in the
   stream shallows, 1 by the reeds, 1 under the log bridge). NEW MECHANIC — the bill's electro-sense:
   `ui.setAction("Sense")`; E → `platypus.zap()` pose reused without the pulse, `fx.senseRing` stretched
   toward the nearest buried snack, `audio.sensePulse(closeness)`; within 0.8 m the prompt becomes
   "Dig" → `snacks.reveal(i)`, `fx.sandPuff`, then "Eat" → `platypus.eat()`, `snacks.eat(i)`. Pip finds
   two of the six by itself if the player takes long (never the last one).
3. Quest 2 — TAG ("Tag Pip 3 times"): round A: Pip is it for 20 s (`do("chase", { role: "it" })`): a
   `"tag"` just makes both laugh and restarts the chase — no failing; then "You're it!": `role:
   "runner"`; get within `tagDist` (prompt-free, automatic) three times; after each tag Pip waits 2 s
   then runs again, and uses the pool on the third.
4. Quest 3 — BUBBLE TRAIL ("Swim through Pip's 8 bubble rings"): Pip dives a slalom through the pool
   leaving `fx.bubbleRing`s at 8 fixed poses (two near the surface, three mid-water, one through the
   `sunkenLog`, one at `poolDeep`, the last one up through `zoo.ring` — a ring leap). Each is a
   `props.hoop(pose)`; rings re-puff every 5 s; any order counts but the next one glows
   (`fx.sparkle`). At the end a shiny shell sits at `poolDeep` (`props.shinies`): grabbing it pays 10
   coins directly.
5. `zoo.setTime("noon", 15)`. Quest 4 — SYNCHRO PRACTICE ("Copy Pip: 3 rounds") at `showRock`: Pip
   performs a sequence (round 1: 3 tricks, round 2: 4, round 3: 5; drawn from the four slots), each
   announced with `ui.setTrickState(slot, { want: true })` + `ui.call(name)`; then "Your turn": repeat
   in order. A wrong key: `ui.flashTrick(slot, false)`, Pip shows the sequence again (no penalty).
   A perfect round pays 5 coins from the gathering visitors. This teaches Roll and Twirl leap and is
   the rehearsal for level 4.
6. HOOP: hint "Run and jump through the hoop!" — `props.hoop(zoo.hoop).passed(player…)` while airborne
   = "HOOP!" trick (4).
7. `zoo.setTime("evening", 30)`, `crowd.stroll(8)`. Show time: "Earn 50 coins" (bigger crowd, combos,
   Pip mirrors with a 0.3 s canon).
8. Dinner: keeper brings the bowl (`fill("worm", 6)`); eat together side by side; Pip `yawn`s.
9. Ending: `zoo.poster.setText("PLATYPUS TRICKS", "1 DAY LEFT")`; `cinema.play`: the two walk to the
   glass, look up; push-in to `posterClose`, hold 4 s; fade to black → `ctx.complete()`.
   (The riddle poster is back on the wall and is not clickable in this level.)

Skip points: `"wake"`, `"forage"`, `"tag"`, `"bubbles"`, `"synchro"`, `"show"`, `"dinner"`,
`"poster"`, `"done"`.

## C4. Level 4 — "THE SHOW" (target 6–7 minutes)

World `stage` (then `zoo` for the last minute). No quests list; excitement meter + combo + coins.
Trick slots (lanes): 1 Spin, 2 Backflip, 3 Roll, 4 Twirl leap (act 2 relabels them: 1 Tail splash,
2 Water leap, 3 Dive flip, 4 Ring leap).

1. Title card "LEVEL 4 — THE SHOW". Backstage: `stage.setCue("preshow")`, `audio.preShow(true)`,
   `audio.crowdBed(0.25)`, player and Pip at `tunnelStart`; Pip `nuzzle`s, `emote("call")`.
   Objective "Walk into the light" — the player walks the tunnel.
2. Entrance (at `tunnelMouth`, `cinema.play` 14 s, skippable): `setCue("entrance")`,
   `audio.crowd("roar", 1, false)`, `audience.setExcitement(0.7)`, crane `camCrane → camWide`, the
   banner, the big screen (`screen.setText("PLATYPUS", "TRICKS")`), both walk to `centre`/`friendMark`
   and `bow`. `audio.showMusic.start(112)`.
3. Rhythm rules: charts are arrays of `[beat, lane]`. A note is spawned `lead = 4 beats` early:
   `id = ui.beat.spawn(lane, lead × 60 / bpm)`. Judging uses the AUDIO clock
   (`audio.showMusic.beat()`), not the note's position: on `"trickN"` take the earliest unjudged note
   of that lane within ±0.30 s: |Δ| ≤ 0.11 s PERFECT (3 points, excitement +0.035), ≤ 0.24 s GOOD
   (1 point, +0.015), else / wrong lane / unpressed (0.30 s late) MISS (0, −0.03, combo reset; no
   harsher penalty). Every hit: `platypus.trick(name)` (cut short by the next), `ui.beat.resolve`,
   `ui.call` on PERFECT only, `audio.showMusic.sting`, Pip `trick(name, …)`. Combo counts consecutive
   hits (`ui.setCombo`); score multiplier ×2 at combo 8, ×3 at 16. Excitement drives
   `ui.setExcitement`, `audio.showMusic.setIntensity`, `audience.setExcitement`, `stage.setEnergy`,
   `audio.crowdBed`. Every time excitement crosses 0.5 / 0.75 / 1.0 upward:
   `props.coins.rain(player.x, player.z, 3, 12 | 20 | 30)` + `audience.wave()` + `fx.confetti`.
   Coins are collected by the magnet during the bows. The player cannot move during acts
   (`player.enabled = false`; the acts place both performers on marks).
4. Act 1 — WARM-UP (`setCue("show")`, 16 bars): 24 notes, one every 2 beats then every beat, lanes
   1–2 first, then all four. Pip performs in unison beside the player.
5. Act 2 — WATER (`setCue("water")`, both `walkTo` `poolEdge`, hop in; 16 bars): 30 notes with the
   water labels; lane 4 (Ring leap) notes send the performer through `hoops[0]`/`hoops[1]` alternately
   (the level moves the scripted player along an arc; `player.scripted`), with `fx.splash`.
6. Act 3 — DUET (`setCue("duet")`, back on the marks; 6 phrases): call and response. Pip plays a
   4-note phrase on beats 1–4 (the notes appear greyed on the track, labelled, `resolve`d as Pip hits
   them), the player echoes it on the next bar's beats 1–4. Phrases get denser (two contain
   off-beats). A fully PERFECT phrase: `audience.flashes(1)` for a bar.
7. Finale — THE FLAMING HOOP (`setCue("finale")`, `stage.setHoopFlame(true)`): both climb to
   `towerTop` (cutscene shot `camHero`). ONE big timed press: a drum roll, four notes on lane 4 on four
   consecutive beats — the fourth is the jump. Whatever the timing, the leap happens (timing only sets
   the bonus: PERFECT +30 coins, GOOD +15, else +5): `ctx.setTimeScale(0.25, 0.2)`, both arc through
   `hoops[2]`, `fx.confetti` from `cannonL/R`, `audio.crowd("roar", 1, false)`, splash into the pool,
   time back to 1.
8. Bows: `walkTo(bow)`, `platypus.trick("bow")`, coin rain, the magnet collects, results via
   `ui.banner(stars, "You earned N coins")` — stars: 1 always, 2 at ≥ 55 % of max points, 3 at ≥ 80 %.
   `audio.showMusic.stop(2)`, `audio.afterShow()`, `setCue("house")`.
9. Home (cutscene 25 s, skippable): fade to black, caption "Later that night…";
   `ctx.setWorld(zoo)`, `zoo.setTime("night")`, `audio.zooAmbience(true, "night")`; the keeper carries
   both back in through the door (`staff[0].carry(true)`, platypus on `carryAnchor`; Pip walks beside),
   sets the player down at `nest`; Pip climbs to `lookout`; they look at each other across the dark
   habitat (`lookAt`), Pip `yawn`s; each curls up in its OWN spot. Fade → `ctx.complete()`.

Skip points: `"backstage"`, `"entrance"`, `"act1"`, `"act2"`, `"act3"`, `"finale"`, `"bows"`,
`"home"`, `"done"`. `state()`: `{ step, score, maxScore, excitement, combo, coins, stars }`.

## C5. Level 5 — "THE HAPPIEST DAY" (day ≤ 10 minutes, then ~5 minutes of story and training)

Trick slots: 1 Spin, 2 Backflip, 3 Roll, 4 Twirl leap (+ contextual ball, hoop, water, ring).

PART A — the happiest day (free play; `zoo.setTime("noon")`, warm; `crowd.stroll(8)`).
1. Title card "LEVEL 5 — THE HAPPIEST DAY". Fade in: Pip is already bouncing at the nest mouth
   (`emote("call")`). Caption: "Today is going to be the best day ever."
2. THE JOY LIST — `ui.setQuests` with six joys, heading "Best day ever", ALL open at once, any order
   (free choice is what makes this day different). A `fx.ring` marks each unfinished joy's place; Pip
   `lead`s to the nearest unfinished one if the player idles 12 s. The day ends when 4 are done (the
   other two stay possible until bedtime); a full friendship meter labelled "Happiness" gains 1/6 each.
   - a. WATERFALL SLIDE ("Slide down the waterfall ×2") — new: climb to `fallTop`, `ui.setAction
     ("Slide!")`: the level takes the player (`player.scripted`) down the fall and along the stream
     into the pool on a spline in 2.6 s (`fx.wake`, `fx.splash`, `audio.splash(1)`), Pip right behind.
   - b. GOAL! ("Nose the ball through the hoop ×3") — new: dribble the ball through `zoo.hoop`
     (`props.hoop(zoo.hoop).passed(ball…)`); Pip passes it back each time; visitors cheer a goal.
   - c. TREASURE DIVE ("Find 5 shiny things") — `props.shinies` on the pool bed (one in the
     `sunkenLog`, one under the fall); Pip floats above the nearest one blowing `fx.bubbles`.
     Touch while diving = collect, 2 coins each.
   - d. DOUBLE ACT ("Earn 40 coins with Pip") — tricks for the visitors with Pip in perfect sync
     (`friend.trick(name, 0)`): a synchronised trick counts double base.
   - e. SUNBATHE ("Rest on the warm rock together") — at `sunRock`: hold E for 5 s (`ctx.input.held
     ("interact")`): both lie down, `tint("warm", 0.5)`, the camera drifts up and around, `audio.lullaby`
     for those seconds only. A quiet beat on purpose.
   - f. PICNIC ("Share the feast") — when any three joys are done the keeper brings a big bowl
     (`fill("yabby", 8)`); eat together, 4 bites.
3. Clock: at 7 minutes of play `zoo.setTime("evening", 40)` and Pip `yawn`s now and then; at 10
   minutes (or as soon as 4 joys are done and the player has had 30 more seconds) → Part B. Never
   show a timer.

PART B — bedtime.
4. `zoo.setTime("night", 12)`, `crowd.stroll(0)`, objective "Go to sleep next to Pip": Pip
   `do("sleep", { at: nestFriend })`; at the nest `ui.setAction("Sleep")` → the player curls up
   (`platypus.sleep(true)`), camera low and close on the two side by side for 5 s (the only time they
   sleep together), `audio.lullaby(true)`, then first person and `cinema.eye.close({ duration: 6 })`,
   `fade("black", 2)`, lullaby fades. Hold black 2.5 s in silence.

PART C — the alarm (one long `cinema.play`, NOT skippable the first time; skippable when
`progress.isBeaten(5)`). Restraint: no blood, no impact shown in close-up, nothing graphic.
5. `audio.alarm(true)`, `audio.panic(true)`, `zoo.setTime("alarm")`, `crowd.panic(true)`,
   `cinema.tint("alarm", 0.7)`. First-person at the nest: `{ eye: "open", tint: "alarm", blinks: 2,
   duration: 5 }`. Seen through the lids: red light sweeping, people running behind the glass, Pip
   awake and `"scared"`, pressed against the player.
6. Taken: `zoo.door.open(true)`; `staff[1]` and `staff[0]` hurry in (`walkTo(…, run)`); `staff[1]`
   `reach`es, then `carry(true)`: `player.scripted = true`, `platypus.pose("carried")`, model on
   `carryAnchor`. Over-the-shoulder shot (`track: staff[1].group, trackYaw: true`) looking BACK at
   Pip, who runs after them and is shut in by the door (`door.open(false)`). Caption: none.
7. Carried along `doorOut → outside → hallEnd` on the visitor side of the glass. Through the glass Pip
   races along inside, keeping level, to `leapFrom`.
8. The leap: `friend.glassLeap({ from: leapFrom, to: leapTo })`; on `"leap"`:
   `ctx.setTimeScale(0.12, 0.25)`, `audio.alarm(false)`; on `"glass"`: `zoo.glass.shatter(x, y)`,
   `audio.glassShatter(true)`, `cinema.shake(0.03, 0.6)`, camera side-on, wide, shards catching the
   red light; on `"landed"`: time scale back to 1 over 1.5 s, `audio.heartDrop()`,
   `cinema.tint("sad", 1)`, `crowd.panic(false)` (the hall has emptied).
9. Stillness: Pip lies still among the glass (`"still"`). The handler has stopped. First person from
   the carried player: Pip, small, not moving. `fx.sadMotes`. `audio.sadTheme(true)` after 3 s of
   silence. The player's paw reaches (`platypus` is first-person hidden; only the camera pushes in
   10 cm). Hold 7 s. Then the view is covered — `cinema.eye.close({ duration: 5, tint: "night" })` —
   "you are put to sleep". Black. `sadTheme` runs on for 4 s, then fades.

PART D — hope.
10. Still black: `ctx.setWorld(lair)` (behind black), `lair.setVoid(true)`, `lair.setGlow(0)`. The
    wizard (`getWizard(ctx)` from `common.js`, added to `lair.group` at `P.wizard`) appears in the dark
    lit only by his crystal: `wizard.appear()`, `audio.wizardAppear()`, `audio.wizardMotif()`,
    `fade("clear", 2)` on `camWizard`. `cinema.caption("There is still hope. The platypus will
    survive.", 6, { who: "Wizard Wobble" })` with `wizard.setTalking` and `audio.wizardBlip`s.
11. The reveal: `lair.setVoid(false)`, `lair.setGlow(1, 4)`, `audio.lavaRumble(0.7)`. One continuous
    crane (`camRise0 → camTimer`, 7 s): up past the chains to the timer — `lair.timer.setText("8 DAYS")`,
    `audio.timerTick()` — hold 3 s; cut to `camCell`: Pip inside the cell (`friend.attachTo
    (lair.cell.floor)`), curled, BREATHING; an ear/bill twitch; `audio.chainCreak()`,
    `cell.sway(0.3)`; cut to `camLava` looking up past the lava at the tiny cell. Caption (narr):
    "Eight days."

PART E — training on the ledge (`camTrain` → release to the follow camera; `player.scripted = false`,
`player.teleport(P.spawn)`, HUD on, `ui.setAbilities({ slap: true, hold: false })`, speech bubbles via
`ui.say` with `ctx.setSpeaker(wizard.group)`).
12. TAIL SLAP: "Your tail is as hard as wood. SLAP that dummy!" — `getDummy(ctx, 0)` at `P.dummy`.
    Objective "Tail Slap the dummy 0 / 3" (L / Slap button; left click also works). `"tailSlap"`:
    `platypus.tailSlap()`, `player.lock = 0.7`, 0.9 s cooldown (`ui.setCooldown("slap", …)`); at
    `slapHitTime`, if the dummy is within 1.3 m behind-or-beside: `dummy.hit(dx, dz, 1.6)`,
    `fx.slapRing`, `audio.tailSlapHit()`, `cinema.shake(0.015, 0.2)`; a miss plays `audio.tailSlap()`
    only. The third hit: `dummy.defeat()`.
13. HOLD: `ui.setAbilities({ slap: true, hold: true })`, `props.cushion.place(P.cushion)`.
    "Now HOLD. Pick up that little cushion." Objective "Pick up the cushion" (H / Hold button near
    it): `cushion.pickUp(platypus.holdAnchor)`, `platypus.setCarry(true)`, `player.carrying = true`,
    `player.maxSpeed = 2`, `ui.setHolding(true)`, `audio.pickup()`. Then "Carry it to the glowing
    ring and drop it" (`fx.ring` at `P.dropRing`; H again → `cushion.drop()`), then a fresh dummy
    stands up (`dummy.reset()`): "Pick it up again and THROW it at the dummy" — while holding,
    `"primary"` (left click / J) or the Slap button throws: `platypus.throwAnim()`,
    `cushion.throwAt(toward the dummy)`, `hitTarget` = the dummy → `dummy.hit`, `audio.cushionHit()`.
    A miss: the wizard chuckles, try again (the cushion can always be picked up again).
14. Wizard: "Eight days, little one. We begin tomorrow." `wizard.gesture("cast")`. The player turns to
    look up at the cell (`cam.yaw` toward it, slow). `cinema.endCard("TO BE CONTINUED", { hold: 4 })`
    → `ctx.complete()`.

Skip points: `"day"`, `"bedtime"`, `"alarm"`, `"taken"`, `"leap"`, `"still"`, `"wizard"`,
`"reveal"`, `"slap"`, `"hold"`, `"end"`, `"done"`. `state()`: `{ step, joys: [bool ×6], coins,
slaps, cushion: props.cushion.state }`.

--------------------------------------------------------------------------------------------------

# Part D — performance (Intel UHD 620, 60 fps at 1280×720; whole frame < 150 draw calls, < 250k tris)

Measured today: level 1 runs 22 draw calls / 156k triangles at 60 fps; the engine + player alone are
8 calls / 40k. The directional shadow pass DOUBLES the cost of everything that has `castShadow`:
only characters, the ball/cushion/dummy and a handful of big rocks cast; terrain, water, plants,
visitors, audience, glass, posters, lava and the cell do not (rocks and plants get baked/painted
contact shade instead).

Budgets (visible at once, including shadow-pass draws):

| part | draw calls | triangles |
|---|---|---|
| player platypus | ≤ 12 | ≤ 30k |
| friend | ≤ 12 | ≤ 30k (shares geometry) |
| zoo (terrain, rocks, water, plants, glass, hall, sky, fish) | ≤ 45 | ≤ 90k |
| visitors | ≤ 8 | ≤ 14k |
| one staff member (two only during the level-5 abduction, when the crowd is running off) | ≤ 16 | ≤ 20k |
| props + fx | ≤ 12 | ≤ 12k |
| stage (incl. spot cones, screen, banners) | ≤ 35 | ≤ 60k |
| audience | ≤ 2 | ≤ 28k |
| lair (cavern, lava, cell, chains, timer) | ≤ 25 | ≤ 60k |
| wizard / dummy (level 5 training) | ≤ 14 / ≤ 6 | ≤ 20k / ≤ 6k |

Per level, what is visible when:
- Level 2/3: zoo + two platypuses + visitors (≤ 9 / ≤ 12 watching) + props. The keeper is only present
  during feeding (send the visitors strolling, not gathered, while he is in). Foliage: instanced cards
  with alpha TEST (no blending, no sorting); reeds/ferns sway in the vertex shader. Water: one mesh for
  pool + stream, the waterfall one scrolling-texture strip + `fx.splash` at its foot. Fish: one
  instanced mesh. The visitor hall behind the glass is a few flat-lit boxes. Glass: one transparent
  quad per pane row, `depthWrite: false`, fresnel streaks only (no real reflection).
- Level 4: stage + audience + two platypuses + props/fx; NO visitors, no zoo until the last minute
  (the world switch happens behind black; the stage group leaves the scene). Spot cones are 4 additive
  open cones + 4 floor discs; confetti ≤ 300; coin rain ≤ 48 coins.
- Level 5 day: as level 2 with up to 14 visitors; evening/night presets must not add cost.
  Abduction: crowd panicking (same instances), two staff, both platypuses, glass shards (≤ 60 quads) —
  during the slow-motion shot the frame is dominated by fill rate through the tint overlay and glass:
  keep the camera wide, and note CSS blur on the canvas is used ONLY during the few seconds of an eye
  blink. Lair: cavern + lava + cell + wizard + player + dummy + friend-in-cell; the lava plane is the
  biggest fill-rate item — keep its fragment shader to two texture lookups and no loops, and keep heat
  shimmer cards small (they are overdraw).
- World switches (`ctx.setWorld`) compile that world's shaders on first activation: always behind
  black. Never toggle `castShadow`, add/remove lights, or change a material's `defines`/`transparent`
  at runtime (each recompiles). Canvas textures (posters, timer, big screen) redraw only inside their
  `setText` calls. Time-of-day changes go through `ctx.setEnv` (uniform updates only).
- `ctx.setTimeScale` slows the simulation, not the renderer: slow motion costs nothing extra.
