# Boss Tycoon — Build Contract (v1)

Every module author MUST follow this exactly. Deviations break the assembly.

## Deliverable

A Roblox place file assembled from these Lua sources (in `roblox-tycoon/src/`):

| File | Becomes | Written by |
|---|---|---|
| `Main.server.lua` | Script `TycoonMain` in ServerScriptService | core agent |
| `Util.lua` | ModuleScript child of TycoonMain | core agent |
| `Economy.lua` | ModuleScript child | core agent |
| `Lobby.lua` | ModuleScript child | core agent |
| `PlotManager.lua` | ModuleScript child | plots agent |
| `Purchases.lua` | ModuleScript child | plots agent |
| `Balance.lua` | ModuleScript child | items-core agent |
| `ItemsCore.lua` | ModuleScript child | items-core agent |
| `ItemsMain.lua` | ModuleScript child | items-main agent |
| `ItemsUpper.lua` | ModuleScript child | items-upper agent |
| `Obbies.lua` | ModuleScript child | obbies agent |
| `Lab.lua` | ModuleScript child | lab agent |
| `UpperFloors.lua` | ModuleScript child | upper-floors agent |
| `TrollObby.lua` | ModuleScript child | troll agent |
| `Endgame.lua` | ModuleScript child | troll agent |
| `Client.client.lua` | LocalScript `TycoonClient` in StarterPlayer.StarterPlayerScripts | client agent |

All world geometry is generated at runtime by these scripts. Nothing is pre-modeled.

## Language rules (STRICT — a Lua 5.1 parser syntax-checks every file)

- Luau **runtime** APIs are fine (`task.wait`, `task.spawn`, `Instance.new`, attributes, `AssemblyLinearVelocity`, etc.).
- Luau **syntax extensions are BANNED**: no type annotations (`: string`), no `+=`/`-=`/`..=`, no `continue`, no `if x then y else z` expressions, no interpolated strings `` `...` ``.
- Never write the character sequence `]]>` anywhere (XML CDATA). Long strings `[[ ]]` are fine otherwise.
- Every ModuleScript returns a table. No module `require`s another module — see wiring below.

## Wiring (no circular requires)

`Main.server.lua` requires every module (`require(script.Util)` etc.), builds a context table `G`, then calls `M.Init(G)` on every module **in this order**:
`Util, Economy, Balance, ItemsCore, ItemsMain, ItemsUpper, Obbies, Lab, UpperFloors, TrollObby, Endgame, Purchases, Lobby, PlotManager`.

```lua
G = {
  Util = Util, Economy = Economy, Balance = Balance,
  ItemsCore = ItemsCore, ItemsMain = ItemsMain, ItemsUpper = ItemsUpper,
  Obbies = Obbies, Lab = Lab, UpperFloors = UpperFloors,
  TrollObby = TrollObby, Endgame = Endgame,
  Purchases = Purchases, Lobby = Lobby, PlotManager = PlotManager,
  Remotes = <Folder in ReplicatedStorage, see Remotes>,
}
```

`Init(G)` must only store `G` and set up state; **world building happens in explicit calls from Main** (after all Inits):
1. `Lobby.Build(G)` — lobby, ground, spawn.
2. `Lab.Build(G)`, `UpperFloors.Build(G)`, `TrollObby.Build(G)`, `Endgame.Build(G)` — shared zones, built once.
3. `PlotManager.Setup(G)` — creates 5 plots + claim pads, hooks PlayerAdded/Removing.

## Remotes

Main creates `ReplicatedStorage.Remotes` (Folder) **before** any Init, containing exactly these, all named here:

- RemoteEvent `Notify` — server→client `(text, colorName)`; colorName in `"green","red","yellow","white"`.
- RemoteEvent `Jumpscare` — server→client `()`. Client shows the NON-scary jumpscare (giant smiling duck face + "QUACK :)" honk).
- RemoteEvent `TVPrompt` — server→client `()`. Opens the TV code+color input GUI.
- RemoteFunction `TVSubmit` — client→server `(codeString, colorString)` → returns `(ok, message)`.
- RemoteEvent `NukeAlert` — server→client all `(attackerName)`.
- RemoteEvent `WinGame` — server→client `(playerName)` to all. Winner gets victory screen; others get announcement.
- RemoteEvent `LabFog` — server→client `(enabled)`. Client applies local Lighting fog/darkness (FogEnd 60, black ambient) while in the lab; restores on false.

Client (`Client.client.lua`) is the ONLY consumer/producer on the client side.

## Economy (module API)

- `Economy.Get(player)` → number
- `Economy.Add(player, amount)` — also updates `leaderstats.Money`
- `Economy.Spend(player, amount)` → bool (false if insufficient; no partial spend)
- `Economy.SetupPlayer(player)` / `Economy.SavePlayer(player)` — leaderstats + DataStore `"BossTycoonSave_v1"`, key `tostring(UserId)`, value `{money=n, purchased={id,...}, flags={name=true,...}}`. All DataStore calls in `pcall`. Autosave every 120s, save on PlayerRemoving and `game:BindToClose`.
- `Economy.GetData(player)` → the live data table (money synced from ledger). PlotManager reads `purchased`/`flags` for rebuild-on-reclaim.
- `Economy.WipeProgress(player)` — money=0, purchased={}, flags={} , plot reset via `PlotManager.ResetPlot`. (Used by the troll obby's REAL reset button.)
- `Economy.SetFlag(player, name)` / `Economy.HasFlag(player, name)`.

Money is stored as plain Lua numbers (doubles are exact to 2^53; max price is 2e12 — fine). Leaderstats display uses a StringValue `Money` with compact formatting via `Util.fmt(n)` → `"$1.5K" "$25M" "$2T"`.

## Plots and geometry

- Ground: 3000×3000 grass-green baseplate, top surface at **y = 0**. Lobby at origin (Lobby.Build): 120×120 stone plaza, SpawnLocation, welcome sign.
- 5 plots. Plot i (1..5): angle `a = (i-1) * 72°`, center `(cos(a)*350, 0, sin(a)*350)`. `plot.origin = CFrame.new(center) * CFrame.Angles(0, -a + math.pi/2, 0)` so that **local −Z faces the lobby** (front) and **local +Z is the back** (obbies go there).
- `plot:cf(x, y, z)` → `plot.origin * CFrame.new(x, y, z)` — ALL plot item positions go through this.
- Base building footprint: 80×80 studs, local x ∈ [−40,40], z ∈ [−40,40]. Front door gap in the −Z wall.
- Floor slabs (2 studs thick, top surfaces): floor 1 ground at y=0 (green floor slab y∈[0,1] is fine), **floor 2 at y = 24**, **rainbow floor at y = 48**, **black floor at y = 72**, roof at y = 96.
- Balcony: extends outside the +X wall at floor-2 height (local x ∈ [40, 65], z ∈ [−25, 25], y = 24).
- Outside collectors zone: local x ∈ [−75, −45] (left side of base, on the ground).
- Back obbies zone: local z ∈ [45, 200], built per-plot on purchase (Obbies module).
- Conveyors: floor-1 conveyor runs along local X at z = −15, from x = −30 to x = +32, belt top at y = 3, drops travel **+X** into the collector at x ≈ 34. Floor-2 conveyor same line at y = 27. Balcony conveyor along local Z at x = 52, y = 27, collector at z ≈ 27. Rainbow conveyor at y = 51, z = −15, same X run. Droppers stand over their conveyor.

### plot object (created by PlotManager)

```lua
plot = {
  index = n, model = Model,            -- all plot-built items parented under model
  origin = CFrame, owner = Player or nil,
  purchased = {id=true,...},           -- current built set
  cf = function(self,x,y,z) ... end,
  itemsFolder = Folder,                -- purchased builds go here (wiped on nuke/reset)
}
```

`PlotManager.ResetPlot(plot, keepOwner)` — destroys itemsFolder contents, clears purchased, respawns the button chain (claim pad if no owner).
`PlotManager.GetPlotOf(player)` → plot or nil.
`PlotManager.NukeAllExcept(attacker)` — for every other claimed plot: fire explosion visuals, `ResetPlot`, unclaim (owner must re-step claim pad; on reclaim their saved `purchased` list is rebuilt automatically — reclaim calls each purchase's `build` again in chain order, free).

## Purchase engine

`Purchases.List` is the ordered array below. The chain is **strictly linear**: button N appears once N−1 is bought (claiming shows button for id 1). Buttons are 6×1×6 neon pads with a BillboardGui showing `name` + price (`Util.fmt`), green if affordable-styling is NOT required (keep static gold/green pads; red text if price>0).

Each entry: `{id, name, price, zone, build}`.
- `zone="plot"`: pad placed by the entry's `padOffset = {x,y,z}` (plot-local); on touch by the plot owner with enough money: spend, mark, call `build(G, plot)`, parent everything the build creates under `plot.itemsFolder`, advance chain.
- `zone="shared"`: pad lives in a shared zone at an absolute CFrame `padCFrame`; ANY player may touch; checks THAT player's chain position (their plot's `purchased`), deducts, sets progress flag; `build(G, plot)` may be nil (shared visuals are pre-built; purchase just unlocks access — access doors/pads check `Economy.HasFlag` / purchase state).

On any successful purchase: `Remotes.Notify:FireClient(player, "Bought: "..name, "green")`.
On touch without money: Notify red "Need <fmt(price)>!" (throttle 1/s per player).

### THE PURCHASE CHAIN (exact ids, names, prices — DO NOT ALTER)

Implemented-by key: [M]=ItemsMain [U]=ItemsUpper [O]=Obbies [L]=Lab [F]=UpperFloors [T]=TrollObby [E]=Endgame. The named function must exist on that module, signature `fn(G, plot)`.

| # | id | name | price | mod.fn |
|---|---|---|---|---|
| 1 | green_floor | Green Floor | 0 | M.BuildGreenFloor |
| 2 | conveyor1 | Conveyor & Collector | 0 | M.BuildConveyor1 |
| 3 | manual_dropper_g | Manual Green Dropper | 0 | M.BuildManualDropperG |
| 4 | auto_dropper_g1 | Auto Green Dropper | 150 | M.BuildAutoDropperG1 |
| 5 | auto_dropper_g2 | Auto Green Dropper 2 | 150 | M.BuildAutoDropperG2 |
| 6 | upgrader1 | Upgrader | 300 | M.BuildUpgrader1 |
| 7 | green_upgrader | Green Upgrader | 450 | M.BuildGreenUpgrader |
| 8 | cool_collector | Cool Collector | 500 | M.BuildCoolCollector |
| 9 | speedy_upgrader | Speedy Upgrader | 500 | M.BuildSpeedyUpgrader |
| 10 | conveyor_walls1 | Conveyor Walls | 500 | M.BuildConveyorWalls1 |
| 11 | base_walls | Base Walls | 500 | M.BuildBaseWalls |
| 12 | owner_door | Owner Door | 500 | M.BuildOwnerDoor |
| 13 | yellow_upgrader1 | Yellow Upgrader | 750 | M.BuildYellowUpgrader1 |
| 14 | spiral_stairs | Spiral Green Stairs | 400 | M.BuildSpiralStairs |
| 15 | floor2 | 2nd Floor | 500 | M.BuildFloor2 |
| 16 | conveyor2 | 2nd Floor Conveyor & Collector | 100 | M.BuildConveyor2 |
| 17 | obby_easy | Easy Obby | 1000 | O.BuildEasy |
| 18 | manual_dropper_y | Yellow Manual Dropper | 500 | M.BuildManualDropperY |
| 19 | dropper_y1 | Yellow Dropper | 750 | M.BuildDropperY1 |
| 20 | dropper_y2 | Yellow Dropper 2 | 900 | M.BuildDropperY2 |
| 21 | yellow_upgrader2 | Yellow Upgrader 2 | 1100 | M.BuildYellowUpgrader2 |
| 22 | speedy_conveyor | Speedy Conveyor | 1000 | M.BuildSpeedyConveyor |
| 23 | conveyor_walls2 | 2F Conveyor Walls | 1300 | M.BuildConveyorWalls2 |
| 24 | walls2 | 2F Walls | 1100 | M.BuildWalls2 |
| 25 | balcony | Balcony | 1100 | U.BuildBalcony |
| 26 | balcony_fence | Balcony Fence | 2000 | U.BuildBalconyFence |
| 27 | conveyor3 | Balcony Conveyor & Collector | 1100 | U.BuildConveyor3 |
| 28 | super_collectors | Super Cool Collectors | 1500 | U.BuildSuperCollectors |
| 29 | balc_dropper1 | Balcony Dropper | 1200 | U.BuildBalcDropper1 |
| 30 | balc_dropper2 | Balcony Dropper 2 | 1400 | U.BuildBalcDropper2 |
| 31 | balc_dropper3 | Balcony Dropper 3 | 1700 | U.BuildBalcDropper3 |
| 32 | balc_dropper4 | Balcony Dropper 4 | 2100 | U.BuildBalcDropper4 |
| 33 | balc_dropper5 | Balcony Dropper 5 | 2800 | U.BuildBalcDropper5 |
| 34 | balc_upgrader | Balcony Upgrader | 2000 | U.BuildBalcUpgrader |
| 35 | fence_upgrader | Fence Upgrader | 3400 | U.BuildFenceUpgrader |
| 36 | red_upgrader | Red Upgrader | 5000 | U.BuildRedUpgrader |
| 37 | obby_medium | Medium Obby | 2000 | O.BuildMedium |
| 38 | obby_hard | Hard Obby | 15000 | O.BuildHard |
| 39 | obby_intense | Intense Obby | 30000 | O.BuildIntense |
| 40 | out_collector1 | Outside Collector | 40000 | U.BuildOutCollector1 |
| 41 | out_dropper_red | Red Dropper | 50000 | U.BuildOutDropperRed |
| 42 | out_red_upgrader | Red Dropper Upgrader | 50000 | U.BuildOutRedUpgrader |
| 43 | out_collector2 | Outside Collector 2 | 60000 | U.BuildOutCollector2 |
| 44 | out_dropper_black | Black Dropper | 75000 | U.BuildOutDropperBlack |
| 45 | out_black_upgrader | Black Dropper Upgrader | 100000 | U.BuildOutBlackUpgrader |
| 46 | rainbow_ladder | Ladder: Yellow to Rainbow | 200000 | U.BuildRainbowLadder |
| 47 | rainbow_conveyor | Rainbow Conveyor & Collector | 300000 | U.BuildRainbowConveyor |
| 48 | dropper_pink | Pink Dropper | 500000 | U.BuildDropperPink |
| 49 | dropper_blue | Blue Dropper | 700000 | U.BuildDropperBlue |
| 50 | dropper_white | White Dropper | 900000 | U.BuildDropperWhite |
| 51 | gray_upgrader | Gray Upgrader | 1500000 | U.BuildGrayUpgrader |
| 52 | rainbow_walls | Rainbow-to-Black Walls | 1000000 | U.BuildRainbowWalls |
| 53 | black_ladder | Rainbow-to-Black Ladder | 1200000 | U.BuildBlackLadder |
| 54 | black_floor | Black Floor | 10000000 | U.BuildBlackFloor |
| 55 | lanterns | 4 Lanterns | 4000000 | U.BuildLanterns |
| 56 | black_walls_roof | Pitch Black Walls & Roof | 5000000 | U.BuildBlackWallsRoof |
| 57 | portal_frame | Portal Frame | 25000000 | U.BuildPortalFrame |
| 58 | portal | Portal | 50000000 | U.BuildPortal |
| 59 | giant_obby | The Giant Obby | 100000000 | zone=shared, F handles access |
| 60 | top_walls_floor | Walls & Next Floor | 10000000 | zone=shared, F |
| 61 | sword_giver | Sword Giver | 50000000 | zone=shared, F |
| 62 | bookshelf | Bookshelf | 250000000 | zone=shared, F |
| 63 | metal_holder | Metal Holder | 75000000 | zone=shared, F |
| 64 | tv | TV | 80000000 | zone=shared, F |
| 65 | bench | Bench | 100000000 | zone=shared, F |
| 66 | troll_obby | Troll Obby | 1000000000 | zone=shared, T |
| 67 | nuke | NUKE | 1000000000000 | zone=shared, E (repeatable: each purchase = one launch) |
| 68 | etoh | Eternal Tower of Hell | 2000000000000 | zone=shared, E |

Prices #59–68 are deducted from the touching player. Shared pads (#59–68) are placed by the owning module (F/T/E) during `Build(G)` and registered via `Purchases.RegisterSharedPad(id, padPart)`; the purchase engine wires the touch logic. `troll_obby` purchase requires flag `tv_solved`. `nuke` requires flag `troll_won`. `etoh` requires flag `nuke_launched`.

## Drops / conveyors / upgraders / collectors (ItemsCore API)

- `ItemsCore.MakeConveyor(G, parent, cframe, length, width, speed, colorName)` — anchored belt part; conveyor effect via `belt.AssemblyLinearVelocity = belt.CFrame.LookVector * speed` (belt's LookVector must point along travel direction; the part stays anchored — this is the standard surface-velocity conveyor). Animated texture beam optional.
- `ItemsCore.MakeDropper(G, plot, opts)` — `opts = {cframe, colorName, dropValue, interval, manual}`. Manual droppers have a ClickDetector (owner-only) that drops one block per click. Auto droppers `task.spawn` a loop: while dropper's plot still owns it (check `dropper.Parent`), drop every `interval` s. Drops: 1.2-stud unanchored neon cubes, `NumberValue "Cash"` inside, `Debris` cleanup 30s, `CollisionGroup` not needed.
- `ItemsCore.MakeUpgrader(G, plot, opts)` — `opts = {cframe, mult, add, colorName, name}`. An arch over the conveyor; a thin invisible beam part touching drops: if drop has no attribute `U_<name>`, set it and `Cash.Value = Cash.Value * mult + add`.
- `ItemsCore.MakeCollector(G, plot, opts)` — `opts = {cframe, size}` wall/bin at conveyor end; on drop touch: `Economy.Add(plot.owner, Cash.Value)`, destroy drop, tick a small green "+$" effect. Registers itself in `plot.collectors` (array) so `super_collectors` / `cool_collector` can restyle all of them (neon, spinning ring, particles).
- All Touched handlers must debounce per-drop and ignore non-drop parts (check for the `Cash` NumberValue).

## Balance (Balance.lua — single source of numbers)

`Balance.Drops` maps dropper key → `{value, interval}`; `Balance.Ups` maps upgrader id → `{mult, add}`; `Balance.ObbyRewards = {easy=..., medium=..., hard=..., intense=..., giant=...}` (paid on each completion).
Dropper keys: `manual_g, auto_g, yellow_manual, yellow, balc, out_red, out_black, pink, blue, white`.
Tune so that, with everything owned up to step N, the income rate lets you afford step N+1 in roughly 30–120 seconds through the early/mid game; the endgame ($1B troll → $1T nuke → $2T tower) should take on the order of 20–60 minutes of rainbow/black-floor income (with the giant-obby repeat reward helping). Document the income-per-stage math in comments in Balance.lua.

## Shared zones (absolute positions — Build once at startup)

- Back obbies: per-plot, plot-local z ∈ [45, 200]. Easy: gentle platforms up to a small summit (finish pad y≈40). Medium/hard/intense: successively taller/harder towers behind it (finish y≈60/80/100). Finish pad pays `Balance.ObbyRewards[...]` (10s per-player cooldown) and teleports back to plot front. Style: vertical climbs, lava spinners, thin wraparound ledges jutting into the void, conveyor jumps — few/no puzzles.
- Lab (Lab.Build): dark enclosed complex centered at **(0, 500, 1500)**, roughly 200×200 footprint. Player's plot `portal` teleports here (portal touch → check purchased `portal` → teleport + `LabFog:FireClient(p, true)`). Contents: black corridors, flickering PointLights, an **alien** NPC (glowing humanoid model) that patrols and chases the nearest player (Humanoid:MoveTo loop, touch = character death → respawn at lab entrance); **3 keycard doors** each opened by typing a 4-digit code found on wall signs hidden deeper in the lab (SurfaceGui signs; door keypads use ClickDetector + the TV-style GUI? NO — keep it server-side: keypad pads numbered 0–9 you step on to enter digits, display above the door); each opened door yields a glowing **key** part to grab; collecting all 3 keys unlocks the final **escape code door** (code shown split across the 3 key rooms). Escaping → walk-out exit → `LabFog false` + teleport to the Upper Floors lobby at **(0, 700, 1500)** + flag `lab_escaped`. Store per-player key/door state in flags. Codes are fixed constants (e.g. 4915, 2077, 8341, escape 6420) — fine for this game.
- Upper Floors (UpperFloors.Build) at **(0, 700, 1500)**: arrival platform; pad #59 `giant_obby` ($100M, requires `lab_escaped`) opens the gate to the **Giant Obby** — the biggest climb so far (~60+ platforms, vertical, checkpoints every ~15), ending on the **code room**: a sign showing **OBBY CODE: 7259** and flag `obby_code_seen`, plus repeatable completion reward. Then pads #60–65 furnish the top floor: walls+floor, sword giver (touch → get a classic sword Tool if bought), bookshelf (books with ClickDetectors — ONE book, when clicked, shows your **color word** via Notify, e.g. "CRIMSON", flag `book_color_seen`), metal holder + TV (click TV → if `tv` purchased, fire `TVPrompt`; `TVSubmit(code,color)` returns ok when code=="7259" and color=="CRIMSON" (case-insensitive) → flag `tv_solved`, opens the stairway to "the top" and fires `Jumpscare` (the friendly duck) when they step onto the top platform), and a bench (sittable Seat, cuz why not).
- Troll Obby (TrollObby.Build) at **(800, 0, 1500)**: entry gate requires purchase `troll_obby`. THE HARDEST troll tower: vertical ToH-style, ≥20 minutes — invisible real paths beside visible fake ones, platforms that vanish on touch, fake finish lines that teleport you down a bit, arrows pointing the wrong way, trusses that fling, one checkpoint per 5 floors (it must be beatable — include a genuine path and mark it in code comments). At the "end": **fake reset button** labeled "if you touch me you reset ALL of your progress" → touching does NOTHING except Notify "lol" and opens the **second half** (more troll floors). After the second half: a **sign** reading "lol that was just another troll" — any player standing still within 15 studs of it for 3 seconds gets smacked (sign swings, huge Velocity fling + "bonk"). Past it: the **REAL reset button** ("if you touch me you lose all of your progress" — touching it calls `Economy.WipeProgress`, for real), and floating next to it a TextLabel at **TextTransparency 0.99** reading "or step on the tiny pad behind me and get something else for free" with a small hidden pad that sets flag `troll_won` + Notify "YOU WIN the troll obby!". (`troll_won` is what unlocks the nuke.)
- Endgame (Endgame.Build): **NUKE silo** at (−800, 0, 1500) — pad #67 (requires `troll_won`): on purchase, cinematic rocket rises + `NukeAlert` to all, then `PlotManager.NukeAllExcept(attacker)` + flag `nuke_launched`. Repeatable. **EToH** at **(0, 0, −1400)**: pad #68 (requires `nuke_launched`) opens the gate to the final tower — the hardest, tallest tower in the game (~10 sections, NO checkpoints, fall = restart at bottom): lava spinners, thin wraparounds sticking into the void, conveyor+wraparound combos, moving kill walls. Touching the glowing top pad: flag `game_won`, `WinGame:FireAllClients(name)`, fireworks, rainbow crown part welded above the winner's head.

## Misc rules

- Kill bricks: standard `Touched` → `Humanoid.Health = 0`; never damage via loops.
- All moving obstacles: anchored, moved by `RunService.Heartbeat` with CFrame math (deterministic, uses a shared `t` accumulated from dt — never `tick()`-of-day dependence needed; `os.clock()` fine).
- Every zone gets floor lighting appropriate to theme; overall Lighting: `ClockTime = 14`, `Brightness = 2`.
- Owner door: door part solid to everyone but the owner while enabled (Touched-based teleport-back is unreliable — instead give the door `CanCollide = true` and locally... server cannot per-player collide easily; acceptable approach: door checks `Touched` and only kills/pushes back non-owners is too harsh — use this: door is a thin part; a Heartbeat loop teleports any non-owner character whose HumanoidRootPart is within the doorway box back 6 studs (when enabled). Lever with ClickDetector toggles `enabled`, door glows green (off) / red (on).
- The whole game must run with zero required DataStore access (Studio offline): wrap and continue.
- Part counts: keep each obby under ~600 parts, lab under ~800, EToH under ~1200. Use `Util.part` everywhere.

## Util API (core agent implements; everyone uses)

- `Util.part(props)` → Part. props: `Name, Size (Vector3), CFrame, Color (Color3 or colorName string), Material (string, default "SmoothPlastic"), Anchored (default true), CanCollide (default true), Transparency, Shape ("Block","Ball","Cylinder","Wedge" — Wedge makes a WedgePart), Parent, Neon (bool shortcut)`. Color names: `green, darkgreen, yellow, orange, red, darkred, black, white, gray, pink, blue, lightblue, purple, gold, brown, cyan, rainbow(nil→per-call random bright)`.
- `Util.model(name, parent)` → Model.
- `Util.label(part, text, opts)` → BillboardGui with TextLabel (auto sizes, always-on-top optional).
- `Util.surfaceText(part, face, text, textColor, bgColor)` → SurfaceGui sign.
- `Util.fmt(n)` → `"$999"`, `"$1.5K"`, `"$25M"`, `"$1B"`, `"$2T"` (one decimal max, trims ".0").
- `Util.touchOnce(part, seconds, fn)` → Touched with per-player debounce of `seconds`; fn(player, character) only for alive real players.
- `Util.spinner(part, axis, speed)` — registers into a single shared Heartbeat loop that CFrame-rotates it. `Util.mover(part, from, to, period)` — ping-pong lerp. (One RunService connection total for all registered movers.)
- `Util.firework(position)` — quick particle burst.
