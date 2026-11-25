# ADVENTURE CUBE - module contract

A 2D side-scrolling platformer through a **realistic forest**, served statically at `platyfy.com/adventure-cube/`
(GitHub Pages, repo `C:\Users\krist\Desktop\BossGauntlet`, folder `adventure-cube\`). The player is a **cube with a face**.
Main game: **Area 1** (sunny forest, easy), **Area 2** (misty golden-hour highlands, harder), **Area 3** (stormy night
peaks, very very hard). **Build mode**: build levels, publish them, play other people's levels. Every level gets an AI
difficulty **1-10** (1 = easy, 5 = hard, 10 = impossible = the AI could not beat it). Music: 3 area songs + 5 extra
songs; builders can pick any of the 8.

This file is the source of truth. If something you need is missing, make the **smallest compatible addition** inside
files you own, and write it in your final summary under "contract changes". Never edit files you do not own.

---------------------------------------------------------------------------------------------------------------------

## 0. Hard rules (everyone)

- Plain ES modules, **no build step, no npm runtime deps, no external assets, no CDNs**. Everything procedural
  (canvas drawing, WebAudio synthesis). Relative URLs only (the game lives under the `/adventure-cube/` subpath).
- `adventure-cube/package.json` has `"type": "module"`: every `.js` under `src/` is an ES module in Node too.
- Every file you write must pass `node --check <file>`.
- **Sim code (`src/sim/*`) is DOM-free and deterministic.** Anything else that must run in Node or a Worker
  (`src/ai/*`, `src/levels/*`, `src/audio/format.js`, `src/audio/songs/*`) must also be DOM-free.
- **Performance target: Intel UHD 620, 8 GB RAM, 60 fps at 1280x720** (and phones). Bake expensive art into offscreen
  canvases once; never animate `ctx.filter` blur radii; no full-screen `'lighter'` composites per frame; no full-frame
  blur passes per frame; no per-frame allocation in hot paths; no per-frame `createLinearGradient` of big areas
  (cache them).
- **Browsers: at most ONE headless browser on the machine at a time.** Anyone launching puppeteer
  (`C:\Users\krist\Desktop\BossGauntlet\node_modules\puppeteer`) must wrap it in `tools/browserlock.cjs`
  (`await lock.acquire("who"); try { ... } finally { await browser.close(); lock.release(); }`), run it in the
  foreground, and close it. AREA*, MUSIC_*, RATER and ONLINE should not need a browser at all.
- Python is not installed; use Node for scripts. Use Bash (Git Bash) for shell. Do **not** commit or push.
- Original work only: no characters, levels, art or music copied from existing games.
- Do not put user-facing text in a way that breaks at phone width (390 px wide). 16 px side gutter minimum.

## 1. Files and ownership

| Path (under `adventure-cube/`) | Owner | Notes |
|---|---|---|
| `CONTRACT.md` | FOUNDATION (frozen) | additions: write them in your summary |
| `src/sim/constants.js`, `level.js`, `path.js`, `sim.js`, `index.js` | FOUNDATION (frozen) | physics + format. Bugs: report, do not edit |
| `src/levels/kit.js`, `src/levels/test.js`, `src/levels/index.js` | FOUNDATION (frozen) | helpers, test level, area registry |
| `src/levels/area1.js` | **AREA1** | level data only (default export) |
| `src/levels/area2.js` | **AREA2** | level data only |
| `src/levels/area3.js` | **AREA3** | level data only |
| `src/render/**` (`renderer.js`, `camera.js`, any new files) | **RENDER** | all drawing; keep the API in section 5 |
| `src/audio/engine.js`, any new `src/audio/*.js` except `format.js` | **MUSIC_A** | engine + SFX |
| `src/audio/songs/area1.js`, `area2.js`, `area3.js` | **MUSIC_A** | the 3 area songs |
| `src/audio/songs/campfire.js`, `rapids.js`, `aurora.js`, `thunderdrum.js`, `moonlit.js` | **MUSIC_B** | 5 custom songs |
| `src/audio/format.js`, `src/audio/songs/index.js` | FOUNDATION (frozen) | song format + registry |
| `src/builder/**` (`editor.js`, `browse.js`, any new files, builder css) | **BUILDER** | editor, publish flow, community browser |
| `src/ai/**` (`rater.js`, `rater-worker.js`, `rate-client.js`, new files), `tools/rate.mjs`, `tools/rater-fixtures/**` | **RATER** | AI player + 1-10 rating |
| `src/online.js`, `src/online-config.js`, `ONLINE-API.md` | **ONLINE** | shared levels / names / times |
| `src/main.js`, `src/game.js`, `src/input.js`, `src/ui/**`, `index.html`, `style.css`, `tools/playtest.cjs`, the hub card in `../index.html` | **INTEGRATE** (later) | foundation versions exist and work now |
| `tools/simtest.mjs`, `tools/fuzz.mjs`, `tools/levelcheck.mjs`, `tools/songcheck.mjs`, `tools/browserlock.cjs` | FOUNDATION | anyone may run them |

Everything listed for a later owner already has a **working placeholder**, so the game runs end to end today:
`title -> areas -> play -> win -> leaderboard`, `builder (stub)`, `browse (stub)`.

## 2. Tools

```
node tools/simtest.mjs                 # 39 sim/format tests + measured physics facts (must stay green)
node tools/fuzz.mjs 7 [ceil]           # random slopes/steps/ceilings + random inputs: no overlaps, no fall-through
node tools/levelcheck.mjs area2 --ascii --rate   # validate + map + AI rating of a level module (or a .json file)
node tools/songcheck.mjs [ids...]      # validate songs against the format
node tools/playtest.cjs [--phone]      # browser smoke test (takes the browser lock), screenshots -> tools/shots/
```
`tools/shots/` and `tools/.browser.lock` are git-ignored.

---------------------------------------------------------------------------------------------------------------------

## 3. Simulation (`src/sim/*`, frozen)

`import { createSim, T, IN_LEFT, IN_RIGHT, IN_JUMP, ... } from "./sim/index.js"` (re-exports constants, level, path, sim).

### 3.1 Units
- World units are **pixels at zoom 1**, **+y is down**. One tile **T = 32 px**. Tile `(tx, ty)` covers
  `[tx*32, tx*32+32) x [ty*32, ty*32+32)`.
- Fixed step **60 Hz** (`FPS = 60`, `STEP_MS = 16.67`). Velocities are px/step. No real time inside the sim.
- Determinism: only `+ - * /`, `Math.floor/abs/min/max/sqrt` (IEEE exact). No trig, no `Math.random`, no Date.
  The same inputs give bit-identical states in Chrome, Firefox, Safari, Node and Workers.

### 3.2 Input
One byte per step: `IN_LEFT = 1`, `IN_RIGHT = 2`, `IN_JUMP = 4` (OR them). Jump is edge-triggered inside the sim
(holding jump does not re-jump; holding it longer gives a higher jump).

### 3.3 API
```js
const sim = createSim(level, { events: true });  // events:false = faster, no event objects (AI)
sim.step(bits)        // advance one frame; returns sim.state
sim.state             // live state (same object forever). READ ONLY for everyone but the sim.
sim.events            // array of events produced by the LAST step() (cleared at the start of each step)
sim.snapshot()        // -> plain object copy of all mutable state (~100k/s)
sim.restore(snap)     // rewind exactly; snap stays reusable
sim.reset(cp = -1)    // frame 0, deaths 0, spawn at start (or at checkpoint index cp, already activated)
sim.run(inputs)       // feed a Uint8Array/array of bytes; stops at win
sim.level             // the normalized level; sim.compiled = { level, W, H, grid, crumbles, springs, movers, hazards, pulses }
sim.W, sim.H, sim.grid// width/height in tiles; Uint8Array tile codes, index y*W+x
sim.tileAt(tx, ty)    // code; outside left/right = ROCK (solid walls), above top / below bottom = EMPTY
sim.spawnPoint(cp)    // {x, y} player top-left for checkpoint index (or -1 = start)
sim.moverPos(i, f, out)   // top-left px of compiled.movers[i] at frame f (fractional f interpolates)
sim.hazardPos(i, f, out)  // CENTER px of compiled.hazards[i] at frame f
sim.pulsePhase(i, f)      // (f + offset) % period for compiled.pulses[i];  sim.pulseActive(i, f)
sim.nearestHazard(maxPx = 96) // px from player center to the nearest deadly thing, or Infinity (for the face)
sim.solidRectHit(l, t, r, b)  // any solid tile/intact crumble overlapping that rect
```
Entity positions are pure functions of the frame. State frame `f` means "after f steps"; positions to draw at
interpolation `alpha` are at frame `f - 1 + alpha`. `compiled.movers/hazards/pulses/crumbles/springs[i].ei` is the
index of the entity in `level.entities`.

### 3.4 State fields (`sim.state`)
`frame, x, y` (player AABB top-left px), `vx, vy, grounded, gnd` (tile code under the player; 1 for crumbles,
3 for movers), `ride` (mover index or -1), `gcr` (crumble index or -1), `coyote, buffer, held, springing,
facing` (1 or -1, last pressed direction), `dead, deadT` (frames left in the death pause), `deathCause`
(`"spike"|"water"|"pit"|"hazard"|"pulse"|"crush"`), `deaths, cp` (active checkpoint index, -1 = start), `won,
winFrame` (frame count at the moment of winning = the official time), `airT` (frames since last grounded),
`lastIn` (last input byte), `crumble` (Int32Array per crumble: `0` intact, `1..32` shaking, `<0` broken).

### 3.5 Events (`sim.events`, each `{ type, x, y, a, frame }`; x,y = player center)
`jump` · `land` (a = impact vy, 0.6..10.5) · `bonk` (head hit ceiling) · `spring` (a = spring index) ·
`die` (a = cause) · `respawn` (a = checkpoint index) · `checkpoint` (a = index) · `win` (a = frame) ·
`crumble` (a = crumble index, started shaking) · `crumble_break` (a) · `crumble_back` (a, respawned).

### 3.6 Physics (constants in `constants.js`; facts MEASURED by `tools/simtest.mjs`)
- Player AABB **26 x 26 px** (fits 1-tile tunnels). Run max **3.5 px/step = 6.56 tiles/s**, full speed in 10 steps.
  Ground accel 0.35 / decel 0.5 / turn 0.8. Air accel 0.25 / drag 0.06 / turn 0.35. Ice accel 0.07 / decel 0.025.
- Jump `vy = -9.4`; gravity 0.48 rising while jump held, 1.3 rising after release (variable height), 0.62 falling,
  max fall 10.5. **Full jump: 87 px = 2.73 tiles high** (clears a 2-tile wall, never a 3-tile wall), 36 frames of air.
  **Tap jump: 35 px (~1.1 tiles).**
- **Max gap at full speed: 5 tiles on flat** (frame-perfect edge jump), 4 tiles onto a ledge 1 or 2 tiles higher.
  Comfortable gaps: 3 tiles (easy), 4 (needs a running jump).
- Coyote time 6 frames; jump buffer 6 frames.
- Spring (mushroom) `vy = -14.5 * p`: **p = 1 launches ~6.6 tiles high**; height scales with p^2 (p 0.6..1.6 gives
  ~2.4..17 tiles). Spring bounces only when the player comes DOWN onto its cap (it is not solid; walking into it
  from the side does nothing). Holding jump does not matter during a spring launch.
- Ice: stopping from full speed slides ~164 px (5 tiles) vs 10 px on normal ground.
- Ledge forgiveness: lips up to `STEP_UP = 8` px are stepped onto automatically (slope seams, grazing a ledge corner
  while falling). Head-bump corner correction nudges up to 6 px sideways.
- Death: 40-frame pause, then respawn at the active checkpoint with zero velocity; all crumbles reset; the clock keeps
  running (deaths cost time). Falling below the level bottom = `pit` death. The level has solid walls left and
  right; the top is open (you can jump above row 0; nothing up there is solid).

### 3.7 Collision rules (exact)
1. Horizontal move, then vertical move, each step.
2. **Full solids** `# R W I` and intact crumbles block on all sides (axis-separated). Not blocked if the obstacle's
   top is within 8 px above the player's feet and there is room above it (step-up).
3. **Slopes** `/ \ a b c d`: only their **top surface** is solid (ground snapping keeps the feet on it). Their high
   vertical edge acts as a wall when approached from the high side; from the low side you walk up. A slope is
   one-way from below (you can jump up through a floating slope tile). **Always put solid ground under slope tiles**
   (`kit.slopeUp/slopeDown/gentleUp/gentleDown` do this). The cube's feet rest on the highest surface under its
   26-px width (on a ramp the cube rests on its uphill corner; RENDER may tilt the cube visually).
4. Grounded players stick to ground up to 10 px below (walking down 45-degree ramps at full speed never goes airborne).
5. One-way `-` and movers: land on them from above only (feet were at or above the top last step); jump up through
   them. There is no drop-through.
6. Movers carry the rider (rider moves with the mover's delta; carried into a wall = blocked; squeezed into a solid
   = `crush` death). Movers are never solid from the side or below.
7. Hazards use a hurt box inset 3 px from the player box. Spike hit rects (tile-local px): `^` [4,14]-[28,32],
   `v` [4,0]-[28,18], `<` [14,4]-[32,28], `>` [0,4]-[18,28]. Water `~` kills when the hurt box overlaps the tile
   below 10 px from its top (top tile of a water column) or anywhere (water tiles under water). Moving hazards are
   circles (radius `r` tiles). Pulses kill while active over their whole rect.
8. Checkpoint trigger: x in `[x*32+4, x*32+28)`, y covering the flag cell and the cell above. Checkpoints activate
   in order of x only forward (index > current). Goal trigger: the goal cell plus 2 cells above it (3 tiles tall).

---------------------------------------------------------------------------------------------------------------------

## 4. Level format (one format for the main areas and community levels; `src/sim/level.js`, frozen)

```js
{
  v: 1,                          // LEVEL_VERSION
  name: "Sunlit Forest",         // <= 40 chars
  author: "",                    // <= 24 chars (builder fills the player's name)
  theme: "forest",               // "forest" | "highlands" | "storm"
  music: "area1",                // one of the 8 music ids (section 6)
  w: 300, h: 30,                 // tiles. Must equal row length / row count.
  tiles: ["....", ...],          // h strings of w chars (codes below). Row 0 is the TOP.
  start: { x, y },               // integer tile cell the player spawns in (feet on the top of cell y+1)
  goal:  { x, y },               // integer tile cell of the goal flag's base (trigger is 3 cells tall)
  checkpoints: [{ x, y }, ...],  // flag cells; normalized/sorted by x; activation is forward-only
  entities: [ ... ],             // see 4.2
}
```
Packed for sharing: `packLevel(level)` -> JSON string where `tiles` is replaced by `rle` (each row run-length encoded,
e.g. `"40.3#"`). `unpackLevel(stringOrObject)` accepts packed or plain. `levelHash(level)` = 8-hex FNV of the packed
form. `normalizeLevel(level)` fills defaults (returns a new object). `emptyLevel({w,h,theme,music,name})` makes a
valid blank level. `compileLevel(level)` -> runtime data (grid etc.).

`validateLevel(level, { community })` -> `{ ok, errors[], warnings[] }`. Limits (`LIMITS`): w 16..1500 and h 12..80,
<= 600 entities, <= 40 checkpoints; **community levels: w <= 400, h <= 48, <= 300 entities, <= 12 checkpoints**.
start/goal/checkpoints must be integer cells inside the level and not inside solid/hazard tiles.

### 4.1 Tiles (char -> code = index in `TILE_CHARS = ".#RWI-/\\abcd^v<>~B"`)

| char | name | behaviour | look (RENDER decides details per theme) |
|---|---|---|---|
| `.` | EMPTY | air | |
| `#` | GROUND | solid | soil/earth; grass/moss/snow cap when the tile above is not solid |
| `R` | ROCK | solid | stone, boulders, cliff faces |
| `W` | WOOD | solid | fallen logs, stumps, planks |
| `I` | ICE | solid, slippery | ice / frozen stone |
| `-` | ONEWAY | land from above only | branch, thin root, rock shelf, wooden ledge |
| `/` | SLOPE_R | 45 deg, rises to the right | hillside |
| `\` | SLOPE_L | 45 deg, rises to the left | (in JS strings write `"\\"`) |
| `a` `b` | gentle up | 22.5 deg rising right; `a` = lower half (0->16 px), `b` = upper half (16->32) | always as the pair `ab` |
| `c` `d` | gentle down | 22.5 deg falling right; `c` = upper half (32->16), `d` = lower (16->0) | always as the pair `cd` |
| `^` `v` `<` `>` | SPIKES | deadly; `^` on floors, `v` hanging, `<` on a wall's left face, `>` on a wall's right face | thorn brambles / sharp rocks / icicles (storm) |
| `~` | WATER | deadly | streams, ponds, rapids (animated surface) |
| `B` | BACK | not solid, decoration | dark rock / cave wall / tree trunk behind the play layer |

### 4.2 Entities (`{ t, x, y, ... }`, x/y in tiles; defaults in brackets)

| t | fields | behaviour |
|---|---|---|
| `crumble` | integer `x,y`, `w` [1] 1..8 | solid block row (1 tile tall). Standing on it: shakes 32 frames, breaks, returns after 150 frames (not while you are inside it). Resets on death. |
| `spring` | integer `x,y`, `p` [1] 0.6..1.6 | mushroom in cell (x,y) standing on the ground below; cap top at y*32+14. Bounce when landing on it. |
| `mover` | `x,y` anchor, `w` [3] 1..8 tiles wide, `kind` [`log`] (`log|plank|stone|leaf`), `path` [[dx,dy],...] [], `speed` [2] tiles/s 0..12, `mode` [`ping`] (`ping|loop`), `phase` [0] 0..1 | one-way platform, top edge at the anchor y*32 (+path offset), w*32 wide. Draw ~16 px thick. |
| `hazard` | `x,y`, `r` [0.45] 0.2..2 tiles, `kind` [`thornball`] (`thornball|boulder|wasp|spark`), `path`, `speed`, `mode`, `phase` | deadly circle centered at ((x+0.5)*32, (y+0.5)*32) + path offset. Static if path is []. |
| `pulse` | integer `x,y,w,h` [1,1] 1..16, `kind` [`lightning`] (`lightning|geyser|steam`), `period` [180] 30..900 frames, `on` [30] 1..period-1, `offset` [0] | deadly rect while `(frame + offset) % period < on`. Renderers telegraph it during the last `PULSE_WARN = 45` frames before it fires. |
| `sign` | integer-ish `x,y`, `text` <= 60 chars | decoration with readable text (tutorial hints) |
| `deco` | `x,y`, `kind` (`oak pine birch deadtree bush fern flowers mushrooms stump boulder grass reeds lantern cairn bones crystal`), `s` [1] 0.5..2, `layer` [`back`] (`back|front`) | pure decoration, ignored by the sim. Base sits on the bottom of cell (x,y). `front` draws over the player. |

Paths: the anchor is the first point; `path` lists further points as tile offsets from the anchor (<= 8 points,
|offset| <= 64). `ping` goes back and forth along the polyline; `loop` returns straight from the last point to the
anchor. Constant speed along the path. `phase` shifts the start by that fraction of a full cycle.

---------------------------------------------------------------------------------------------------------------------

## 5. Rendering (RENDER owns `src/render/**`)

### 5.1 Renderer API (frozen; the placeholder implements all of it)
```js
import { createRenderer } from "./render/renderer.js";
const r = createRenderer(canvas);     // owns canvas.getContext("2d"); nothing else draws on the game canvas
r.resize(cssW, cssH, devicePixelRatio)// main calls on resize. Cap the backing store at dpr 2 (lower on weak GPUs is fine)
r.setLevel(level)                     // (re)build everything for this level (bake terrain, parallax, decor). Called on
                                      // entering play, on entering the builder, after theme/size changes. <= ~150 ms.
r.updateTiles(level, x0, y0, x1, y1)  // builder edited tiles in that inclusive rect of `level` (the builder's live
                                      // object); re-bake just that region. Must be cheap (< 4 ms for a few tiles):
                                      // the builder calls it while the pointer drags.
r.frame(view)                         // draw one frame (see view below)
r.drawThumb(ctx2d, item, x, y, size, theme) // palette icon: item = {tile:'#'} | {entity:'spring'|'mover'|...,
                                      // kind?} | {marker:'start'|'goal'|'checkpoint'}; draws into ANY 2D context
r.setQuality("high" | "low")          // optional auto/manual quality switch (RENDER may auto-drop on slow frames)
r.level                               // the level the renderer currently has (the normalized copy from setLevel)
r.onFlash = null                      // settable: the renderer calls onFlash(strength) on storm background lightning
```
`view` (built fresh by the caller each frame; treat as read-only):
```js
{
  mode: "play" | "edit" | "menu",   // menu = attract background behind the title (no player)
  level,        // play/menu: the level being shown. edit: the builder's LIVE level object -> in edit mode draw
                // entities, start, goal, checkpoints from view.level every frame (they change); tiles come from
                // your baked copy kept current via updateTiles/setLevel
  sim,          // play: the createSim instance (read sim.state, sim.compiled, helpers). edit/menu: null
  frame,        // play: sim.state.frame. edit/menu: a free-running 60 Hz counter (animate movers/pulses previews)
  alpha,        // 0..1 interpolation between the previous and current sim frame (draw entities at frame-1+alpha)
  prev,         // play: {x, y} player top-left at the previous sim frame (lerp to state.x/y with alpha). else null
  camera,       // createCamera() object: {x, y, zoom, viewW, viewH, halfW, halfH, shake}
  time, dt,     // real seconds since page load / since the last frame (ambient animation: wind, rain, water)
  events,       // sim events since the last frame() (land dust, jump puffs, splash, death burst, checkpoint
                // sparkle, spring boing, crumble debris, win confetti...). [] when none
  editor,       // edit mode: { grid: bool, hover: {tx, ty, w?, h?} | null, ghost: {tile: ch} | {entity: {...}} | null,
                //   selected: entity index | -1, showPaths: bool, tool: string, rect: {x0,y0,x1,y1} | null,
                //   marker?: "start"|"goal"|"checkpoint" }. Otherwise null.
}
```

### 5.2 Camera (`src/render/camera.js`, RENDER owns, API frozen)
`createCamera()` -> `{ x, y, zoom, viewW, viewH, halfW, halfH, look, shake, setViewport(w,h), fitZoom(), clamp(level),
follow(level, px, py, vx, dt), snap(level, px, py), pan(dxCss, dyCss), zoomAt(factor, sx, sy), screenToWorld(sx, sy),
worldToScreen(wx, wy) }`. `x,y` = world px at the screen center; `zoom` = CSS px per world px. Play mode shows about
14 tiles on the shorter screen side. Each screen owns its own camera object. RENDER may tune follow feel, add
vertical look-ahead, screen shake on death (set `camera.shake`), and portrait-phone framing (keep the ground above the
touch buttons: about 110 CSS px at the bottom are covered by them on phones).

### 5.3 What it must look like
"The best realistic graphics possible" in 2D canvas, at 60 fps on a UHD 620:
- **forest** (Area 1): sunny late-morning forest. Deep layered parallax (4-6 baked layers: distant hazy hills, far
  tree line, mid trees with trunks and canopy masses, near bushes), volumetric god rays (baked gradient shafts,
  slowly swaying via transform/alpha only), dappled light, rich soil with roots/pebbles strata, lush grass tops with
  blades, ferns, flowers, mossy rocks, bark-textured logs, clear sparkling streams with animated surface, floating
  pollen/dust motes, butterflies.
- **highlands** (Area 2): golden hour mountain forest. Warm low sun, long shadows, mist banks between ridges, rocky
  cliffs with strata and lichen, pines and birches, waterfalls/rapids, drifting fog layers, birds in the distance.
- **storm** (Area 3): stormy night peaks. Dark blue-violet palette, rain (pooled particles), wind-bent dead trees,
  wet rock highlights, snow/ice caps, lightning flashes that light the scene for a few frames (baked flash overlay +
  alpha, NOT a full-screen lighter pass every frame). The renderer has a settable callback `r.onFlash = null`; it
  calls `r.onFlash(strength 0..1)` when a background lightning flash happens so the play screen can play thunder
  (`app.audio.sfx("thunder")`). RENDER never touches audio itself. Pulses of kind `lightning` must strike visibly with a warning glow first.
- Terrain must be auto-detailed from the tile grid: grass/moss/snow caps on exposed tops, smooth slope surfaces,
  rounded edges, darker soil deeper down, rock tiles as natural stone, ambient occlusion where solids meet. Bake
  terrain in chunks (e.g. 16x16 tiles) to offscreen canvases; re-bake only touched chunks in `updateTiles`.
- Automatic decoration (seeded from `levelHash`, deterministic) on top of any `deco` entities: trees, bushes, grass
  tufts, flowers, rocks, so community levels look rich without effort.
- **The player cube**: a soft, slightly rounded cube with a material (painted wood/clay look, subtle bevel, light
  from the theme's sun direction, contact shadow). An expressive **face**: big eyes that look in the movement
  direction and toward the next hazard, blink every few seconds, squint on landing, **squash & stretch** (stretch on
  jump, squash on land scaled by `land` impact), **worried** brows/mouth when `sim.nearestHazard(96)` is small,
  surprised "O" mouth while falling fast, dizzy X eyes on death (then a puff of leaves/debris), happy closed-eye smile
  and a hop on the goal, determined look while running. Tilt with the slope it stands on.
- Entities: crumble = cracked stone/earthy slab that shakes (state value 1..32) and breaks into debris; spring = big
  red/orange spotted mushroom that squashes when bounced; movers = log / plank / stone slab / giant leaf per `kind`;
  hazards = rolling thorn ball / boulder / buzzing wasp / electric spark per `kind`; pulses = lightning bolt / water
  geyser / steam vent per `kind`; checkpoint = wooden post with a cloth flag that lights up and waves when active;
  goal = a tall banner/arch with a glow; signs = wooden signboards with readable text.
- Edit mode: same world look plus the overlay: grid (subtle), level bounds, hover cell outline, ghost preview of
  the brush, mover/hazard paths drawn as dotted lines with arrows, start marker (a ghost cube), selection outline.
- Particles: one pooled particle system (no allocation per particle per frame), budget ~400 live particles.
- Interpolate the player and entities with `alpha` so 120/144 Hz displays look smooth.

---------------------------------------------------------------------------------------------------------------------

## 6. Audio

### 6.1 Song registry (`src/audio/songs/index.js`, frozen)

| id | title | owner | mood |
|---|---|---|---|
| `area1` | Sunlit Canopy | MUSIC_A | bright, hopeful acoustic-folk morning in a sunny forest; light and bouncy, ~108 bpm |
| `area2` | Golden Ridge | MUSIC_A | adventurous, climbing, misty highland cliffs at golden hour; building momentum, ~124 bpm |
| `area3` | Thunder Peaks | MUSIC_A | intense, driving, dangerous; stormy night summit with rain and lightning, ~150 bpm |
| `campfire` | Campfire Tales | MUSIC_B | warm, cozy, relaxed; plucked strings and soft hand percussion, ~84 bpm |
| `rapids` | Rapids Run | MUSIC_B | energetic, upbeat, splashy; a fast chase down a river, ~140 bpm |
| `aurora` | Aurora Drift | MUSIC_B | dreamy, floating, shimmering; ambient pads and bells under northern lights, ~90 bpm |
| `thunderdrum` | Thunderdrum | MUSIC_B | heavy, tribal, powerful; big taiko-style drums and low brass-like synths, ~128 bpm |
| `moonlit` | Moonlit Hollow | MUSIC_B | mysterious, gentle nocturne; sparse piano-like bells, owls and fireflies, ~96 bpm |

`SONGS` (array of `{id, title, mood, main}`), `SONG_IDS`, `songInfo(id)`, `loadSong(id)` -> Promise<song>.
Each song file `src/audio/songs/<id>.js` does `export default { ...song }` (pure data, no imports, no functions).
Titles in the files may differ from the table; the ids may not.

### 6.2 Song format (`src/audio/format.js`, frozen; `validateSong(song, id)` checks it)
```js
export default {
  id: "rapids", title: "Rapids Run", mood: "energetic river chase", bpm: 140,   // bpm 40..220
  stepsPerBar: 16,          // 16 = 4/4 in 16th-note steps (default); 12 = 3/4 or 12/8 feel
  swing: 0,                 // 0..0.5: odd steps are delayed by swing * one step
  master: { gain: 0.8, reverb: { seconds: 2.6, mix: 0.25 }, delay: { steps: 3, feedback: 0.35, tone: 3500 } },
  instruments: { name: Instrument, ... },          // 1..12
  patterns: { name: { inst: "lead", bars: 1..16, notes: [[step, pitch, dur, vel?], ...] }, ... },  // <= 120
  sections: { name: { bars: 1..64, tracks: ["patternName", { p: "patternName", transpose: 2, vel: 0.9 }] } },
  arrangement: ["intro", "A", "B", "A2", "bridge", "B"],   // section names in play order (<= 64)
  loop: 1,                  // after the last section continue from arrangement[loop] (skip the intro on repeat)
}
```
- A note is `[step, pitch, dur, vel]`: `step` position in the pattern in steps (fractional allowed, < bars*stepsPerBar),
  `pitch` MIDI 0..127 or a name like `"C4"`, `"F#3"`, `"Bb2"` (C4 = 60) or an **array** of those (a chord), `dur` in
  steps (> 0), `vel` 0..1 (default 0.8). Drum instruments ignore pitch except `tom|taiko|woodblock|conga` (tuning).
- A pattern shorter than its section loops; a longer one is cut. `transpose` does not apply to drums.
- Instrument (all types accept `gain` 0..1, `pan` -1..1, `reverb` 0..1, `delay` 0..1 sends, `octave` -3..3):
  - `synth`: `wave` (`sine|triangle|square|sawtooth`), `voices` 1..4 (unison), `detune` cents spread,
    `env {a, d, s, r}` (seconds; s = sustain level 0..1), `filter {type: lowpass|highpass|bandpass, freq, q, env}`
    (`env` = Hz added at note start, decaying over env.d), `glide` seconds, `vibrato {rate, depth (cents), delay}`.
  - `fm`: `ratio`, `index`, `indexDecay`, `env` (bells, e-piano, marimba, kalimba).
  - `pluck`: `wave` (default sawtooth), `tone` (Hz start brightness), `decay` seconds (guitar, harp, banjo).
  - `noise`: `color` (`white|pink|brown`), `filter`, `env` (wind, rain, surf swells, risers).
  - `drum`: `kind` (`kick snare hat openhat clap tom rim shaker crash taiko woodblock conga`), `tune` semitones,
    `decay` multiplier.
- Aim: **loop >= 60 s** (area songs 90-150 s), real melodies with A/B sections, a bridge, dynamics (sections that drop
  out and build back), counter-melodies, and a mix that leaves room for SFX. Keep simultaneous voices modest
  (< ~24 sounding notes) for weak laptops. Validate: `node tools/songcheck.mjs <ids>` must print OK.
- MUSIC_B cannot change the engine. Write against the documented parameters; MUSIC_A must keep every documented
  parameter working (MUSIC_A may add optional parameters and must document them at the top of engine.js).

### 6.3 Engine API (`src/audio/engine.js`, MUSIC_A; frozen API, the baseline implements it)
```js
const audio = createAudio();
audio.unlock()                   // call inside any user gesture; safe to repeat; starts a pending song
audio.playSong(id, { fadeIn = 0.6, fadeOut = 0.8, restart = false }) // crossfade; before unlock it is remembered
audio.stopSong({ fadeOut })
audio.currentSong                // id | null
audio.sfx(name, { vol, pan, pitch, impact })   // name from SFX_NAMES; unknown names are ignored
audio.setVolume({ master, music, sfx })        // 0..1 each;  audio.getVolume()
audio.setMuted(bool); audio.muted
audio.duck(amount = 0.5, seconds = 0.6)        // dip the music (death, win)
audio.context                    // the AudioContext or null
```
`SFX_NAMES = jump land spring die respawn checkpoint win crumble crumble_break bonk step splash click place erase
thunder rate_done publish`. The play screen maps sim events to sfx (`land` passes `impact`). Builder uses
`click place erase rate_done publish`. MUSIC_A should make SFX feel great (soft thuds, boings, leaf rustles),
and may add `ambience(theme)` (forest birds / highland wind / storm rain loop) as an optional method; the play screen
will call `audio.ambience?.(theme)` if it exists.

---------------------------------------------------------------------------------------------------------------------

## 7. Main areas (AREA1 / AREA2 / AREA3)

- **Each area is ONE long level** (several screens) with checkpoints, exported as the default export of
  `src/levels/areaN.js`: `export default { v:1, name, theme, music, w, h, tiles, start, goal, checkpoints, entities }`.
  Data only; you may `import { makeGrid } from "./kit.js"` to build it in code (see kit.js) or write literal rows.
  No other imports, no DOM, no randomness at import time (a seeded PRNG written in the file is fine).
- Registry (frozen, `src/levels/index.js`): area1 "Sunlit Forest" theme `forest` music `area1`; area2 "Golden
  Highlands" theme `highlands` music `area2`; area3 "Storm Peaks" theme `storm` music `area3`. Use exactly these
  theme/music ids. `name` may be more evocative.
- Sizes: area1 ~250-350 tiles wide, area2 ~300-450, area3 ~350-500; height 24-48 (taller sections for climbing are
  welcome; the camera scrolls vertically). A run should take a good player roughly 2-3 min (area1), 3-5 (area2),
  4-7 (area3). Checkpoints every ~35-60 tiles (area3 may have more, but each segment must be a real challenge).
- **Difficulty targets (AI rating, section 8): area1 = 1-3, area2 = 4-6, area3 = 8-9.** Area 3 is "very very hard"
  but **must be beatable by the AI** (a 10 means it could not finish = a failed area).
- Design with the measured physics (3.6). Guidelines:
  - **Area 1 (forest, easy, teaches)**: signs teach move/jump/hold-to-jump-higher, rocks and logs to hop, gentle and
    45-degree hills, streams 2-3 tiles wide, a few thorn patches with generous space, one-way branches, first
    springs (mushrooms), first slow movers over a stream, a crumble bridge late. No pulses. Gaps <= 3 tiles,
    walls <= 2 tiles, no blind jumps, no hazards right at landing spots.
  - **Area 2 (highlands, harder)**: real mountain climbing (tall slopes, cliff steps, ledges, waterfalls/rapids as
    water), 4-tile running jumps, crumble chains, movers over chasms (vertical + horizontal + loop paths), spring
    chains to cliffs, rolling boulders / wasps on paths, some ice near the summit, steam/geyser pulses with long
    windows (on <= 40% of the period). Mistakes cost a checkpoint segment, not the whole run.
  - **Area 3 (storm, very very hard)**: near-max (5-tile) jumps, precise spring launches into thorn corridors, ice
    with spikes, fast movers, multiple moving hazards with tight timing, lightning pulses with short safe windows,
    crumble + mover + pulse combos, vertical climbs in the rain, tunnels 1 tile high lined with thorns. Every
    segment must still be humanly fair: visible, no leaps of faith, no frame-perfect-only tricks for long stretches.
- Required checks before you finish: `node tools/levelcheck.mjs areaN --ascii` is VALID with no warnings you can't
  justify; `node tools/levelcheck.mjs areaN --rate` with the current rater (the baseline beam-search rater can show
  beatability; RATER's real rater may land in parallel, re-run it if it has). Report the rating you saw.
- Use `deco` and `sign` entities generously for a hand-crafted feel (RENDER also auto-decorates).

---------------------------------------------------------------------------------------------------------------------

## 8. AI rater (RATER owns `src/ai/**`)

```js
import { rateLevel } from "./ai/rater.js";
const result = rateLevel(level, { budgetMs, onProgress(p 0..1, message) });   // SYNCHRONOUS, DOM-free
// result = {
//   difficulty: integer 1..10,      // 10 <=> beatable === false
//   beatable: boolean,              // the AI reached the goal (with 0 deaths in its final solution)
//   stats: { ... free-form numbers for display: frames (solution length), nodes, ms, segments: [{from, to,
//            difficulty}], tightestWindow, ... },
//   inputs: Uint8Array | null,      // the AI's winning input bytes: createSim(level).run(inputs) wins (replayable
//                                   // "watch the AI play"); null when not beatable
// }
import { rateAsync } from "./ai/rate-client.js";   // page side: runs rater-worker.js in a module Worker
const r = await rateAsync(level, { onProgress, budgetMs });  // never rejects; errors -> difficulty 10, stats.error
```
Worker protocol (`rater-worker.js`): in `{type:"rate", id, level, opts}`; out `{type:"progress", id, p, msg}` (many),
then `{type:"result", id, result}` or `{type:"error", id, message}`.

- The AI plays the real sim (`createSim(level, {events:false})`, `snapshot/restore`, `reset(cp)`), so its verdict is
  exactly what a player experiences. Rate per checkpoint segment (`sim.reset(i)` starts at checkpoint i) and combine
  (the hardest segments dominate, length adds a little).
- **Scale** (must be calibrated, with fixtures in `tools/rater-fixtures/` and a CLI `tools/rate.mjs <level|file>`):
  1 = walk and simple hops, nothing can go wrong; 2-3 = forest basics (area1); 4-6 = needs real platforming skill:
  running 4-tile jumps, movers, crumbles, springs, timing windows of ~10+ frames (area2); 7 = hard; 8-9 = expert:
  near-max jumps, tight timing windows (~3-6 frames), long chains with little rest (area3); **10 = the AI could not
  beat it within its budget** (treated as "impossible").
  Suggested signal: find a solution, then measure how much input slack each required action has (perturb timing by
  +-1..N frames / try a human-like reaction-delay controller) and how many such actions are chained between rests.
- Budgets: in the browser Worker, finish a community-size level (<= 400x48, <= 300 entities) within ~20 s
  (default `budgetMs` 20000; report progress at least every 250 ms). In Node, area levels may take up to ~120 s.
  The sim does ~1.8 M steps/s and ~90 k snapshot+restore/s in Node on this machine.
- Must also work with `{ events: false }` sims only; never touch the DOM or `window`.

---------------------------------------------------------------------------------------------------------------------

## 9. Online (ONLINE owns `src/online.js`, `src/online-config.js`, `ONLINE-API.md`)

`src/online.js` is imported as a module namespace: `import * as online from "./online.js"` and exposed as
`app.online`. Its exported functions (already present; ONLINE documents them in `ONLINE-API.md`) are the API.
Every function resolves, never rejects. At the time of writing:
`getName() -> Promise<string>`, `isClaimed()`, `setName(name)`, `claimName(name)`, `ping()`,
`listLevels() -> {ok, levels:[{id, name, author, difficulty, music, theme, w, h, hash, t, u, mine}]}`,
`getLevel(id) -> {ok, id, level, meta, mine}`, `publishLevel(level, {name, author, difficulty, music, theme, id?})
-> {ok, id, updated}`, `deleteLevel(id)`, `submitTime(levelId, ms, name?) -> {ok, rank, best, improved}`,
`getTop(levelId, n = 10) -> {ok, rows:[{rank, name, ms, me}], me}`. `levelId` = `"area1"|"area2"|"area3"` or a
community level id. Failures are `{ ok:false, reason }` (`offline` when the service is unreachable). Callers must
show something sensible offline (e.g. "Leaderboard offline").

---------------------------------------------------------------------------------------------------------------------

## 10. App, screens and game flow (`src/main.js`; INTEGRATE owns later)

`app` (one object, passed to every screen factory):
```js
app.canvas, app.ui          // game canvas; #ui overlay root (position:fixed; pointer-events:none; children re-enable)
app.renderer, app.audio     // section 5 / section 6 objects
app.input                   // { bits(), setOverride(b|null), setActive(on, force?), isTouch, clear() }
app.online                  // section 9 module namespace
app.rate(level, opts)       // = rateAsync (section 8)
app.storage                 // { get(key, default), set(key, value) } safe localStorage JSON
app.progress                // { get() -> {done:{id:true}, best:{id:ms}, unlockAll}, complete(id, ms) }
app.viewW, app.viewH        // CSS px of the viewport
app.sim                     // the live sim while the play screen runs, else null
app.show(name, params)      // switch screens: "title" | "areas" | "play" | "builder" | "browse"
app.playLevel(level, { key, onWin(result), onExit(result) })   // = show("play", {level, ...})
app.drawBackdrop(dt, now)   // DOM-only screens call this in frame() to keep the living world behind them
```
Screen protocol: a factory `createXScreen(app)` returns `{ enter(params), exit(), frame(dt, now), resize?() }`.
`enter` builds its DOM inside `app.ui` and adds its listeners; `exit` removes ALL of them. `frame` is called every
animation frame while the screen is active (dt seconds, clamped to 0.25). Screens other than play/builder/menu
call `app.drawBackdrop(dt, now)`.

Play screen (`src/game.js`) params: `{ level, key (leaderboard id or null), onWin(result), onExit(result) }`;
`result = { won, frames, ms, deaths, inputs: Uint8Array }`. It runs the fixed 60 Hz accumulator, plays
`level.music`, maps sim events to sfx, shows HUD (time, deaths, pause), Esc/P pause, R restart, the results panel with
the top 10 for `key`, and calls `online.submitTime(key, ms)` on a win. Area N+1 unlocks when area N is completed.

**BUILDER** (`src/builder/editor.js` exports `createBuilderScreen(app)`, `src/builder/browse.js` exports
`createBrowseScreen(app)`; add more files freely under `src/builder/`, inject your own `<style>`/css from there):
- Editor params: `{ level?: level to edit, resume?: true when returning from a test play }`. Keep the level being
  edited in module state so `resume` continues it. Autosave drafts to `app.storage` (`adventurecube.drafts.v1`).
- Full editor: palette of every tile char (section 4.1) and entity type (4.2) with `renderer.drawThumb` icons; paint,
  erase, rectangle fill, eyedropper, place start/goal/checkpoints, select an entity and edit its fields (w, p, r,
  kind, speed, mode, phase, period/on/offset, text, path points by clicking), delete; pan (drag with middle/right
  button or two fingers; space+drag) and zoom (wheel/pinch) via the camera API; undo/redo (Ctrl+Z / Ctrl+Y);
  level settings: name, theme (3), music (8, with a preview button using `audio.playSong`), width/height within
  community limits; new / open draft / open own published level. Usable on phones (touch: tap to paint, two-finger
  pan/zoom, collapsible palette). Use `renderer.frame({mode:"edit", ...})` + `renderer.updateTiles` for drawing.
- **Test play**: `app.playLevel(level, { key: null, onExit: (r) => app.show("builder", { resume: true, cleared: r.won }) })`.
- **Publish flow**: `validateLevel(level, {community:true})` must pass -> the author must have **cleared the current
  version in test play** -> `app.rate(level, {onProgress})` with a progress bar (show the AI's verdict, and offer
  "watch the AI play" by replaying `result.inputs` in a sim) -> confirm name -> `app.online.publishLevel(level,
  {difficulty: result.difficulty, name, author})` -> show the id. Not beatable by the AI = difficulty 10 (still
  publishable). Show a difficulty badge with the 1-10 color scale everywhere.
- **Browse**: list community levels (`online.listLevels()`), sort/filter (newest, difficulty, search), show
  difficulty, author, theme, music; play (`app.playLevel(level, { key: id, onExit: () => app.show("browse") })`),
  show the top times (`online.getTop(id)`); "my levels" (edit/update/delete). Offline: a clear message.

**INTEGRATE** later: polished title/area-select UI, settings (volumes), progress/unlocks, `?level=<id>` deep links,
`audio.ambience`, `renderer.onFlash` -> thunder, final performance pass, the platyfy hub card in `../index.html`.

## 11. Debug seam (`window.__cube`, keep it working)
`__cube.state()` -> `{screen, fps, level, frame, x, y, tx, ty, vx, vy, grounded, dead, deaths, won, cp}`;
`__cube.teleport(tx, ty)` (feet on the top of cell ty+1, centered in column tx); `__cube.setInput(bits | null)`;
`__cube.loadLevel(levelObject | "area1" | "area2" | "area3" | "test", opts)` (starts play);
`__cube.show(name, params)`; `__cube.app`; `__cube.sim`.

## 12. Measured baseline (foundation run)
`tools/simtest.mjs`: 39/39 pass. Fuzz (40 random hill levels x 4000 steps, 4 seeds incl. ceilings): 0 solid overlaps,
0 fall-throughs. Baseline beam rater beats the test level (940 frames) in ~6 s. Browser smoke test
(`tools/playtest.cjs --phone`): all checks pass, 60 fps with the placeholder renderer, touch controls work at 390 px.
