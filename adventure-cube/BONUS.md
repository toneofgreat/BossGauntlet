# ADVENTURE CUBE - BONUS LEVEL contract ("Wildwood Homestead")

The bonus level unlocks after Area 3. It is a **2D side-view survival / crafting sandbox** starring the same cube:
chop trees, mine stone and ore, craft tools (hand -> wood -> stone -> iron -> steel), hunt animals for food (no gore:
they vanish in a puff and drop meat/hide), stay fed, survive the night, and build a **house you level up 20 times**
(lean-to -> tent -> log cabin -> stone cottage -> two-storey house -> manor -> castle -> crystal citadel).

This file is the source of truth for the 6 parallel agents **WORLD, CREATURES, CRAFT, HOUSE, BONUS_RENDER,
BONUS_AUDIO** (and INTEGRATE later). CORE wrote it together with a **working end-to-end skeleton**: every file listed
below already exists and runs (`?bonus=1` boots it; you can chop a tree and see wood in the inventory). Replace the
placeholder internals of the files you own; **keep every exported name, signature, event and field documented here**.
If you need something missing, make the **smallest compatible addition inside files you own** and list it in your
final summary under "contract changes". Never edit a file you do not own.

Everything in `CONTRACT.md` section 0 still applies (plain ES modules, no build, no deps, no external assets,
everything procedural, `node --check` clean, UHD 620 at 60 fps, **one headless browser at a time via
tools/browserlock.cjs**, Node not Python, Git Bash, do not commit/push, original work only, 390 px phones).

---------------------------------------------------------------------------------------------------------------------

## 1. Files and ownership

| Path (under `adventure-cube/`) | Owner | DOM? | Notes |
|---|---|---|---|
| `BONUS.md` | CORE (frozen) | | additions -> your summary |
| `src/bonus/core/*.js` (`const bus rng time physics player action game save input hud debug`) | CORE (frozen) | input/hud/debug only | bugs: report, do not edit |
| `src/bonus/index.js` | CORE (frozen) | yes | the screen |
| `src/bonus/data/tiles.js` | **WORLD** | no | tiles, biomes, trees, world objects |
| `src/bonus/world/**` (`gen.js`, `index.js`, new files) | **WORLD** | no | generation, mining, trees, objects, drops |
| `src/bonus/data/animals.js` | **CREATURES** | no | animal table |
| `src/bonus/creatures/**` (`index.js`, new files) | **CREATURES** | no | AI, spawning, combat, arrows |
| `src/bonus/data/items.js`, `src/bonus/data/recipes.js` | **CRAFT** | no | items, tools, food, recipes |
| `src/bonus/craft/inventory.js`, `craft/index.js`, new logic files | **CRAFT** | no | inventory, hunger, eating, crafting |
| `src/bonus/craft/ui.js`, new UI files under `craft/` | **CRAFT** | yes | HUD bars, hotbar, inventory/craft/chest panels, touch buttons |
| `src/bonus/data/house.js` | **HOUSE** | no | the 20 levels |
| `src/bonus/house/index.js`, new logic files | **HOUSE** | no | upgrades, perks, sleep, garden, chest, repair |
| `src/bonus/house/ui.js`, new UI files under `house/` | **HOUSE** | yes | the house panel |
| `src/bonus/render/**` (`renderer.js`, new files) | **BONUS_RENDER** | yes | ALL bonus drawing + item icons + house art |
| `src/bonus/audio/**` (`index.js`, `songs/*.js`, new files) | **BONUS_AUDIO** | yes (WebAudio) | bonus songs, ambience, sfx |
| `tools/bonustest.mjs` (runner), `tools/bonustests/core.mjs`, `tools/bonusplay.cjs` (base) | CORE | | |
| `tools/bonustests/<owner>.mjs` (`world.mjs creatures.mjs craft.mjs house.mjs render.mjs audio.mjs`) | that owner | | your own headless tests |
| `tools/bonusplay.cjs` sections | owners may ADD a clearly marked `// SECTION <owner>` block | | keep existing checks passing |
| `src/main.js`, `src/ui/**`, `style.css`, `index.html`, `tools/playtest.cjs` | INTEGRATE (later) | | CORE added only the lazy `app.screens.bonus` + temporary `?bonus=1` route |
| everything else (`src/sim`, `src/render`, `src/audio`, levels, builder, ai, online) | unchanged | | you may IMPORT from them, never edit |

Rules:
- **Logic modules are DOM-free** (everything not marked DOM above, plus anything they import). `tools/bonustest.mjs`
  runs whole games in Node; `G.headless === true` there. No `document`, `window`, `Image`, `performance` in logic.
- Logic uses only `G.rng` for randomness (seeded, saved). World generation uses only `core/rng.js` noise/hash
  (exact arithmetic) so a save can be rebuilt from its seed. Render/audio may use `Math.random` freely.
- Logic runs at a **fixed 60 Hz step** (`stepGame`); never use real time in logic. Animation timers in render/audio
  may use real time (`view.time`, `view.dt`).
- Shared data files are owned by one agent each, but others READ them. Item ids, tile codes, animal kinds, recipe
  ids, house level count and object kinds are **frozen once listed here**: add, tune, never rename or remove.
- Import only the documented exports of other agents' modules.
- CSS class prefixes: CORE `bz-`/`bc-`, CRAFT `bk-`, HOUSE `bh-`, RENDER (none needed). Inject your own `<style>`
  from your UI module. **`style.css` gives every `<button>` `margin:4px; min-height:44px; padding:10px 18px;
  border-radius:12px`** - reset these on your buttons where you need exact sizes.

---------------------------------------------------------------------------------------------------------------------

## 2. CORE (frozen) - the game object, step, physics, player, actions

### 2.1 `core/const.js`
`T = 32` (tile px), `FPS = 60`, `STEP_MS`, `PW = PH = 26` (cube AABB) re-exported from the main sim.
Input bits: `B_LEFT 1, B_RIGHT 2, B_JUMP 4` (= main game), `B_ACTION 8` (held: swing), `B_USE 16` (edge: eat /
place / interact), `B_UP 32`, `B_DOWN 64` (aim). World `WORLD_W = 800`, `WORLD_H = 120` tiles, `PLOT_W = 24`.
Reach: `REACH_POINTER = 4.5` tiles (pointer aiming), `REACH_AUTO = 1.6`. Day: `DAY_FRAMES = 36000` (10 real min),
phases `dawn [0, .06) day [.06, .62) dusk [.62, .70) night [.70, 1)`; new games start at `NEW_GAME_F = 0.08`.
`HP_MAX = 100`, `HUNGER_MAX = 100`, `HURT_IFRAMES = 40`, `DEATH_STEPS = 90`, `FALL_SAFE_TILES = 10`; swim
constants; `SAVE_KEY = "adventurecube.bonus.v1"`, `SAVE_VERSION = 1`, `AUTOSAVE_STEPS = 1800`.

### 2.2 `core/game.js` - G and the step
```js
const G = createGame({ seed, save, headless })   // seed: number | numeric string | any string (hashed)
stepGame(G, bits, aim)                            // one step. aim = { tx, ty } tile under the pointer, or null
makeSave(G) -> JSON-able object                   // section 2.8
SYSTEMS = { world, creatures, craft, house }      // init(G) / step(G) / save(G) / load(G, data), in this order
```
Step order (fixed): `G.frame++` -> `stepPlayer` -> `stepAction` (target, swings, use) -> `world.step` ->
`creatures.step` -> `craft.step` -> `house.step` -> `advanceTime(G, 1)` -> every `AUTOSAVE_STEPS` emit `"autosave"`.

**G** (one plain object; logic mutates it, render/audio/UI read it):
```js
{
  v, seed, frame, headless,
  bus,                 // section 4
  rng,                 // seeded PRNG: rng() [0,1), rng.int(a, b), rng.pick(arr), rng.state (saved)
  time: { t, day },    // t = 0..DAY_FRAMES-1 within the day; day = 1, 2, ...
  world,               // section 3.1
  nextId,              // shared id counter: every tree/object/drop/animal/projectile gets id = G.nextId++
  player,              // section 2.4
  inv,                 // section 5.2 (36 slots, 0..8 = hotbar)
  animals: [],         // section 6
  projectiles: [],     // arrows (CREATURES)
  platforms: [],       // one-way px platforms { x, y, w } (land from above only). HOUSE may add floors/stairs.
  house,               // section 7  { level, buildT, chest, garden, _perks }
  craft,               // CRAFT's state { regenT, starveT, sickT, ... }
  target,              // core/action.js computeTarget() result (2.5), recomputed every step
  input: { bits, prev, aim },
  stats: { treesFelled, mined, hunted, crafted, eaten, steps },   // shown on a stats/achievement UI if wanted
  flags: {},           // saved one-shot flags (tutorial hints: G.flags.hello ...). Any owner may add keys.
}
```

### 2.3 `core/physics.js`
`tileAt(G, tx, ty)` (outside left/right/bottom = bedrock, above = air), `solidAt`, `liquidAt`,
`solidRect(G, l, t, r, b)`, `bodyInWater(G, body)`, `moveBody(G, body, { stepUp, platforms })` -> flags
`HIT_X 1 | HIT_Y 2 | LANDED 4 | BONKED 8 | STEPPED 16`. A body is `{ x, y, w, h, vx, vy, grounded }` (top-left px).
Full-solid tiles only (no slopes in the bonus); one-way `G.platforms`; velocities must stay < 32 px/step.
`stepUp` (player only): walking into a 1-tile ledge with room above steps onto it (sets `player.smoothY` so the
renderer eases the 32 px pop). CREATURES uses `moveBody` for animals (they jump at walls themselves); WORLD uses it
for drops.

### 2.4 `core/player.js` - the cube
Fields: `x, y, w, h, vx, vy` (top-left px), `ox, oy` (**draw position at the previous step**: render at
`lerp(ox, x, alpha)`, `lerp(oy, y + smoothY, alpha)`), `smoothY` (step-up easing offset, decays 4 px/step),
`grounded, facing (1|-1), inWater, hp, maxHp, hunger, maxHunger, hurtT` (i-frames left; flash while > 0),
`kbT, dead, deadT, faints, swingT` (counts down from `swingLen` during a swing), `swingLen, swingKind`
(`"hand"|"axe"|"pickaxe"|"sword"|"spear"|"hammer"|"bow"`), `lastHurtBy, airT, peakY`.
Movement = the main game's constants (run 3.5 px/step, full jump 87 px = 2.7 tiles, coyote/buffer, variable jump).
Swimming: water tiles are not deadly here; hold jump to swim up, a jump near the surface hops out. Falls over
10 tiles hurt 5 hp per extra tile (not into water).
API: `createPlayer(tx, groundRow)`, `stepPlayer(G, bits)`, `hurtPlayer(G, dmg, fromX, kb, cause) -> bool`
(respects i-frames; knockback away from fromX), `healPlayer(G, n) -> healed`, `faint(G, cause)`,
`respawnPlayer(G)` (at `house.respawnPoint`, hp >= 60%, hunger >= 40, **inventory kept** - family friendly),
`placePlayer(G, tx, ty)` (stand in cell tx,ty), `playerCenter(G)`.

### 2.5 `core/action.js` - targeting and dispatch
`computeTarget(G, bits, aim)` sets `G.target = { kind: "tree"|"object"|"tile"|"air", tx, ty, tree, obj, pointer,
place: {tx, ty} | null }`:
- pointer aim (mouse / touch on the world) within 4.5 tiles wins; else `B_DOWN` = cell under the feet, `B_UP` =
  cell above the head, else the cell in front (facing) at body height; with nothing there, a tree/object in the
  player's own or front column near the feet (auto-aim chops the tree you stand at).
- `place` = cell where B_USE would put the selected placeable/block (`world.canPlace` true) -> RENDER draws a ghost.

`stepAction(G, bits, prevBits, aim)` each step:
- **B_ACTION held** and `player.swingCd <= 0`: tool = `invTool(G.inv)` (HAND when the slot is not a tool);
  `swingCd = tool.cd`, `swingT = swingLen = min(cd, 16)`; face the pointer; emit `"swing"`. Bow:
  `creatures.shoot(G, ax, ay, tool)`. Else `creatures.meleeHit(G, swingRect(G, tool.reach), tool, facing)`; if no
  animal was hit: `world.hitTree | world.hitObject | world.hitTile` on G.target. A successful use wears the tool by 1
  (times `house.perkValue(G, "wearMul", 1)`), `"tool:break"` when it breaks.
- **B_USE pressed**: `house.interact(G)` -> else `world.useObject(G, target.obj)` -> else selected item: food ->
  `craft.eat(G, sel)`; placeable/block -> `world.place(G, id, place.tx, place.ty)` then removes 1 and emits `"place"`.

### 2.6 `core/time.js`
`dayF(G)` 0..1, `phase(G)`, `phaseAt(f)`, `isNight(G)`, `sun(G)` / `sunAt(f)` 0.1 (night) .. 1 (day) with smooth
dawn/dusk ramps, `clockText(G)` ("Day 3 · 14:20"; dawn = 06:00), `advanceTime(G, n)` (emits `time:phase`,
`time:day` at each new dawn), `setDayF(G, f)` (jumps forward, crossing dawn counts as a new day).

### 2.7 `core/rng.js`, `core/bus.js`
`hash2(x, y, s)`, `createRng(seed)`, `noise1/fbm1/noise2/fbm2`, `seedFrom(v)`. Bus: section 4.

### 2.8 `core/save.js` - one versioned localStorage slot
`readSave(storage)`, `writeSave(storage, G) -> bool` (emits `"save"`), `clearSave(storage)`, `hasSave(storage)`.
`storage` = `app.storage` (`get(k, d)`, `set(k, v)` JSON). Key `adventurecube.bonus.v1`. Format = `makeSave(G)`:
`{ v, seed, frame, time, nextId, rng, player: {x, y, hp, hunger, facing, faints}, inv, stats, flags, at,
world: world.save(G), creatures: creatures.save(G), craft: craft.save(G), house: house.save(G) }`.
Load = `createGame({ save })`: regenerate the world from `seed`, then each system's `load(G, data)`, then the player.
A save whose `v` is newer than `SAVE_VERSION` is ignored and never overwritten. Each system's `save()` must return
JSON-able data and its `load()` must accept **older/partial data** (missing keys -> defaults). Typical size: ~10 KB;
keep it < 200 KB. The screen saves on: `autosave` (30 s), house upgrade, pause-menu Save/Quit, tab hidden, page hide,
screen exit, new world.

---------------------------------------------------------------------------------------------------------------------

## 3. WORLD

### 3.1 `G.world` (built by `generateWorld(seed)`, then `world.init`)
```js
{ W: 800, H: 120, seed,
  tiles: Uint8Array(W*H),        // index y*W+x, codes = TILE_DEFS index (3.3). Change ONLY via world.setTile.
  surface: Int16Array(W),        // generated first solid-or-water row per column (renderer: sky/cave split, parallax)
  biome: Uint8Array(W),          // BIOME index per column (meadow forest pinewood hills river)
  segments: [[biomeName, x0, x1], ...],
  river: { x0, x1, waterTop },   // water from row waterTop down to the bed
  spawn: { x, y },               // spawn column + its ground row (feet on top of row y)
  houseX, houseY,                // house plot: columns houseX..houseX+23, ground row houseY (flat)
  protect: { x0, y0, x1, y1 },   // tile rect nobody may mine/place tiles in (the house plot + 2 rows of foundation)
  trees: [ tree ], objects: [ obj ], drops: [ drop ],
  mods: Map(index -> code),      // tile diff vs. generation (saved)
  dmg: Map(index -> { w, t }),   // cracking progress per tile: w = work so far, t = frame of the last hit
  lights: [ { x, y, r, kind, id } ],  // px centers + radius in tiles of light objects (rebuilt on place/break)
}
```

### 3.2 Generation (`world/gen.js`: `generateWorld(seed)`, `worldHash(world)`, `SURF = 46`, `SPAWN_X = 400`)
Fixed macro layout, borders jittered by the seed (measured, seed 1234):
`hills 0-104 | pinewood -242 | forest -320 | river 320-340 | forest -375 | MEADOW 375-472 (spawn 400, plot 404-427)
| forest -601 | pinewood -680 | hills -800`.
Surface = per-biome fbm hills smoothed across borders (meadow +-2.5 rows, forest +-5, pinewood +-8, hills up to
~30 rows higher), flattened around spawn and the plot, river banks kept at the water line. Columns: grass top
(mossy stone on steep/high hills), 3-6 dirt (1-3 on hills), stone, bedrock bottom 2-3 rows. Sand banks at the river,
clay pockets near water/meadow, gravel in stone, worm caves + deep caverns (none within ~14 rows below home), ores
by depth below the surface: coal >= 3, iron >= 12, gold >= 34, crystal >= 52 (hills richer), plus guaranteed
deposits near home (clay, 2 coal, 2 iron blobs) and far away (gold, crystal in both hills). Measured seed 1234:
coal 1760, iron 1165, gold 322, crystal 164 tiles; ~119 trees, ~63 natural objects; gen ~45 ms in Node.
Guaranteed near spawn (west; the plot is east): an oak at spawn-5, a birch at spawn-10, loose rocks at -7/-16,
tall grass at -3, a berry bush at -13. WORLD may enrich generation (surface lakes, more objects, cave mushrooms,
hanging vines...) but must keep: determinism, those guarantees, the plot/spawn rows, `SURF`, `SPAWN_X`, the
fields above, and gen < 300 ms in Node.

### 3.3 Tiles (`data/tiles.js`; codes frozen)
| code | id | hp | pick tier | pref | drop |
|---|---|---|---|---|---|
| 0 | air | | | | |
| 1 | dirt | 3 | 0 | any | dirt |
| 2 | grass | 3 | 0 | any | dirt (+fiber 30%) |
| 3 | stone | 6 | 1 | pick | stone (+flint 6%) |
| 4 | coal_ore | 8 | 1 | pick | coal x2 |
| 5 | iron_ore | 12 | 2 | pick | iron_ore |
| 6 | gold_ore | 16 | 3 | pick | gold_ore |
| 7 | crystal | 24 | 4 | pick | crystal (+1 25%) |
| 8 | clay | 4 | 0 | any | clay x2 |
| 9 | sand | 2 | 0 | any | sand |
| 10 | gravel | 3 | 0 | any | gravel (+flint 30%) |
| 11 | water | - | 99 | | (not solid, swimmable, static: no flow) |
| 12 | bedrock | - | 99 | | unbreakable |
| 13 | planks | 4 | 0 | axe | plank (placed) |
| 14 | cobble | 8 | 1 | pick | stone (placed stone) |
| 15 | brick | 10 | 1 | pick | brick (placed) |
| 16 | glass | 2 | 0 | any | glass (placed) |
| 17 | mossy | 6 | 1 | pick | stone |
| 18 | snow | 3 | 0 | any | dirt (reserved: snowy hill tops, optional) |

Work per swing (`world.tileWork(code, tool)`): 0 if the tile needs pick tier > 0 and the tool is not a pickaxe of
that tier (-> `"tile:tooHard"`); pickaxe on pick/any tiles = `tool.power`; axe on axe tiles = `tool.power`; anything
else = 1. A tile breaks when accumulated work >= hp; cracks heal after 240 steps without hits (`"tile:heal"`).
Placeable blocks (`PLACE_TILE`): dirt, sand, plank -> planks, stone -> cobble, brick, glass.

### 3.4 Trees (`G.world.trees`)
`{ id, kind: "oak"|"birch"|"pine"|"ancient", x (trunk column), y (ground row under the trunk), stage, hp, growT,
fruit (apples hanging 0..3), seed (render variety) }`. Stages: `0 stump -> 1 sapling -> 2 young -> 3 mature`
(stump->sapling 2 min, ->young 3 min, ->mature 4 min). `TREE_DEFS`: oak hp 8 wood 4-6 (apples), birch 6 / 3-4,
pine 10 / 5-7, ancient oak hp 30 needs a **stone axe** (tier 2), wood 14-18, 3 columns wide. Hands chop at 1 work,
axes at `power`. Felling: the trunk falls AWAY from the chopper (`"tree:fall"` with `dir`), wood/sticks/apples/
sapling drop toward the chopper. Young trees drop half. Saplings can be planted on grass/dirt (no tree within 2
columns). Mature oaks regrow apples at dawn. Aiming rows: `action.treeRows(tree)`.

### 3.5 Objects (`G.world.objects`, `OBJECT_DEFS`)
`{ id, kind, x, y (the air row it stands in; ground is row y+1; w x h tiles growing right/up), hp, t, n, seed, inv? }`.
Placed: `workbench` (2x1, station), `campfire` (station, light 7), `furnace` (2x2, station, light 4), `anvil`
(station), `chest` (18 slots, B_USE opens it), `torch` (light 6, wall-mountable), `lantern` (light 9, wall).
Natural: `bush` (B_USE harvests 2-4 berries, regrows in 2.5 min; `n` = ripe 0/3), `tallgrass` (fiber, 5% sapling),
`mushroom` (B_USE or hit picks it), `boulder` (3 stone + 50% flint; needs any hits, pickaxe faster), `flowers`.
Stations count within `STATION_RANGE = 4` tiles. B_USE on a station opens the craft panel (`ui:open {panel:"craft",
station}`).

### 3.6 World API (`world/index.js`, all DOM-free)
```js
init(G) step(G) save(G) load(G, data)
tileAt(G, tx, ty)  solidAt(G, tx, ty)  waterAt(G, tx, ty)  surfaceAt(G, tx)  biomeAt(G, tx)  plot(G) -> {x, y, w}
isProtected(G, tx, ty)
setTile(G, tx, ty, code) -> bool           // the ONLY way to change a tile: records mods, emits "tile"
tileWork(code, tool) -> work
hitTile(G, tx, ty, tool) -> { ok, broke, tooHard }
treesNear(G, tx, r) -> [tree]
hitTree(G, tree, tool) -> { ok, felled, tooHard }
objectAt(G, tx, ty) -> obj | null          objectsNear(G, px, py, rTiles, filter?) -> [obj]
hitObject(G, obj, tool) -> { ok, broke }   breakObject(G, obj)      useObject(G, obj) -> bool
give(G, id, n, atObj?)                     // into the inventory, overflow drops on the ground
canPlace(G, id, tx, ty) -> bool            place(G, id, tx, ty) -> bool   (does NOT touch the inventory)
rebuildLights(G)
spawnDrop(G, item, n, cx, cy, d?) -> drop  // px center; d = tool durability
```
Drops: `{ id, item, n, x, y (top-left px), w: 12, h: 12, vx, vy, grounded, d, age }`; they bounce, float in water,
fly to the player within 2.4 tiles, are picked up within 0.7 tiles (`"pickup"`), and vanish after 5 min.

---------------------------------------------------------------------------------------------------------------------

## 4. Event bus (`G.bus`, `core/bus.js`)
`G.bus.on(type, fn) -> off()`, `on("*", (type, data) => ...)`, `emit(type, data)`, `off`, `log` (array: record).
Handlers run synchronously. **Render/audio/UI subscribe in setGame/bind and unsubscribe on destroy.** Logic may also
subscribe (in `init`). Payload coordinates are px unless named tx/ty. Do not mutate payload objects you did not
create. Emitting a NEW event type is a compatible addition (document it in your summary).

| event | payload | emitted by |
|---|---|---|
| `player:jump` | `{x, y}` or `{water: true}` | CORE |
| `player:land` | `{x, y, impact (vy), fallTiles}` | CORE |
| `player:bonk` `player:splash` `player:unsplash` | `{}` / `{x, y, vy}` | CORE |
| `player:hurt` | `{dmg, cause, hp, x, y}` | CORE (`hurtPlayer`) |
| `player:die` (faint) / `player:respawn` | `{cause, x, y}` / `{x, y}` | CORE |
| `swing` | `{type, tier, dir, x, y}` (every swing, hit or miss) | CORE |
| `place` | `{id, tx, ty}` (an item was placed) | CORE |
| `tool:break` | `{id}` | CORE |
| `time:phase` / `time:day` | `{phase, from}` / `{day}` | CORE |
| `autosave` / `save` | `{frame}` / `{at}` | CORE |
| `ui:open` | `{panel: "craft"|"chest"|"house"|..., ...data}` -> the screen opens that panel | anyone |
| `toast` | `{text}` -> short message on screen | anyone |
| `tile` | `{tx, ty, from, to}` (any tile change: RENDER re-bakes that chunk) | WORLD |
| `tile:hit` / `tile:break` / `tile:heal` | `{tx, ty, tile, work, hp}` / `{tx, ty, tile}` / `{tx, ty}` | WORLD |
| `tile:tooHard` / `tile:protected` | `{tx, ty, tile, need}` / `{tx, ty}` | WORLD |
| `tree:hit` / `tree:fall` | `{tree, work, hp, max}` / `{tree, dir, wood, kind}` | WORLD |
| `tree:tooHard` `tree:grow` `tree:plant` `tree:remove` | `{tree, need?}` | WORLD |
| `obj:place` `obj:hit` `obj:break` `obj:regrow` | `{obj, work?}` | WORLD |
| `harvest` | `{obj?, id, n, garden?}` | WORLD / HOUSE |
| `drop:spawn` / `pickup` | `{drop}` / `{id, n, x?, y?}` | WORLD |
| `animal:spawn` `animal:despawn` | `{a}` | CREATURES |
| `animal:hit` | `{a, dmg, hp}` | CREATURES |
| `animal:die` | `{a, x, y, kind}` (RENDER: puff of dust/leaves, no gore) | CREATURES |
| `animal:attack` | `{a}` (the moment it bites/rams) | CREATURES |
| `animal:windup` | `{a}` (telegraph: boar paws ground, bear rears, wolf crouches) | CREATURES (to add) |
| `animal:sound` | `{a, sound}` (idle calls: squeak cluck bleat grunt howl growl splash; ~every 5-20 s, near the player) | CREATURES (to add) |
| `shoot` | `{x, y}` | CREATURES |
| `player:eat` | `{id, raw, hunger}` | CRAFT |
| `craft` | `{recipe, id, n, station}` | CRAFT |
| `house:upgrade` | `{level, name, debug?}` | HOUSE |
| `sleep` | `{start: true}` then `{start: false}` (RENDER fades to black and back; AUDIO lullaby/rooster) | HOUSE |
| `garden:ripe` | `{beds}` | HOUSE |

---------------------------------------------------------------------------------------------------------------------

## 5. CRAFT - items, tools, recipes, inventory, hunger, UI

### 5.1 Items (`data/items.js`; ids frozen)
`item = { id, name, kind, stack, icon: {shape, color, color2?}, desc?, tool?, food?, place?, block?, light?, ammo? }`.
- Resources: `wood stick plank fiber rope stone flint dirt sand gravel clay coal iron_ore gold_ore crystal iron_ingot
  gold_ingot steel_ingot brick glass hide bear_hide feather fang sapling` (plank/stone/dirt/sand/brick/glass are also
  placeable blocks; sapling plants a tree).
- Food `{hunger, hp, raw?, cooks?}`: berries 6/1, apple 8/2, mushroom 4/0 -> cooked_mushroom 9/2, carrot 7/1,
  raw_small_meat 4 -> cooked_small_meat 18/4, raw_venison 6 -> venison_steak 30/8, raw_mutton 5 -> cooked_mutton 26/6,
  raw_pork 7 -> pork_roast 34/8, raw_fish 5 -> grilled_fish 20/6, big_meat 10 -> bear_roast 50/15, jerky 36/8,
  stew 60/25, berry_pie 40/12. Raw meat gives a little hunger and a 10 s "tummy ache" (no regen); never damage.
- Tools: `{wood|stone|iron|steel}_{axe|pickaxe|sword|spear|hammer}` (20) + `bow` (+ `arrow` ammo).
  `tool = { type, tier 1..4, power, dmg, reach (tiles), cd (steps), dur }`; HAND = `{type:"hand", tier 0, power 1,
  dmg 2, reach 1.4, cd 20}`. power by tier 2/3/5/8 (axe, pickaxe), hammer 2/3/4/6; dmg sword 6/9/14/20, spear
  5/8/12/17 (reach 2.6), axe 4/6/9/12; dur 60/130/300/700. Hammers are needed (carried, any slot) for house levels.
- Placeables: `workbench campfire furnace anvil chest torch lantern`.
- Helpers: `ITEMS, ITEM_LIST, item(id), isTool(id), toolOf(id), stackOf(id), itemName(id), TIERS, TIER_COLOR, HAND`.

### 5.2 Inventory (`craft/inventory.js`; pure, everyone calls it; API frozen)
`inv = { slots: Array(36) of null | {id, n, d?}, sel: 0..8, ver }` - **`ver` increments on every change** (UIs
re-render when it changes). `createInv(n)`, `invAdd(inv, id, n, d?) -> leftover`, `invCount`, `invRemove(inv, id, n)
-> removed` (from the last slots first), `invHasAll(inv, cost)`, `invMissing(inv, cost) -> {id: n}`,
`invTakeAll(inv, cost) -> bool` (atomic), `invSelected`, `invSelect(inv, i)`, `invTool(inv)`,
`invBestTier(inv, type)`, `invWear(inv, i, n) -> broke`, `invMove(invA, a, invB, b)` (swap/merge, chests too),
`invRoom(inv, id)`, `invSave`, `invLoad`, `INV_SLOTS = 36`, `HOTBAR = 9`. These never emit events.

### 5.3 Recipes (`data/recipes.js`)
`{ id, out: [itemId, n], cost: {itemId: n}, station }`, stations `hand workbench campfire furnace anvil smoker
kitchen`. Progression: by hand -> stick, rope, workbench (6 wood), campfire (4 wood 3 stone), torch (stick + coal);
workbench -> planks, chest, furnace (12 stone 4 clay), anvil (5 iron ingot 4 stone), bow, arrows, wood + stone tools;
campfire -> cook every raw food; furnace -> iron/gold ingot (ore + coal), steel (2 iron ingot + 2 coal), brick
(2 clay + coal -> 2), glass (2 sand + coal -> 2); anvil -> iron + steel tools, lantern; smoker (house) -> jerky;
kitchen (house) -> stew, berry pie. CRAFT may add recipes (e.g. repair kits, decorative blocks, fishing rod).

### 5.4 Logic (`craft/index.js`)
```js
init(G) step(G) save(G) load(G, d)
HUNGER = { drain (idle ~16.7 min full->empty), runMul, swimMul, swing, regenAt 50, regenEvery 90, regenHp 1,
           regenCost, starveEvery 150, starveHp 2, rawSick 600 }   // CRAFT tunes
eat(G, slotIndex) -> bool           // food: hunger + hp (x house banquet perk at home); emits "player:eat"
stationsNear(G) -> Set<station>     // "hand" + placed station objects within 4 tiles + house perk stations at home
recipesFor(G) -> [{ recipe, station: bool, have: bool }]
craft(G, recipeId, times = 1) -> crafted count   // emits "craft"; overflow drops at the player
```
Hunger drains faster when running/swimming/swinging, slower at home with the hearth perk; hp regenerates while
hunger >= 50 (faster at home with `regenMul`); at 0 hunger the cube loses 2 hp every 2.5 s (it can faint).

### 5.5 CRAFT UI (`craft/ui.js`: `createCraftUI(ctx) -> { frame(dt), destroy() }`, section 8)
Must provide: **health + hunger HUD** (top-left region; low hunger warning pulse; hearts/drumsticks or rich bars),
**hotbar** (9 slots with `renderer.drawIcon` icons, counts, durability bar; click/tap selects; bottom-center on
desktop, under the HUD at top-center on touch: **must fit 390 px**), panel **"craft"** (inventory grid with
move/swap, recipe list grouped by station, unavailable stations shown locked with the station name, materials
have/need, craft x1 / x5 / max, tooltips with item names, eat food from the panel, `data.station` focuses that
station), panel **"chest"** (`data.obj` world chest or `data.house` = `G.house.chest`), **touch buttons** (HIT =
hold `B_ACTION`, USE = pulse `B_USE`, BAG = toggle "craft"; layout 8.3). Re-render only when `inv.ver` changes.

---------------------------------------------------------------------------------------------------------------------

## 6. CREATURES - animals

### 6.1 Animal table (`data/animals.js`; kinds frozen)
| kind | hp | ai | dmg | drops | where / when | cap, group |
|---|---|---|---|---|---|---|
| rabbit | 6 | flee (sight 5) | - | raw_small_meat, hide 25% | meadow, forest; day | 6, 1-2 |
| pheasant | 5 | flutter | - | raw_small_meat, 1-3 feather | meadow, forest; day | 4, 1-3 |
| deer | 20 | flee (sight 8, fast) | - | 2-3 raw_venison, hide | meadow, forest; any | 4, 1-3 |
| goat | 18 | provoked (butts back) | 6 | 2 raw_mutton, hide 60% | hills; day | 4, 1-3 |
| boar | 30 | charge (windup 40) | 10 | 2-3 raw_pork, hide | forest, pinewood; any | 3, 1-2 |
| wolf | 26 | pack (night) | 8 | hide, fang 60% | forest, pinewood, hills; night | 4, 2-4 |
| bear | 80 | territorial | 18 | 3-4 big_meat, bear_hide | pinewood; any | 1 |
| fish | 4 | swim (river only) | - | raw_fish | river; any | 5, 1-3 |

Fields per kind: `name hp w h speed ai sight windup? dmg kb cd drops biomes time cap group weight sound`.
`SPAWN = { minDist 22, maxDist 40, despawnDist 70, every 240, lightRadiusFear 1, homeSafe 14 }`, `HOSTILE`.

### 6.2 Behaviour (CREATURES implements; CORE's placeholder only wanders/flees/chases)
- **flee**: graze/wander/hop; bolt away when the player is within `sight` or after a hit; rabbits zig-zag, deer
  leap over 1-2 tile steps. **flutter**: runs, then short flapping arcs over obstacles.
- **provoked** (goat): calm until hit, then charges for ~5 s; nimble on steep hills (jumps 2 tiles).
- **charge** (boar): notices within sight -> `animal:windup` (paws ground `windup` steps, clearly telegraphed) ->
  rams in a straight line at full speed (damage + knockback on contact), skids, recovers, repeats; can be dodged by
  jumping. **territorial** (bear): slow wander; if the player comes within 5 tiles or hits it: rears up
  (windup), charges; gives up beyond 14 tiles. **pack** (wolves, night only): spawn as a group, howl, keep ~4 tiles
  away circling, one lunges at a time; never spawn within light radius x `lightRadiusFear` of `world.lights`, back
  off from lights and the house once it has `lamps` (`SPAWN.homeSafe`), never enter the plot once it has `walls`;
  flee at low hp and at dawn (despawn off-screen). **swim** (fish): only in water tiles, darting away; hit them with
  a spear/sword from the bank or while swimming.
- All: gravity + `moveBody`, jump at 1-tile walls, avoid deep water (except fish), never walk off-world, `hurtT`
  flash, knockback when hit. Hostile animals deal damage only on contact during an attack, respecting the player's
  i-frames (`hurtPlayer`). Difficulty: a fully fed cube with a stone sword should beat a boar; a bear needs iron.
- Emit `animal:sound` for idle calls (sparingly, only within ~25 tiles) and `animal:windup` for telegraphs.

### 6.3 API (`creatures/index.js`)
```js
init(G) step(G) save(G) -> data|null load(G, d)     // animals are not required to persist
spawnAnimal(G, kind, tx, ty) -> animal               // standing in cell (tx, ty)
animalsNear(G, px, py, rTiles) -> [animal]
hitAnimal(G, a, dmg, fromX, kb) -> died              // any damage source; drops + "animal:die" on death
meleeHit(G, rect {x0,y0,x1,y1}, tool, dir) -> hits   // a swing; called by core/action.js
shoot(G, ax, ay, tool) -> bool                       // needs + consumes an "arrow"; arrows live in G.projectiles
```
Animal object (RENDER reads): `{ id, kind, x, y, w, h, vx, vy, ox, oy (previous step position for interpolation),
grounded, facing, hp, maxHp, state ("idle"|"wander"|"flee"|"chase"|"windup"|"charge"|"swim"|... document new
ones), t, hurtT, atkCd, aggroT, inWater, anim (step counter), seed }`. Projectile: `{ id, kind:"arrow", x, y, ox,
oy, vx, vy, age, dmg }`.

---------------------------------------------------------------------------------------------------------------------

## 7. HOUSE - 20 levels

### 7.1 Levels (`data/house.js`; 20 levels, `HOUSE_LEVELS[lv-1] = { lv, name, cost, hammer, w, h, perks, perkText,
art }`; level 0 = empty plot)
| lv | name | key cost | hammer | footprint | perk (cumulative) |
|---|---|---|---|---|---|
| 1 | Lean-to | 12 wood, 6 fiber | - | 4x3 | home: respawn here |
| 2 | Hide tent | 10 wood, 3 hide, 2 rope | - | 5x4 | sleep at night (heal 30%) |
| 3 | Camp | 20 wood, 15 stone | wood | 7x4 | campfire station |
| 4 | Log hut | 50 wood, 10 stone, 4 rope | wood | 7x5 | workbench station, chest 9 |
| 5 | Log cabin | 80 wood, 30 plank, 30 stone | stone | 9x6 | bed heals fully, +10 max hp |
| 6 | Cabin with chimney | 60 plank, 50 stone, 12 clay | stone | 11x7 | smoker station, chest 18 |
| 7 | Cabin and garden | 40 plank, 20 fiber, 20 dirt, 5 berries, 3 apple | stone | 13x7 | garden 4 beds |
| 8 | Stone foundation | 120 stone, 40 plank, 20 clay | stone | 13x7 | furnace station |
| 9 | Stone cottage | 160 stone, 30 brick, 60 plank | iron | 14x8 | hunger x0.75 at home, chest 27 |
| 10 | Glass-window cottage | 80 brick, 20 glass, 12 iron ingot | iron | 14x8 | anvil station, lamps (wolves keep away) |
| 11 | Upper floor frame | 150 plank, 60 brick, 20 iron | iron | 15x10 | +10 max hp, chest 36 |
| 12 | Two-storey house | 120 plank, 120 brick, 30 glass | iron | 15x11 | kitchen station |
| 13 | Workshop wing | 100 plank, 40 iron, 20 rope | iron | 18x11 | repair tools at home |
| 14 | Watchtower | 300 stone, 80 brick, 30 iron, 4 fang | iron | 20x14 | tools wear x0.5 |
| 15 | Manor | 250 brick, 80 glass, 15 gold, 10 steel | steel | 20x14 | +20 max hp, garden 8 |
| 16 | Courtyard walls | 400 stone, 30 steel, 2 bear hide | steel | 24x14 | walls (no hostiles in plot), chest 45 |
| 17 | Great hall | 300 plank, 40 gold, 40 steel | steel | 24x16 | banquet: food x1.5 at home |
| 18 | Castle keep | 600 stone, 200 brick, 60 steel | steel | 24x18 | chest 54, nap any time |
| 19 | Castle towers | 80 gold, 80 steel, 30 crystal, 100 glass | steel | 24x20 | all stations, regen x2 at home |
| 20 | Crystal citadel | 100 crystal, 100 gold, 100 steel, 200 glass | steel | 24x22 | crown, +25 max hp, +25 max hunger |
Each level's `art` string in `data/house.js` is the brief for BONUS_RENDER. HOUSE may retune costs/perks for
pacing (keep 20 levels, keep the perk keys) and must keep every level reachable with the world's resources.

### 7.2 Perks (`house/index.js` folds them: `stations` union, `maxHp`/`maxHunger` sum, others latest value)
Keys: `home sleep ("night"|"any") sleepHeal stations chest maxHp maxHunger hungerMul garden lamps repair wearMul
walls banquet regenMul crown`. Consumers: CORE (wearMul, respawn), CRAFT (stations, hungerMul, banquet, regenMul),
CREATURES (lamps, walls), RENDER (crown, garden, lamps glow), HOUSE (sleep, chest, garden, repair).

### 7.3 API (`house/index.js`)
```js
init(G) step(G) save(G) load(G, d)
perksAt(level) -> perks      perks(G)      perkValue(G, key, dflt)      hasPerk(G, key)
footprint(G) -> { x0, x1, w, h, ground, doorX, bedX }   // tiles; centered in the plot, door = plot center column
nearHome(G, extraTiles = 3) -> bool      inPlot(G, tx) -> bool
respawnPoint(G) -> { x, y }              // px top-left: in front of the door, or world spawn while level 0
canUpgrade(G) -> { ok, next, missing, hammer, hasHammer, max? }
upgrade(G) -> bool                       // takes the cost, level++, buildT = 0, applies perks, "house:upgrade"
setLevel(G, lv)                          // debug/tests (no cost)
sleep(G) -> bool                         // "sleep" events; skips to dawn (or naps 3 h with sleep:"any"), heals
interact(G) -> bool                      // B_USE at the door (+-2 columns) or anywhere on the empty plot -> house panel
harvestGarden(G) -> items given
```
`G.house = { level, buildT (steps since the last upgrade; RENDER plays a ~3 s build animation while < 180), chest
(inv | null, grows with the chest perk), garden: { ready }, _perks }`. HOUSE adds: repair (house panel: restore
tool durability for a material cost), garden beds the player can harvest by B_USE in the garden area, optional
`G.platforms` for upper floors / stairs (one-way, so the cube can walk inside a 2-storey house), sleep at the bed
by B_USE, a trophy/achievement list if wanted. The plot tiles are protected (`world.protect`).

### 7.4 House UI (`house/ui.js`: `createHouseUI(ctx) -> { frame, destroy }`, registers panel "house")
Current level name + perks, **next level preview** (`renderer.drawHouse(ctx2d, lv, x, y, w, h)`), cost list with
have/need and item icons, hammer requirement, Upgrade (only near home), Sleep, House chest, Harvest garden, Repair,
a 20-step progress track. Celebrate upgrades (the renderer + audio react to `house:upgrade`).

---------------------------------------------------------------------------------------------------------------------

## 8. Screen, ctx, panels, layout (CORE `src/bonus/index.js`)

`createBonusScreen(app)` (screen protocol of CONTRACT.md 10) and `startBonus(app, params)`.
params `{ seed?, fresh? (new world, replaces the save), onExit? }`. It loads the save (or makes a new world), owns
the fixed-step loop (max 8 steps/frame), the camera (`src/render/camera.js`, ~17 tiles on the short side), the
panel manager, autosave, pause on blur/hidden, and calls per frame: `renderer.frame(view)`, `audio.frame(dt)`,
HUD + each UI's `frame(dt)`. **While any panel is open the game is paused** (no steps).

### 8.1 ctx (given to `createCraftUI(ctx)`, `createHouseUI(ctx)`, the HUD)
```js
ctx.app ctx.G ctx.renderer ctx.audio ctx.input   // getters (G changes on "new world": UIs are re-created then)
ctx.root          // <div class="bz-root"> in app.ui: position fixed, inset 0, pointer-events none (re-enable on yours)
ctx.isTouch       // coarse pointer / touch seen / forced: body also gets class "bz-touch"
ctx.panel         // name of the open panel or null
ctx.registerPanel(name, { open(data), close() })  // your open() builds DOM inside ctx.root, close() removes it
ctx.openPanel(name | null, data)                  // closes the current one first; null = close
ctx.closePanel()  ctx.toast(text, ms)  ctx.save() -> bool
```
Panels: CORE `"pause"`; CRAFT `"craft"`, `"chest"`; HOUSE `"house"`. Anyone can open one via `G.bus.emit("ui:open",
{panel, ...})`. Keys handled by CORE: Esc/P pause (or close the open panel), E/I/Tab toggle "craft", H toggle
"house", 1-9 hotbar, wheel/LB/RB hotbar, gamepad Start = "craft".

### 8.2 Input (`core/input.js`)
Keyboard: A/D or arrows move, W/Up/Space jump (app.input), **J or X = ACTION (hold)**, **F or C = USE**, S/Down = aim
down, W/Up = aim up. Mouse: pointer aims (tile under the cursor within 4.5 tiles, live 4 s after moving), left button
held = ACTION, right click = USE. Touch: finger on the world = aim there + ACTION while held (tap a tree to chop).
Gamepad: X action, Y use, d-pad down/stick = aim. On-screen buttons call `ctx.input.press(bit)`, `release(bit)`,
`pulse(bit)` (USE must be a pulse).

### 8.3 Screen regions (CSS px; must hold at 390x844 and 1280x720)
- Top-left (16 px gutter): CRAFT health/hunger HUD, <= 180 px wide (<= 120 px under 520 px width).
- Top-right: CORE clock + pause button (~190 px). Toasts: top-center at 64 px (118 px on touch).
- Hotbar: bottom-center 14 px up on desktop; on touch `top: 56px`, centered, 9 slots must fit 358 px (36 px slots).
- Touch (existing app.input buttons): left/right 76 px circles bottom-left, jump 92 px bottom-right. CRAFT adds HIT
  (72 px) at `right:124px; bottom:16px`, BAG + USE (56 px) stacked at `right:16px; bottom:124px`. Keep the bottom
  ~110 px for buttons (the camera keeps the cube above them).
- Modal panels: centered, `width: min(720px, 100vw - 32px)`, scroll inside, 44 px touch targets.

---------------------------------------------------------------------------------------------------------------------

## 9. BONUS_RENDER - everything you see

### 9.1 API (`render/renderer.js`; placeholder implements all of it)
```js
const r = createBonusRenderer(canvas)   // draws on app.canvas while the bonus screen is active (main renderer idle)
r.setGame(G)       // (re)build caches for this game, subscribe to G.bus; unsubscribe the previous game
r.frame(view)      // view = { G, camera, alpha, time (s), dt (s), cssW, cssH, paused }
r.drawIcon(ctx2d, itemId, x, y, size)          // every item in ITEMS; any 2D context; cache per (id, size)
r.drawHouse(ctx2d, level, x, y, w, h, opts?)   // house level 0..20 fitted into a box (house panel preview)
r.destroy()
```
Canvas: never resize it (main.js owns its size: `canvas.width = cssW * dpr`). Compute `k = canvas.width / cssW`
and set your own transform each frame; world -> screen: `sx = (wx - camera.x) * camera.zoom + cssW / 2`.
Interpolate everything with `alpha` (player `ox/oy -> x/y + smoothY`, animals `ox/oy`, projectiles `ox/oy`).
You may import (never edit) `src/render/*` helpers: `cube.js` (`createCubePaint`, `drawCube`, `drawDizzy`),
`themes.js` (`artFor("forest")` palettes), `util.js` (noise, colors, `makeCanvas`, `softDot`), `art.js`
(`paintFoliage`, `paintCloud`), `particles.js` (`createParticles`, `PK`), `textures.js`.

### 9.2 What it must look like ("realistic, beautiful", same family as Area 1's sunny forest)
- **Sky + parallax** by time of day: dawn pinks, bright day, golden dusk, deep-blue night with stars and a moon;
  baked parallax layers (far mountains/hills, tree lines) that match the biome under the camera (meadow, forest,
  pinewood, hills, river), cross-faded by `sun(G)` (bake day and night versions, blend with alpha).
- **Terrain**: baked chunks (16x16 tiles, re-bake only the touched chunk on `"tile"`; budget < 4 ms per re-bake;
  LRU-limit cached chunks), auto-detailed: grass caps with blades and flowers, soil strata with roots/pebbles, natural
  stone with cracks/lichen, ore veins that sparkle (coal black seams, iron rust, gold glints, crystals glowing
  cyan), clay, sand, gravel, placed planks/cobble/brick/glass that look built, rounded edges and AO where solids meet
  air, **cave back walls** behind mined/cave air below `world.surface` (darker with depth), animated river water
  (surface ripples, transparency, light shafts, reeds on banks).
- **Mining cracks** from `world.dmg` (`w / hp`, 4-5 crack stages), chips/dust particles on `tile:hit`, a break burst
  on `tile:break`, wood chips on `tree:hit`, a **falling-tree animation** on `tree:fall` (rotate the trunk away
  from the chopper, crash dust, leaves), stumps, saplings/young trees, fruit on oaks, bush berries (`obj.n`).
- **Trees**: oak / birch / pine / ancient oak, realistic layered canopies (pre-baked per seed variant), gentle wind
  sway (transform only).
- **Animals**: realistic side-view silhouettes with shading (rabbit, pheasant, deer with antlers, goat, boar,
  wolf, bear, trout), pre-rendered animation frames (idle, walk, run, windup, attack, swim) baked to sprite sheets,
  facing flip, white hurt flash, telegraph poses on windup, **death = soft puff of dust/leaves + the drops** (no
  blood, ever), wolves' eyes glint at night.
- **The cube**: `drawCube` from `src/render/cube.js` with mood (hurt -> worried, fall -> O mouth, dead -> X eyes +
  dizzy), squash/stretch on jump/land, the **selected tool held and swung** (`swingT/swingLen/swingKind`, tool
  tier colors), swimming bob, a torch glow when holding a torch, a **crown** with `hasPerk(G, "crown")`.
- **The house**: all 20 levels per `data/house.js` `art` (bake each level once to an offscreen canvas on
  `setGame`/`house:upgrade`), animated details (chimney smoke, camp fire, window glow at night, garden ripeness
  `G.house.garden.ready`, banners), a scaffolding + dust + sparkles build animation while `G.house.buildT < 180`,
  fireworks at level 20, the empty plot with a "build here" sign at level 0.
- **Objects**: workbench, campfire (animated flames), furnace (glow), anvil, chest, torches, lanterns, bushes,
  tall grass, mushrooms, rocks, flowers. **Drops**: the item icon bobbing with a soft shadow.
- **Lighting**: day/night via a low-res light buffer (e.g. 1/8 screen or 1 px per tile) redrawn each frame (or every
  2nd): ambient = `sun(G)` above ground, dark in caves (by depth below `world.surface`), light holes punched with
  pre-baked radial sprites (`destination-out`) for `world.lights`, the held torch, the house windows (level 10+
  lamps), campfires, crystals; then one smoothed `drawImage` over the scene. Warm color grading at dusk, cool at
  night. **No per-frame `'lighter'` full-screen composites, no animated `ctx.filter` blur, no per-frame large
  gradients** (cache them).
- **Target highlight**: subtle outline on `G.target` (tile/tree/object), dashed ghost of the item at
  `G.target.place`. Sleep fade (`"sleep"` events), hurt vignette flash (`player:hurt`), faint fade.
- **Icons** (`drawIcon`): every item by `icon.shape` + colors, crisp at 24-64 px, consistent lighting (top-left),
  tools show their tier material.
- Performance: 60 fps on UHD 620 at 1280x720 and on phones; one pooled particle system (~400 max); no allocation
  per frame in hot loops; draw only visible tiles/objects/animals.

---------------------------------------------------------------------------------------------------------------------

## 10. BONUS_AUDIO - music, ambience, sfx

### 10.1 API (`audio/index.js`)
```js
const ba = createBonusAudio(app)
ba.setGame(G)    // subscribe to G.bus (unsubscribe the previous)
ba.start()       // the bonus screen entered: music + ambience for the current phase
ba.stop()        // left: stop bonus ambience + sfx nodes, unsubscribe (the next screen starts its own song)
ba.frame(dt)     // every animation frame: day/night crossfades, distance-based volumes
```
BONUS_AUDIO extras (optional, tests/debug): `ba.play(name, opts, x?, y?)`, `ba.stats()`, `ba.SOUND_NAMES`. Files: `sfx.js`
(sounds), `events.js` (pure bus-event -> sound routing), `ambience.js`, `songs/homestead_day.js` + `songs/homestead_night.js`
(generated by `compose/homestead.mjs`). Browser check: `node tools/bonustests/audiocheck.cjs [--quick]` (browser lock).
### 10.2 Music
Write **new original songs** as pure data files in the song format (CONTRACT.md 6.2) under
`src/bonus/audio/songs/` (e.g. `homestead_day.js` warm folk/acoustic ~96-110 bpm with a memorable melody,
`homestead_night.js` calm nocturne; optional `homestead_build.js` short fanfare stinger), and play them with
`app.audio._play(songObject, { fadeIn, fadeOut })` (the engine's documented extra API; `playSong` only knows the 8
registry ids, which you must not edit). Validate them with `validateSong` from `src/audio/format.js` in
`tools/bonustests/audio.mjs`. Crossfade day <-> night on `time:phase` (dusk -> night, dawn -> day). Loops >= 90 s.
### 10.3 SFX + ambience
Synthesize on your own nodes on `app.audio.context` (create it lazily; it exists after `app.audio.unlock()`),
routed through your own gain that follows `app.audio.getVolume()` (`master * sfx`) and `app.audio.muted`
(poll in `frame`). You may import pure helpers from `src/audio/dsp.js` (read-only). Pre-render expensive sounds
once into AudioBuffers. Needed: chop (`tree:hit`, woody thock), tree crash (`tree:fall`), dig soft (`tile:hit` on
dirt/sand/clay/gravel), pick on stone/ore (`tile:hit` ringing, ore pitched brighter), break crumble (`tile:break`),
too hard clank (`tile:tooHard`), swing whoosh (`swing` by tool type), hit thud on animals (`animal:hit`), each
animal's call (`animal:sound`: squeak, cluck, bleat, grunt, howl, growl, splash), windup warning (`animal:windup`),
animal puff (`animal:die`), player hurt (`player:hurt`), faint/respawn, pickup pop (`pickup`, pitch by count),
craft (`craft` per station: hammer taps / sizzle at campfire / furnace roar / anvil clang), place (`place`), eat
crunch/munch (`player:eat`), tool break, jump/land/splash/swim, house upgrade fanfare (`house:upgrade`, bigger for
5/10/15/20), sleep lullaby + rooster at dawn (`sleep`), garden ripe chime, arrow shoot. Ambience: day birds +
wind + rustling leaves, river near the river (by distance), night crickets + owls, cave drips + low hum underground
(by depth), crackle near campfires. Rate-limit repeated sfx; keep voices modest (weak laptops).

---------------------------------------------------------------------------------------------------------------------

## 11. Debug seam `window.__cube.bonus` (CORE `core/debug.js`; installed when the bonus screen enters)
```js
state() -> { active, panel, frame, day, t, phase, clock, x, y, tx, ty, vx, vy, grounded, inWater, hp, maxHp, hunger,
             dead, house, inv: {id: count}, sel, animals, drops, target, seed, stats }
G, screen, ctx                                  // live objects
give(id, n) count(id) clearInv() select(i)
teleport(tx, ty?)                               // stand in cell (tx, ty); ty omitted = on the surface
surface(tx)  setTime(f | "dawn"|"day"|"dusk"|"night"|"midnight")  spawn(kind, tx?, ty?) -> id  setHouse(lv)
setInput(bits | null, aim?)                     // override the devices (aim = {tx,ty} | null | undefined = real)
speed(n)                                        // 1..16 sim steps per real step
step(n, bits, aim) -> state()                   // synchronous fast-forward
nearestTree(kind?) nearestObject(kind?) openPanel(name, data) closePanel() save() dump() load(saveObj) reset(seed)
```
Owners may add methods to this object from their own modules at runtime (e.g. `window.__cube.bonus.wolves = ...`)
only through a documented contract change; prefer the existing ones.

---------------------------------------------------------------------------------------------------------------------

## 12. Tests
```
node tools/bonustest.mjs [filter]   # headless logic tests: runs every tools/bonustests/*.mjs (each owner adds one)
node tools/bonusplay.cjs [--desktop]# browser smoke (browser lock!): boot, move, chop, panels, night, save/reload,
                                    # back to the main game, phone touch chop; screenshots tools/shots/bonus-*.png
node tools/simtest.mjs              # main game must stay 39/39
node tools/playtest.cjs --quick --offline   # main game smoke must stay OK (INTEGRATE runs the full one)
```
Test file shape: `export default async function (t) { t.test("name", () => { t.ok(c, msg); t.eq(a, b); t.near(a,
b, eps) }) }`; helpers `t.game(seed)`, `t.run(G, n, bits, aim)`, `t.standAt(G, tx, ty?)`, `t.tree(G, kind?)`,
`t.B` (bits), `t.T`. Each owner must cover their systems: WORLD (gen invariants for several seeds, mining every tile
type with the right tiers, regrowth, placing rules, drops, save/load of mods/objects), CREATURES (each behaviour,
spawning rules by biome/time/light, damage + knockback, drops, no animal falls out of the world in 20k steps),
CRAFT (every recipe reachable from the world, station rules, hunger curve, eating, chest moves), HOUSE (all 20
levels upgradeable with their costs + hammers, perks applied, sleep, garden, repair, save), RENDER (DOM, so add a
`// SECTION render` block to bonusplay.cjs: a drawIcon pass over every item without errors, frame-time sample
>= 55 fps on desktop, screenshots day/dusk/night/cave/river/house levels 1, 5, 10, 15, 20, animals), AUDIO
(`tools/bonustests/audio.mjs`: songs validate with `validateSong`, every bus event in the sfx list is mapped).
Before finishing: `node --check` every file you touched, `node tools/bonustest.mjs` green, `node tools/bonusplay.cjs`
green (respect the browser lock, run in the foreground, one browser), main-game tests still green.

## 13. INTEGRATE (later)
Unlock + entry: a "Bonus: Wildwood Homestead" card on the areas screen and/or title once `progress.done.area3`
(or `unlockAll`), Continue / New world buttons (`readSave`/`hasSave`), `params.onExit` back to the areas screen,
replace the temporary `?bonus=1` route (keep a debug flag if useful), shared settings (volumes/touch), the hub card
text, `tools/playtest.cjs` coverage, final performance pass.

## 14. Measured baseline (CORE run, this machine)
- `node tools/bonustest.mjs`: **371 checks, 0 failed** (core.mjs: data consistency incl. every item obtainable,
  gen determinism/invariants for 2 seeds, run speed 3.5 px/step, full jump 87 px, 1-tile step-up / 2-tile wall
  block, swimming, hand-chop -> wood + stump regrows to a sapling, hand digs dirt / stone needs a pickaxe /
  pickaxe wears, crafting + placing a workbench, hunger/eating/starving, house upgrades + hammer gate + perks +
  respawn, faint -> wake at home keeping items, full day cycle + sleep, save round trip, 20k steps in ~190 ms).
- `node tools/bonusplay.cjs`: **ALL OK** - main game boots to the title without loading bonus code; `?bonus=1&new&
  seed=1234` boots; 60 fps (placeholder renderer); keyboard/override movement; chopping the starter oak gives 6 wood;
  E opens / Esc closes the crafting panel; night; save + reload restores; quit to title and main-game play still
  works; phone 390x844: move/jump + HIT/USE/BAG buttons, chopping with HIT works, 60 fps; no page errors.
- `node tools/simtest.mjs` 39/39; `node tools/playtest.cjs --quick --offline` PLAYTEST OK.

## 15. INTEGRATE notes (final)
- Entry: area select card "Wildwood Homestead" (`src/ui/bonuscard.js`, `playBonus(app, fresh)` in `src/ui/menu.js`),
  locked until `progress.done.area3` (or `unlockAll`); Continue / New world (tap twice) / Start; the preview paints the
  saved house (level >= 3, else level 12). Area 3 results show a one-time unlock note and a "Play the bonus level" button.
- Routes: `?area=bonus` or `?bonus` continue when unlocked, else the area select; `?bonus&debug[&new][&seed=N]` always
  opens it (tests). `onExit` returns to the area select.
- Pause menu gained **Return home** (`house.goHome(G)`: teleport to the door/spawn for 8 hunger, refused while a hostile
  is hunting you): the way out of a deep cave after a pickaxe breaks. New event `player:home`.
- Balance: tall grass drops 2 fiber (was 1) so the lean-to is reachable from the grass near spawn.
  `tools/bonusbalance.mjs` plays fresh worlds headless and estimates the full run; `--check` gates the early game.
- `tools/bonusplay.cjs` has a `SECTION integrate` block (unlock, area 3 -> bonus, every tool tier, hunt, cook + eat,
  sleep, 20 upgrades through the panel, save, continue, pause/settings/return home/save & quit, phone, fps).
- Section 7.1 costs are superseded by `src/bonus/data/house.js`; section 6.1 bear is 90 hp / armour 5 / 22 dmg.
