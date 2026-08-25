# Difficulty Chart Obby — CONTRACT (authoritative spec)

A complete Roblox Studio difficulty chart obby, delivered as a `.rbxlx` place file.
Built like `roblox-tycoon/` and `lifting-simulator-roblox/`: **all world geometry is
generated**, sources are syntax-checked with luaparse (Lua 5.1 grammar), and
`node difficulty-obby-roblox/build.js` writes the place file to both the repo and
`C:/Users/krist/Desktop/DifficultyChartObby.rbxlx`.

## Thomas's request (verbatim, the ground truth for spec compliance)

> make a roblox difficukty chart obby into roblox studio and put the game into my home
> page on my computer and the difficulty chart obby starts with a stage called the
> beggining then a stage called exist then just jump then simply walk then walk around
> it then 5 cake walk stages then 5 effortless stages then 5 easy stages then 10 medium
> stages then 5 hard stages then 5 difficult stages then 5 challenging stages then 5
> intense stages then 5 remorseless stages then 5 insane stages then 5 extreme stages
> then 10 terrifying stages then 5 catastrophic stages then 5 nil stages then 3
> megadeath stages then 2 dilly impossuble stages annd make every difficulty sarting at
> medium and past medium have the last of that difficulty's stage be a tower stage which
> is 5 times longer than a normal stage in that difficult and make each difficulty get
> longer and longer and harder and harder as the difficulty goes up just like in roblox
> but with the longer and longer part and make it have no bugs and have each stae be a
> checkpoint that saves your progress for when you leave or die and make a arrow button
> at the top of your screen that can let you go to any stage you want that you already
> unlocked and make the game like roblox in roblox and make it detailed and do exaclt
> what i said

Requirements distilled:
1. Exactly 90 stages in the exact order/counts below.
2. Every difficulty from **Medium onward**: its **last** stage is a **Tower** with
   **5× the platforms** of that difficulty's normal stage.
3. Difficulties get **longer AND harder** monotonically.
4. Every stage is a **checkpoint**; progress **persists across death AND leaving**
   (DataStore).
5. An **arrow button at the top of the screen** opens a stage picker; the player can
   teleport to **any already-unlocked stage**.
6. Detailed, authentic Roblox-DCO feel. No bugs — every jump must be possible with the
   **default Roblox character** (WalkSpeed 16, JumpHeight 7.2, gravity 196.2).

## The 90 stages

| Difficulty | Count | Stage #s | Tower stage | Tower platforms | Color (BrickColor-ish hex) |
|---|---|---|---|---|---|
| The Beginning | 1 | 1 | — | — | #FFFFFF white, gold trim |
| Exist | 1 | 2 | — | — | #E8E8E8 |
| Just Jump | 1 | 3 | — | — | #D0F0FF |
| Simply Walk | 1 | 4 | — | — | #C8FFC8 |
| Walk Around It | 1 | 5 | — | — | #FFE8C0 |
| Cake Walk | 5 | 6–10 | — | — | #F7A8D8 pink |
| Effortless | 5 | 11–15 | — | — | #9FF781 pale green |
| Easy | 5 | 16–20 | — | — | #75F347 green |
| Medium | 10 | 21–30 | 30 | 80 | #FFFE00 yellow |
| Hard | 5 | 31–35 | 35 | 90 | #FD7C00 orange |
| Difficult | 5 | 36–40 | 40 | 105 | #FF0536 red |
| Challenging | 5 | 41–45 | 45 | 120 | #B01030 maroon |
| Intense | 5 | 46–50 | 50 | 135 | #661717 dark red-brown |
| Remorseless | 5 | 51–55 | 55 | 150 | #FF00EA magenta |
| Insane | 5 | 56–60 | 60 | 165 | #0034FF blue |
| Extreme | 5 | 61–65 | 65 | 180 | #00A2FF light blue |
| Terrifying | 10 | 66–75 | 75 | 200 | #7F00FF purple |
| Catastrophic | 5 | 76–80 | 80 | 220 | #FFFFFF white (neon) |
| NIL | 5 | 81–85 | 85 | 240 | #4A4A4A glitch gray (glass) |
| Megadeath | 3 | 86–88 | 88 | 260 | #1A0000 black + red neon |
| Dilly Impossible | 2 | 89–90 | 90 | 275 | black + rainbow neon |

Total = 90. Towers at stages 30, 35, 40, 45, 50, 55, 60, 65, 75, 80, 85, 88, 90.
Display names: single-stage difficulties use the difficulty name ("The Beginning");
multi-stage use "Medium 3"; towers use "Medium Tower" etc. ("Steeple of Medium" style
naming is NOT used — keep it plain and readable).

After stage 90's tower top: a **Winners area** (gold platforms, confetti particle
emitters, "YOU BEAT THE OBBY!" sign). Touching the winner pad gives the player a
rainbow sparkle aura + "WINNER" billboard over their head. Not a stage.

## Difficulty ramp (normal stages)

`plats` ramps linearly from first→last normal stage of the difficulty (so the game gets
longer stage by stage as well as difficulty by difficulty). Tower platforms = 5 × last
normal count (table above).

| Difficulty | plats | gap range | plat size | new hazards (cumulative) | spinner tip speed |
|---|---|---|---|---|---|
| Cake Walk | 6→8 | 2–3 | 8 | none | — |
| Effortless | 8→10 | 3–4 | 7 | none | — |
| Easy | 10→12 | 4–4.8 | 6 | rare kill tiles | — |
| Medium | 12→16 | 4.5–5.5 | 5.5 | kill tiles, slow spinners | ≤8 |
| Hard | 15→18 | 5–6 | 5 | headhitters | ≤10 |
| Difficult | 18→21 | 5.5–6.5 | 4.5 | narrow beams (width 2) | ≤12 |
| Challenging | 21→24 | 6–6.6 | 4 | checker kill patterns | ≤12 |
| Intense | 24→27 | 6–7 | 3.5 | wall-hug ledges | ≤14 |
| Remorseless | 27→30 | 6.5–7 | 3 | double spinners | ≤16 |
| Insane | 30→33 | 6.5–7.5 | 2.8 | beams width 1.5 | ≤18 |
| Extreme | 33→36 | 7–7.5 | 2.5 | all mixed, denser | ≤20 |
| Terrifying | 36→40 | 7–8 | 2.2 | fast spinners | ≤22 |
| Catastrophic | 40→44 | 7.5–8 | 2 | denser everything | ≤24 |
| NIL | 44→48 | 7.5–8.2 | 2 | glass look, dark | ≤24 |
| Megadeath | 48→52 | 8–8.5 | 1.8 | max density | ≤24 |
| Dilly Impossible | 55 | 8.2–8.7 | 1.6 | everything at max | ≤24 |

Stages 1–5 are hand-designed specials:
1. **The Beginning** — wide welcome plaza on a grassy floating island, arch reading
   "THE BEGINNING", contiguous wide path. Spawn is here.
2. **Exist** — one long platform. You just exist and walk ~20 studs.
3. **Just Jump** — two platforms, one 4-stud gap.
4. **Simply Walk** — ~40-stud gently zigzagging walkway, no gaps.
5. **Walk Around It** — walkway blocked by a big wall; walk around it on a ledge.

## Feasibility rules (the validator MUST enforce these; build fails otherwise)

Default character: max edge-to-edge jump ≈ 10.5 studs flat; safe design caps:
- Horizontal edge-to-edge gap `g ≤ 8.7`; rise `r ≤ 5`; combined `g + 1.3*max(r,0) ≤ 9.3`.
  For each hop the generator picks `g` from the difficulty's gap range FIRST, then caps
  `r ≤ (9.3 − g)/1.3` (and `r ≤ 5`) — late difficulties are intentionally near-flat.
- Per-difficulty `g` must stay inside that difficulty's gap range (turn/connector
  walkways and tower interiors may use smaller gaps, never larger).
- Headroom ≥ 7 studs above every platform's landing area, EXCEPT designed headhitters:
  clearance exactly 6.75 (tall user avatars run up to ~6.3 studs and must fit walking;
  jumping under still bonks — a jump needs ~12.2 studs), only over contiguous walk
  sections (gap 0 beneath them).
- Tower climb: rise per platform 2.5–3.5, platforms spiral within a 26×26 interior;
  shell (corner pillars + walls) at ≥ ±15 so it never blocks a jump, and the shell MUST
  fully enclose the interior from the base floor to ≥ 10 studs above the top platform —
  the only openings are a base doorway (≥ 6 wide × 9 tall) and an enclosed top exit
  leading to the next stage's checkpoint (nobody can fall or jump out of a tower onto
  other stages or past the kill-floor margin). Falls inside a tower land on lower tower
  platforms or the tower base floor (safe) — like Tower of Hell, falling loses progress
  but doesn't kill.
- Checkpoint pads: 6×1×6 minimum landing, reachable from previous stage's last
  platform with gap ≤ 4 and rise ≤ 2.
- Every stage has an invisible **kill floor** ≥ 25 studs below its lowest platform,
  spanning the stage AABB + 20-stud margin, CLIPPED back wherever that margin would
  intersect another stage's AABB (a kill floor never intersects any stage's parts).
  Adjacent stages' kill floors must jointly leave no uncovered horizontal gap between
  them (overlap, or a shared edge at the height of the lower floor).
- Spinner arms: bottom = platform top + 0.5, vertical thickness ≤ 1 (jumpable),
  `armWidth ≤ 2`, never sweep over a checkpoint pad. Tip speed per table. Any spinner
  whose swept diameter `2*(radius+armWidth) > 8` (not crossable in one jump) must have
  arm-pass period `(360/arms)/speedDeg ≥ 1.2 s` so a player can land and leave between
  arms. The full swept disc (radius + armWidth) must lie entirely over ONE flat
  platform and clear of all other parts (no arm passing under/through a neighboring
  platform at a different height).
- Stage AABBs must not overlap each other (≥ 4-stud margin), except at shared
  checkpoint boundaries.
- Part ownership (for AABBs and kill-floor spans): kind-7 gate parts belong to the
  FIRST stage of the new difficulty; connector walkway parts belong to the stage whose
  exit they extend. Both count toward that stage's AABB and kill-floor span.
- Layout snakes: build along a heading (4 cardinal directions); when |x| exceeds
  ~1600, insert a wide (≥8 stud), gap-free 90° connector walkway and turn. Each new
  difficulty also starts with a **difficulty gate** (arch in difficulty color, name on
  it). Gates stand only over gap-free walkway sections; the crossbar's underside is
  ≥ 12 studs above the walkway (a jump needs ~12.2 studs of ceiling — no head-bonks),
  and pillar inner faces are ≥ the walkway width apart (never pinch the path).
  Coordinate bounds: |x|,|z| ≤ 8000, y ≤ 12000 (the mandatory tower climb alone totals
  ~5600–7800 studs; StreamingEnabled handles the altitude fine).
- Determinism: seeded RNG (mulberry32, seed 90) — `node generator.js --selftest`
  produces identical output every run.

## Architecture / file ownership

```
difficulty-obby-roblox/
  CONTRACT.md            (this file)
  build.js               assembler: gen → validate → luaparse-check → .rbxlx
  generator.js           Node: layout generation + validation + Lua serialization
  src/Main.server.lua    server: build world from data, checkpoints, DataStore,
                         remotes, spinner animation, kill parts, victory, lighting
  src/ClientUI.client.lua client: arrow button + stage-select GUI
  gen/                   (build artifacts: StageData1..N.lua, StageIndex.lua)
```

### generator.js exports (CommonJS)

```js
module.exports = { generate };
// generate() -> {
//   luaModules: [{ name: 'StageData1', source: '...' }, ..., { name: 'StageIndex', source: '...' }],
//   stats: { stageCount, partCount, towers: [30,...], maxGap, maxRise, bounds },
//   errors: []   // validator failures; build.js aborts if non-empty
// }
```
Run directly: `node generator.js --selftest` prints stats, exits 1 on any error.
Split StageData modules ≤ 150 KB each. Numbers ≤ 2 decimal places.

### Lua data schema

The generated modules are ModuleScripts under `ReplicatedStorage/DCOData/`
(StageData1..N + StageIndex). `require(DCOData.StageIndex)` returns an array of 90:

```lua
{
  n = 21,                     -- stage number
  name = "Medium 1",          -- display name
  diff = "Medium",            -- difficulty name (also drives material/aesthetic)
  color = {1, 0.996, 0},      -- 0..1 floats
  tower = false,
  cp = {x, y, z, ry},         -- checkpoint pad center (y = pad top surface), spawn yaw degrees
  parts = {
    -- {kind, x, y, z, sx, sy, sz, ry}  -- ry = yaw degrees; positions are centers
    -- kind 1 = platform (difficulty color/material)
    -- kind 2 = kill part (neon red)
    -- kind 3 = neutral deco (collidable)
    -- kind 4 = wall
    -- kind 6 = invisible kill floor
    -- kind 7 = difficulty gate part (arch pieces; the crossbar gets a SurfaceGui with
    --          the difficulty name — the crossbar is the kind-7 part with the largest sx)
    -- kind 8 = stage sign board (server adds SurfaceGui "STAGE n" + display name)
    -- kind 9 = spinner spec: {9, x, y, z, radius, arms, speedDeg, armWidth}
    --          (y = platform top under it; server builds hub + neon kill arms).
    --          PINNED GEOMETRY (generator validation and server build MUST agree):
    --          `arms` box arms, each Size = (radius, 0.8, armWidth), extending from
    --          the hub center outward along +X, arm k yaw-rotated k*(360/arms) degrees
    --          at t=0 (phase 0 — deterministic); positive speedDeg rotates
    --          counterclockwise viewed from above (+Y); arm bottom = y + 0.5 (arm
    --          center at y + 0.9); hub = small anchored cylinder (radius ~1.5), NOT a
    --          kill part. Tip speed = radius * speedDeg * pi/180 studs/s; the
    --          validator uses exactly this geometry for the tip-speed and
    --          checkpoint-sweep checks.
  },
}
```
`StageIndex` requires its siblings and merges: stages sorted by `n`, exactly 1..90.

Part flags (server sets them when building): kinds 2 and 6 and spinner arms are
Anchored, CanCollide=false, CanTouch=true, CanQuery=false; kind 6 additionally
Transparency=1. Kinds 1, 3, 4, 7, 8 and checkpoint pads are Anchored,
CanCollide=true. Everything in the world is Anchored.

### Runtime contract (server = Main.server.lua)

- Builds everything from StageIndex into `workspace.DCO` (Folder) on startup, sets
  Lighting (nice sky, Atmosphere), `Players.RespawnTime = 2`. The world build is fully
  synchronous (no yields). Only AFTER it completes: create
  `ReplicatedStorage/DCORemotes` (Folder) + `TeleportToStage` (RemoteEvent), connect
  PlayerAdded/PlayerRemoving, then iterate `Players:GetPlayers()` and run the same
  on-join handler for anyone already present (and run each existing Character through
  the CharacterAdded path) — no player or character is missed or spawns into a
  half-built world.
- Per player: attributes `BestStage`, `CurrentStage` (ints, start 1); leaderstats
  `Stage` = BestStage. Load from DataStore `DCO_Progress_v1`, key `u_<UserId>`, value
  `{ b = best, c = current }`. All DataStore calls pcall-wrapped with 1 retry; game is
  fully playable when DataStores are unavailable (Studio). Each player gets a "loaded"
  flag set when GetAsync (plus its retry) resolves OR fails. Save: on change (debounced
  ≥ 10 s per player), on PlayerRemoving, and BindToClose — but only players whose data
  changed since their last successful save (skipping unchanged players also sidesteps
  the ~6 s same-key SetAsync cooldown). BindToClose returns immediately when DataStores
  were detected unavailable or no player is dirty; otherwise it saves dirty players in
  parallel (task.spawn + counter) with a bounded total wait.
- Checkpoint pads carry attribute `Stage`; on Touched by a living character:
  `CurrentStage = n`, `BestStage = max(BestStage, n)`, pad flash + sound feedback.
- CharacterAdded: wait for HumanoidRootPart AND for the character to be a descendant
  of Workspace, and wait (bounded, up to 10 s) for the player's DataStore "loaded"
  flag so a returning player's first spawn goes to their saved stage, then `task.defer`
  one step and pivot the character to checkpoint `CurrentStage` — model pivot
  (≈ HumanoidRootPart center) at **pad top + 4 studs** (pivoting at +2 embeds the feet
  in the pad), facing `ry`. 0.2 s later, if the HRP is not within ~10 studs of the
  target, pivot once more (the engine's own spawn placement can overwrite the first
  pivot).
- StreamingEnabled is on, so before EVERY server pivot (spawn placement and
  TeleportToStage): `pcall(function() player:RequestStreamAroundAsync(cpPos, 5) end)`,
  anchor the HumanoidRootPart during the wait, pivot, then unanchor — otherwise the
  client-owned character falls through unstreamed geometry into the kill floor.
  (ReplicatedStorage is never streamed, so the client's `require(StageIndex)` needs no
  special handling — do not "fix" it.)
- `DCORemotes/TeleportToStage`: created by Main.server.lua at startup (see above);
  ClientUI uses `WaitForChild("DCORemotes")` then `WaitForChild("TeleportToStage")`
  (both guaranteed, so unbounded WaitForChild is acceptable there). Server validates
  `1 ≤ n ≤ BestStage` and `n` is an integer, then pivots the character to checkpoint
  n (same streaming + pivot rules as above) and sets `CurrentStage = n`.
- Static kill parts (kinds 2 and 6): one Touched handler → `Humanoid.Health = 0`
  (this intentionally kills through ForceFields — do NOT use TakeDamage, which a
  ForceField blocks); guard with `Humanoid.Health > 0` purely to avoid redundant
  re-processing.
- Spinners: single Heartbeat loop rotating all hubs by CFrame (anchored). Spinner arm
  kills are detected in that SAME loop via `workspace:GetPartsInPart(arm, params)`
  (OverlapParams excluding the DCO folder), resolving hit parts to a Humanoid and
  setting Health = 0 — Touched does not fire reliably for CFrame-moved anchored parts
  and must NOT be used for arms.
- Winner pad past stage 90: aura + billboard, does NOT change stage numbers.

### Runtime contract (client = ClientUI.client.lua)

- Top-center ScreenGui: `◀`  `[ Stage 23 — Medium 3 ▼ ]`  `▶`.
  - The **▼ arrow button** toggles a ScrollingFrame listing all 90 stages, each row
    colored by its difficulty, "🔒" and grayed if `> BestStage`, clickable to
    teleport (fires TeleportToStage) if unlocked.
  - `◀` / `▶` teleport to CurrentStage∓1, clamped to `[1, BestStage]`.
- Reads names/colors from `require(ReplicatedStorage.DCOData.StageIndex)`; reads
  progress from player attributes (`GetAttributeChangedSignal` to live-update).
  Treat nil `BestStage`/`CurrentStage` as 1 everywhere (the server's DataStore load
  may still be in flight when the GUI builds), and rebuild lock states on
  `GetAttributeChangedSignal` for BOTH attributes.
- Clean, rounded, mobile-friendly (uses Scale sizing + UICorner; ScrollingFrame works
  with touch). No blocking `WaitForChild` without the instance being guaranteed.

## Language rules

Lua sources must parse under **plain Lua 5.1 grammar** (luaparse): NO Luau-only
syntax — no `continue`, no `+=`, no type annotations, no string interpolation
backticks. `task.wait`/`task.spawn` etc. are fine (they're calls, not syntax).
Never include the literal sequence `]]` + `>` in any Lua source (breaks CDATA).

## Build

`node difficulty-obby-roblox/build.js`
1. `generate()` → abort on validator errors.
2. Write `gen/*.lua`, luaparse-check ALL sources (hand-written + generated).
3. Assemble rbxlx: Workspace (`StreamingEnabled=true`), Lighting, ReplicatedStorage
   (DCOData modules + folder), ServerScriptService (Main), StarterPlayer →
   StarterPlayerScripts (ClientUI).
4. Write `difficulty-obby-roblox/DifficultyChartObby.rbxlx` AND
   `C:/Users/krist/Desktop/DifficultyChartObby.rbxlx`, print stats.
