# Weight Lifting Simulator — Build Contract (v1)

Every module author MUST follow this exactly. Deviations break the assembly.
Game concept: click while HOLDING a lifting item to gain Strength points. Buy better items,
rebirth for multipliers, unlock the Space World, Dumbbell World and Lava Zone, grow huge,
collect titles and auras. Everything is built to look as **realistic and detailed** as
brick-built Roblox geometry allows — real-looking items, a real-looking gym, a giant
space zone. No free-floating neon cubes labelled "pencil": model the actual object.

## Deliverable

`node lifting-simulator-roblox/build.js` assembles `src/*.lua` into
`WeightLiftingSimulator.rbxlx` (repo copy + `C:\Users\krist\Desktop\WeightLiftingSimulator.rbxlx`).

| File | Becomes | Written by |
|---|---|---|
| `Main.server.lua` | Script `LiftMain` in ServerScriptService | orchestrator (done) |
| `Config.lua` | ModuleScript child of LiftMain | orchestrator (done) |
| `Util.lua` | ModuleScript child | core agent |
| `Data.lua` | ModuleScript child | server-core agent |
| `Rebirth.lua` | ModuleScript child | server-core agent |
| `Lift.lua` | ModuleScript child | gameplay agent |
| `Shop.lua` | ModuleScript child | gameplay agent |
| `Leaderboard.lua` | ModuleScript child | gameplay agent |
| `ItemModels1.lua` | ModuleScript child | models-1 agent |
| `ItemModels2.lua` | ModuleScript child | models-2 agent |
| `ItemModels3.lua` | ModuleScript child | models-3 agent |
| `WorldGym.lua` | ModuleScript child | world-gym agent |
| `WorldSpace.lua` | ModuleScript child | world-space agent |
| `WorldDumbbell.lua` | ModuleScript child | world-dumbbell agent |
| `Auras.lua` | ModuleScript child | cosmetics agent |
| `ClientUI.client.lua` | LocalScript in StarterPlayerScripts | client-ui agent |
| `ClientFX.client.lua` | LocalScript in StarterPlayerScripts | client-fx agent |

All world geometry is generated at runtime by these scripts. Nothing is pre-modeled.
Avatar is forced to **R15** by the place file (needed for Humanoid scale values).

## Language rules (STRICT — a Lua 5.1 parser syntax-checks every file)

- Luau **runtime** APIs are fine (`task.wait`, `task.spawn`, `Instance.new`, attributes, TweenService, etc.).
- Luau **syntax extensions are BANNED**: no type annotations (`: string`), no `+=`/`-=`/`..=`,
  no `continue`, no `if x then y else z` expressions, no interpolated strings `` `...` ``.
- Never write the character sequence `]]>` anywhere (XML CDATA). Long strings `[[ ]]` are fine otherwise.
- Every ModuleScript returns a table. **No module requires another module** — wiring below.
- Numbers up to 1e22 are plain Lua doubles. Fine.

## Wiring

`Main.server.lua` requires every module, builds context `G`, then calls `M.Init(G)` in order:
`Util, Config, Data, ItemModels1, ItemModels2, ItemModels3, Shop, Lift, Rebirth, Auras, Leaderboard, WorldGym, WorldSpace, WorldDumbbell`.
`Init(G)` stores G, registers builders/handlers — **no world building**. Then Main calls:
1. `WorldGym.Build(G)`, `WorldSpace.Build(G)`, `WorldDumbbell.Build(G)`
2. `Shop.BuildDisplayModels(G)` — one display clone of every item into `ReplicatedStorage.ItemModels` (for client ViewportFrames)
3. `Leaderboard.Start(G)`; `Lift.Start(G)` (autoclick/burn/regen loops)
4. `Data.HookPlayers(G)` — PlayerAdded/Removing/CharacterAdded (Data re-applies size/aura/title/morph and re-gives owned tools on spawn, via `G.Lift.ApplySize`, `G.Auras.Apply`, `G.Shop.GiveTool`)

`G = { Util, Config, Data, Lift, Rebirth, Shop, Auras, Leaderboard, WorldGym, WorldSpace, WorldDumbbell, Remotes = <Folder>, ItemBuilders = {} }`
(ItemModels modules never appear in G — they only fill `G.ItemBuilders[id] = builderFn` during Init.)

## Remotes (Main creates `ReplicatedStorage.Remotes` before any Init)

- RemoteEvent `Lift` — client→server, no args: one manual lift request.
- RemoteEvent `LiftFX` — server→ALL clients `(character, gainedText, itemId)`. Clients: floating "+N" popup above that character + play the lift animation on that character's arms.
- RemoteEvent `GrowFX` — server→ALL clients `(character, multText)`. Size-up celebration.
- RemoteEvent `BurnFX` — server→one client `()`. Candle burn tick: orange screen flash.
- RemoteEvent `Notify` — server→client `(text, colorName)`; colorName in `"green","red","yellow","white"`.
- RemoteEvent `StateChanged` — server→client `()`: something you own/unlocked changed; client re-fetches GetState.
- RemoteFunction `Buy` — client→server `(kind, id)` → `(ok, message)`. kind ∈ `"item","aura","rebirth"` (rebirth id: `"r1".."r4","r5","r5b","r6"`).
- RemoteFunction `Equip` — client→server `(kind, id)` → `(ok, message)`. kind ∈ `"title","aura","morph"`; id `""` unequips (`morph` id: `"on"`/`""`).
- RemoteFunction `GetState` — client→server `()` → table `{points, lifetime, multi, rebirthLevel, spaceUnlocked, dumbbellUnlocked, dumbbellMulti, lavaUnlocked, autoUnlocked, items = {id=true}, auras = {id=true}, titles = {name=true}, equippedTitle, equippedAura, morph}`.

Live numbers replicate as **attributes on the Player**: `Points, Lifetime, Multi, RebirthLevel, SizeMult, AutoUnlocked, SpaceUnlocked, DumbbellUnlocked, DumbbellMulti, LavaUnlocked, EquippedTitle, EquippedAura, Morph`. Data.SetPoints updates attributes; clients read via GetAttribute/GetAttributeChangedSignal.

## Config.lua (orchestrator-written; single source of numbers — everyone reads, nobody edits)

- `Config.Items` — ordered array `{id, name, cost, power, world, req, desc}`; `world ∈ "gym","space","dumbbell","lava"`; `req ∈ nil,"r1","r2","space","r4","dumbbell","lava"`.
- `Config.Rebirths` — map by id r1..r6 (see table below).
- `Config.Sizes` — ordered `{points, scale}` thresholds on CURRENT points.
- `Config.Titles` — ordered `{points, name, color = {r,g,b} 0-255, morph = bool}` thresholds on LIFETIME points.
- `Config.Auras` — ordered `{id, name, cost, desc}`.
- `Config.CandleSafePoints = 100000`, `Config.AutoInterval = 0.2`, `Config.ManualRateLimit = 10` (max manual lifts/s).

### THE ITEM LIST (exact ids, names, costs, powers — DO NOT ALTER)

Builders: [1]=ItemModels1 [2]=ItemModels2 [3]=ItemModels3. `G.ItemBuilders[id]()` → Model (hand-scale, PrimaryPart set).

| id | name | cost | power/click | world | req | builder |
|---|---|---|---|---|---|---|
| pencil | Pencil | 0 | 1 | gym | — | 1 |
| rock | Rock | 50 | 2 | gym | — | 1 |
| book | Book | 250 | 4 | gym | — | 1 |
| lamp | Small Lamp | 1,250 | 5 | gym | — | 1 |
| candle | Candle | 10,000 | 20 | gym | r1 | 1 |
| tv | TV | 35,000 | 35 | gym | r1 | 1 |
| house | House | 1,000,000 | 50 | gym | r1 | 1 |
| cybertruck | Cybertruck | 2,000,000 | 70 | gym | r2 | 1 |
| tree | Tree | 5,000,000 | 100 | gym | r2 | 1 |
| train | Train | 25,000,000 | 400 | gym | r2 | 1 |
| moon | Moon | 125,000,000 | 550 | space | space | 2 |
| pluto | Pluto | 225,000,000 | 750 | space | space | 2 |
| mars | Mars | 350,000,000 | 1,000 | space | space | 2 |
| earth | Earth | 500,000,000 | 1,500 | space | space | 2 |
| neptune | Neptune | 750,000,000 | 2,500 | space | space | 2 |
| jupiter | Jupiter | 1e9 | 4,000 | space | space | 2 |
| sun | Sun | 3e9 | 8,000 | space | space | 2 |
| blackhole | Black Hole | 100e12 | 14,000 | space | r4 | 2 |
| protein | Protein Bar | 0 | 0.1 | dumbbell | dumbbell | 3 |
| dumbbell | Dumbbell | 1,000 | 1 | dumbbell | dumbbell | 3 |
| pushups | Pushup Bars | 100,000 | 5 | dumbbell | dumbbell | 3 |
| situps | Situp Bench | 1e9 | 150 | dumbbell | dumbbell | 3 |
| universe | The Universe | 10e15 | 10,000 | dumbbell | dumbbell | 3 |
| lavaball | Lava Ball | 10e15 | 15,000 | lava | lava | 3 |
| lavaplanet | Lava Planet | 1e18 | 125,000 | lava | lava | 3 |
| lavaeclipse | Lava Eclipse | 10e18 | 150,000 | lava | lava | 3 |
| gdstar | GD Star | 1e21 | 450,000 | lava | lava | 3 |

The **Candle** additionally burns its holder: while equipped and Points < 100,000 (10× its
cost), 1 damage per second (never below 10 HP — it can hurt you but NOT kill you) + `BurnFX`.
Everyone regenerates +5 HP/s when not burned in the last 3 s (Lift.Start loop).

### REBIRTHS (exact — the multiplier model)

`Multi = LadderMult[rebirthLevel] * (spaceUnlocked and 3 or 1) * (dumbbellMulti and 50000 or 1) * (lavaUnlocked and 40 or 1)`
LadderMult = {[0]=1, [1]=3, [2]=15, [3]=125, [4]=50000}.

| id | name | cost | effect |
|---|---|---|---|
| r1 | Rebirth 1 | 2,500 | level→1 (×3). Wipes points + owned items (tools removed). |
| r2 | Rebirth 2 | 1,200,000 | level→2 (×15). Permanently unlocks the **Autoclicker** (auto-lift every 0.2 s while an item is held out; stays unlocked through every later reset). Wipes points + items. |
| r3 | Rebirth 3 | 100e6 | level→3 (×125). Permanently unlocks the **Space World** (adds the permanent ×3 space bonus). Wipes points + items. |
| r4 | Rebirth 4 | 15e9 | level→4 (×50,000 replaces ×125). Wipes points + items. |
| r5 | Rebirth 5 | 1e15 | FIRST time only: unlocks the **Dumbbell World**, wipes points + items **and resets rebirth level to 0**. (Space/auto/world unlocks persist.) |
| r5b | Rebirth 5 ★ | 1e15 | Only after r5. One-time: permanent **×50,000 Dumbbell Multi**. Wipes points only (items kept). |
| r6 | Rebirth 6 | 50e15 | Only after r5b. One-time: permanent ×40 + unlocks the **Lava Zone** gate in the gym world. Wipes points only. (Cost was unspecified in the spec — 50Q chosen.) |

Requirements gate: buying `r2` requires level 1, `r3` requires 2, `r4` requires 3, `r5` requires level 4 (and not yet dumbbellUnlocked), `r5b` requires dumbbellUnlocked and not dumbbellMulti, `r6` requires dumbbellMulti and not lavaUnlocked. Item wipe removes Tools from character+backpack immediately.

### SIZES (on CURRENT points; scale multiplies default R15 scales; smooth 1 s tween; fire GrowFX on increase)

1K→2.0, 10K→2.5, 100K→3.0, 1M→3.5, 5M→4.0, 10M→4.25, 100M→4.5, 1B→4.75, 10B→5.0,
100B→5.5, 1T→6, 10T→8, 100T→10, 1Q→12, 10Q→14, 100Q→15, 1Qi→16, 10Qi→18, 100Qi→20,
1Sx→22, 10Sx→25. Below 1K → 1.0. (Q=1e15, Qi=1e18, Sx=1e21. Spec listed "1M" twice; the second
became 5M.) Shrinking after a rebirth wipe is correct behavior. JumpPower/WalkSpeed scale mildly
(+20% per size step, cap ×3) so giants aren't stuck.

### TITLES (unlock at LIFETIME points, keep forever, equip any time; billboard above head)

1→**Noobie** (gray) · 1K→**Starter** (white) · 2K→**Beginner** (lime) · 3K→**Rookie** (green) ·
500K→**Pro** (cyan) · 150M→**Hacker** (matrix green, monospace vibe) · 5B→**1010101** (green-on-black binary) ·
125B→**Bot** (steel blue) · 200B→**Hecker** (red glitch) · 100T→**God** (gold, glow) ·
100Qi→**The Rock** (granite gray; ALSO unlocks the **Rock Morph**: toggleable full-body granite
bodybuilder look — every body part Granite material, stone-gray, heavy brow rocky head built from
parts, eyebrow raised. Original blocky look — the actual meme photo is a copyrighted image and
cannot be embedded, so we build the funniest granite statue we can.)

### AURAS (buy with points, keep forever, equip one at a time; particle FX on character)

| id | name | cost |
|---|---|---|
| fire | Fire Aura | 100,000 |
| water | Water Aura | 110,000 |
| void | Void Aura | 1e12 |
| rainbowgod | Flying Mythical Rainbow God Aura | 1e21 |

fire: orange/red fire + embers + faint smoke + orange PointLight. water: blue droplets + mist ring.
void: purple/black swirling orbs + dark purple light + slow black smoke. rainbowgod: rainbow-cycling
sparkles + trail, golden halo ring above head, two white part-built angel wings welded to the torso,
rainbow PointLight — the most over-the-top of the four.

## Module APIs (exact signatures — cross-module calls go through G)

### Util (core agent — adapt from `roblox-tycoon/src/Util.lua`, same API, plus changes below)
- `Util.part(props)` → Part. props: `Name, Size, CFrame, Color (Color3 or name), Material (string, default "SmoothPlastic"), Anchored (default true), CanCollide (default true), Transparency, Reflectance, Shape ("Block","Ball","Cylinder","Wedge"), Parent, Neon (bool)`. Color names: green, darkgreen, yellow, orange, red, darkred, black, white, gray, darkgray, pink, blue, lightblue, purple, gold, brown, tan, cyan, granite.
- `Util.model(name, parent)`; `Util.label(part, text, opts)`; `Util.surfaceText(part, face, text, textColor, bgColor)`; `Util.touchOnce(part, seconds, fn)`; `Util.spinner(part, axis, speed)`; `Util.mover(part, from, to, period)`; `Util.firework(position)`.
- `Util.fmt(n)` → NO dollar sign: `"999"`, `"1.5K"`, `"25M"`, `"1B"`, `"2T"`, `"1Q"` (1e15), `"1Qi"` (1e18), `"1Sx"` (1e21), `"10Sx"`. One decimal max, trims ".0". Handles 0.1 (protein) as `"0.1"`.
- `Util.weld(a, b)` → WeldConstraint. `Util.cyl(props)` sugar for Shape="Cylinder" (remember Roblox cylinders lie along X).

### Data (server-core)
- `Data.Setup(player)` / `Data.Save(player)` — DataStore `"WeightLiftSave_v1"`, key `tostring(UserId)`, pcall-wrapped, autosave 120 s, save on Removing + BindToClose. Value: the GetState table minus computed fields. leaderstats: StringValue `Strength` = `Util.fmt(points)`, StringValue `Rebirths` (level), so the playerlist shows both.
- `Data.Get(player)` → live data table. `Data.AddPoints(player, n)` (also lifetime, attributes, leaderstats, size check via `G.Lift.CheckSize`), `Data.SpendPoints(player, n)` → bool, `Data.SetPoints(player, n)`.
- `Data.RecomputeMulti(player)` — applies the multiplier formula, sets attribute.
- `Data.WipeForRebirth(player, wipeItems, wipeLevel)`.
- `Data.HookPlayers(G)` — see Wiring. On CharacterAdded: wait for Humanoid, re-apply size/auras/title/morph, re-give tools.
- Title unlock check lives here: on AddPoints, any newly passed `Config.Titles` threshold → `titles[name] = true` + Notify green "Title unlocked: X!" + StateChanged.

### Lift (gameplay)
- Handles `Remotes.Lift` (rate-limit 10/s/player): if character has a Tool with attribute `ItemId` → `gain = Config power × Multi`; `Data.AddPoints`; `LiftFX:FireAllClients(char, "+"..Util.fmt(gain), itemId)`. No tool → Notify red "Hold a lifting item out first!" (throttled).
- `Lift.Start(G)`: autoclicker loop (players with AutoUnlocked, every 0.2 s, same gain path, also fires LiftFX); candle burn loop (1/s, min 10 HP, BurnFX); regen loop (+5 HP/s if not burned within 3 s).
- `Lift.CheckSize(player)` — compute target scale from points; if changed, tween R15 scale NumberValues (BodyHeightScale, BodyWidthScale, BodyDepthScale, HeadScale) over 1 s, set attribute SizeMult, on increase fire GrowFX + Notify yellow "SIZE UP! Now ×2.5!". `Lift.ApplySize(player)` for respawn (instant, no FX).

### Rebirth (server-core)
- `Rebirth.Try(player, id)` → ok,msg — full gate+cost logic from the table above; on success Notify green + StateChanged + firework at character + RecomputeMulti.

### Shop (gameplay)
- Handles `Buy` (items/auras → gates: cost, req, not owned; rebirth kind → `G.Rebirth.Try`) and `Equip` (title/aura/morph → validate owned → set data + attributes → `G.Auras.Apply(player)`) and `GetState`.
- `Shop.GiveTool(player, id)` — builds Tool: clone `G.ItemBuilders[id]()` model, PrimaryPart becomes `Handle` (renamed), all parts unanchored+CanCollide false+Massless, WeldConstraints to Handle, `Tool.RequiresHandle = true`, attribute `ItemId`, sensible Grip, `ToolTip = name`, into Backpack (skip if already there).
- `Shop.BuildDisplayModels(G)` — Folder `ReplicatedStorage.ItemModels`, one clone per item id (Model named id, anchored ok) for client viewports.

### Leaderboard (gameplay)
- OrderedDataStore `"WeightLiftLB_v1"`: on save, SetAsync(UserId, floor(min(lifetime, 9e15))). Every 90 s GetSortedAsync top 50 → render onto the physical board part that WorldGym registers via `Leaderboard.SetBoard(part)` (SurfaceGui, scrolling list: rank, name via GetNameFromUserIdAsync pcall+cache, formatted points; gold/silver/bronze rows for top 3). All pcall-wrapped; in Studio (no DataStore) fall back to live session players so the board never looks broken.

### Auras (cosmetics)
- `Auras.Apply(player)` — idempotent: clears previous FX folder in character, then applies equipped aura particles (specs above), title billboard (name in title color, black outline, above head, scales with SizeMult), and rock morph if `morph` on (granite recolor + rocky head parts + remove accessories; restore on unmorph via respawn-safe re-application).

### Worlds — geometry (Build once; parent under one Model per world in Workspace)

**Layout**: Gym world centered at origin, ground top at y=0. Space World centered (0, 3000, 0).
Dumbbell World centered (5000, 0, 0). Lava Zone is part of the gym map: volcanic cavern
behind a gate at gym-east, centered ≈ (700, 0, 0).

**WorldGym.Build(G)** — the realistic bit matters most here:
- Outdoors: 2000×2000 grass ground, road with dashed lane markings, sidewalk, parking lot
  with 2–3 simple parked cars, trees (trunk+layered canopies), bushes, streetlamps, sun-lit.
- The GYM building (~140×90 studs, 40-stud ceiling — doors/lobby generous so grown players fit;
  giants can lift outside): brick walls, big glass windows, glass double door, "IRON TEMPLE GYM"
  sign. Inside: rubber-tile floor, mirrored wall (glass+Reflectance), dumbbell rack with rows of
  dumbbells, 2 barbell benches, 2 treadmills, yoga mats, water cooler, front desk with clerk NPC
  (posed R6-style mannequin from parts), motivational wall signs ("NO PAIN NO GAIN"),
  ceiling lights. A clear open "LIFTING FLOOR" area with a floor decal circle where players stand.
- The **Leaderboard board**: big framed board on one interior wall (or outside wall), part passed
  to `Leaderboard.SetBoard`. Label: "TOP 50 LIFTERS".
- **Rebirth shrine**: marble pedestal + glowing ring outside the gym — Notify hint; actual
  rebirthing happens in the UI, the shrine is landmark + firework spot.
- **Portals**: two 12-stud archways on a stone plaza: SPACE WORLD (purple swirl fill) and
  DUMBBELL WORLD (silver swirl). Touch: if unlocked → CFrame-teleport character (+6 y) to that
  world's arrival pad; else Notify red requirement. Return portals exist in each world.
- **Lava Zone** (east, ≈(700,0,0)): obsidian cavern shell, glowing lava floor pools (kill-free,
  it's decorative — Neon orange), lava-falls, basalt columns, smoke particles, a huge obsidian
  gate with "REBIRTH 6 REQUIRED" that opens (slides) for LavaUnlocked players (Heartbeat
  proximity check; solid to everyone else).
- Part budget ≤ 1500.

**WorldSpace.Build(G)** — "giant and very detailed": centered (0,3000,0), a huge (~800 stud)
glass-and-steel observation platform among the stars; black star-dome (giant inverted... use a
1200-stud transparent-black ceiling sphere illusion: hundreds of small neon white star parts
scattered spherically + a few colored nebula wisps (big transparent tinted parts)), ringed
gas giant scenery, slowly-orbiting asteroids (Util.spinner on an invisible pivot), a big Earth
model visible "below" the platform edge, glowing walkways, hologram-style shop kiosks (the item
shop itself is UI — kiosks are landmarks showing each space item's model floating+spinning on a
pedestal with a name plate), arrival pad + return portal to gym. Invisible walls so players can't
walk off into the void (or a catch-floor 100 studs below that teleports back to the pad).
Part budget ≤ 1800 (stars are many small parts — keep them tiny and anchored).

**WorldDumbbell.Build(G)** — centered (5000,0,0): a gym-themed planet surface: rubber-floor
terrain, GIANT scenery dumbbells (50-stud) lying around, protein-bar skyscraper, a colossal
barbell arch you walk under, vending machines, giant water bottle, pedestal displays of the 5
dumbbell-world items (spinning), arrival pad + return portal. Part budget ≤ 900.

### ClientUI (client-ui) — dark modern UI, rounded corners (UICorner), UIStroke, gradients, hover/press effects. All GUI built by code in PlayerGui.
- **HUD** top-center: big 💪 Strength counter (animated count-up toward attribute Points, formatted), below it "×N multi" chip and current size chip ("Size ×2.5"). Bottom-right: AUTO chip glows when autoclicker unlocked. leaderstats already show in playerlist.
- **Left button rail**: SHOP, REBIRTH, TITLES, AURAS, TELEPORT — square icon buttons (emoji icons fine), hover scale 1.05, click springs.
- **Shop window**: tabs Gym / Space / Dumbbell / Lava (locked tabs show 🔒 + requirement). Scrolling list; each **item frame**: left = ViewportFrame with the ACTUAL item model (clone from ReplicatedStorage.ItemModels, own camera, slow spin via RenderStepped), right = item NAME (bold), the desc line from Config (says what the thing IS), "+N per lift" (green), price (gold, `Util.fmt`), and a BUY button (green if affordable, gray if not, "OWNED" state, "🔒 Rebirth 2" state). Buying calls `Buy("item", id)`; result → Notify toast + refresh.
- **Rebirth window**: the 7 rebirth cards (r1..r4, r5, r5b, r6) with cost, multiplier text, what resets, big red REBIRTH button with "are you sure" double-click confirm; shows current multi breakdown (ladder × space ×3 × dumbbell ×50000 × lava ×40).
- **Titles window**: grid of title cards in their colors — unlocked → EQUIP/UNEQUIP; locked → progress "reach 5B lifetime". The Rock card also has MORPH toggle when unlocked.
- **Auras window**: 4 aura cards with animated gradient headers, cost, BUY → EQUIP/UNEQUIP.
- **Teleport window**: Gym / Space / Dumbbell / Lava Gate buttons (locked ones grayed with requirement) → fires... teleporting is server-authoritative via touch portals; the UI buttons just Notify where to walk? NO — add to Shop's `Equip`-style surface: reuse `Buy("teleport", worldId)`? Keep contract simple: RemoteFunction `Buy` also accepts kind `"teleport"` (id `"gym","space","dumbbell","lava"`) → server validates unlock and teleports. Free.
- Toast notifications (Notify) slide in top-right, color-coded. Refresh owned state on StateChanged via GetState.
- Uses `Util.fmt`-equivalent — client CANNOT require server modules: client files each include their own local `fmt(n)` copy (same behavior) and small helpers. Duplication here is accepted and intentional.
- Mobile-safe: buttons are TextButtons with generous size, no keyboard requirements; Tool activation = tap.

### ClientFX (client-fx)
- **Lift animation** on LiftFX for ANY character (including own): tween both arm Motor6Ds up (R15: RightShoulder/LeftShoulder Motor6D C0 in UpperArms; guard-nil for R6) — quick 0.25 s curl-up-overhead and back. Don't stack tweens (cancel per-character).
- **Money popup** on LiftFX: BillboardGui "+1.5K 💪" above the character's head at random slight offset, floats up 6 studs, fades, 0.8 s, pooled/capped (≤ 30 live popups).
- **Own-click feedback**: on own LiftFX also pulse the HUD counter scale.
- **GrowFX**: expanding golden ring particles + "💪 SIZE UP ×2.5!" big center text for own character, 1.5 s; camera FOV punch 70→78→70.
- **BurnFX**: brief orange screen-edge vignette flash + "🔥".
- **Zone lighting** (Heartbeat, from own character Y/X): in Space World (y > 2000) set Lighting ClockTime 0, Brightness 1, black-ish FogColor far fog; in Lava Zone (x > 550, y < 500) warm orange ambient + FogColor; else restore gym daytime (ClockTime 14, Brightness 2). Smooth-ish (just set, small lerp fine).
- Plays a soft "clink" via a Sound with rbxasset (only built-in `rbxasset://` sounds or none — no marketplace sound ids; silence is fine).

## Misc rules

- **No marketplace asset ids anywhere** (no Animation ids, no Decal/Texture ids, no Sound ids except `rbxasset://` built-ins). Everything is parts, particles (default texture), and code.
- All Touched handlers debounce and nil-check `Players:GetPlayerFromCharacter`.
- All loops through `task.spawn`ed while-loops with `task.wait(interval)`; movers/spinners share ONE Heartbeat connection (Util).
- DataStore access always pcall-wrapped; the game must run perfectly in Studio offline.
- Server never trusts the client: costs/gates/rate limits all server-side.
- Keep comments explaining any geometry math. Keep each file self-contained (only `G` cross-calls).
