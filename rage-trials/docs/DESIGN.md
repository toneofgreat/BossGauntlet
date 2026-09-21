# RAGE TRIALS — Level Design Spec

Ten levels, a difficulty curve from "anyone can do this" to "you will not beat this today".
Read CONTRACT.md first — it is binding. This file says WHAT each level is; the contract says HOW.

Global rules for every level:
- **Readable**: every hazard is visible before it matters (except in levels 9 and 10, where the
  trolls are the point — and even there each troll is learnable and respawn is instant).
- **Checkpoints**: level 1–3 need none or one. Levels 4–7 get a checkpoint every ~20 tiles.
  Levels 8 and 10 get checkpoints at each phase boundary. Level 9 gets checkpoints that are
  *sometimes* trolls, but never in a way that can soft-lock the player.
- **Beatable**: every level ships a scripted route in `docs/routes/levelNN.json` proving it.
- **Length**: L1 ~35 tiles, L2 ~50, L3 ~60, L4 ~70, L5 ~85, L6 ~230, L7 ~110, L8 ~140,
  L9 ~120, L10 ~180 + the Tetris finale.
- **Look**: each level has its own theme, its own parallax, its own ambient particles, its own
  colour identity. No two levels should look alike.
- The player is a small round-headed runner; the engine draws it. Levels do not draw the player.

---

## Level 1 — FIRST STEPS (theme `meadow`, music `meadow`)
*"Easy mode. Jump over some simple spikes."*

Sunny grass, rolling hills parallax, butterflies/dust motes, a bright blue sky.
Teaching order: walk → a 2-tile gap → a single `^` spike on flat ground → two spikes with a gap
between → a small step up → three spikes in a row you clear with a running jump → coins arcing
over each hazard to show the jump arc → the goal on a small hill with a flag.
A `sign` at the start reads the controls (it detects touch vs keyboard via the engine). Nothing
here can kill except the spikes. No pits. No enemies. ~35 tiles wide, 11 tall.

## Level 2 — DOUBLE TROUBLE (theme `meadow` → `sunset`, music `meadow`)
*"Double spike jumps."*

The same world, late afternoon. Now spikes come in **pairs that cannot be cleared with one jump
from standing** — you need a run-up, or a jump onto a 1-tile block between them.
Beats: double spikes on flat ground → double spikes with a 1-tile pillar between (land on it,
jump again) → a pit with spikes at the bottom and a `-` one-way platform over it → a staircase of
spike pairs → three consecutive spike pairs at increasing spacing → a spring `S` that clears a
5-wide spike field → goal. One checkpoint at the halfway point. ~50 tiles.

## Level 3 — THE VOID (theme `void`, music `void`)
*"Easy jumps in the void."*

Black sky, drifting stars and nebulas, floating stone islands lit from below, fireflies.
No floor at all — falling kills. All jumps are **easy** (2–3 tile gaps, generous 3–4 tile wide
platforms) but the empty space underneath is the pressure.
Beats: a row of islands with 2-tile gaps → 3-tile gaps → a `mover` platform (horizontal) → two
`faller` platforms in sequence → a wider 4-tile gap with a coin at the apex to show it is possible
→ a slow vertical `mover` lift → a final island chain with the goal. One checkpoint before the
movers. ~60 tiles, ~14 tall so the void is visible below.

## Level 4 — TRUST ISSUES (theme `ruins`, music `ruins`)
*"Fake and real platforms."*

Overgrown temple ruins, green fog, broken columns, dust shafts.
Introduces `F` (fake — no collision, subtly darker top, faint flicker) with a **tutorial pair**:
two identical-looking platforms over a safe drop, one fake, so the first lesson costs nothing.
Then it escalates: a row of 5 platforms where 2 are fake; a gap where the ONLY real platform is
the one that looks wrong; `K` crumble platforms mixed in so "real" is not the same as "safe"; a
ceiling of fakes hiding the path; a fake bridge with one real tile; a section where the fakes are
revealed by coins sitting on the real ones (reward observation). Two checkpoints. ~70 tiles.

## Level 5 — BLIND FAITH (theme `ruins` → `volcano`, music `volcano`)
*"Fake and real platforms and spikes."*

The ruins collapse into a volcano: ash particles, lava glow, embers, heat shimmer.
Everything from level 4 plus spikes on, under and beside the fakes, `lavaball` podoboos, and a
lava floor so a mistake is always fatal. Beats: fake platforms above spike pits → a spike corridor
where the ceiling fakes force you low → crumble platforms over lava → a fake platform that is the
*only* safe landing between two spike beds (the real-looking ones have spikes on top) → a
`thwomp` gauntlet → a final run across crumbles over lava to the goal. Three checkpoints. ~85 tiles.

## Level 6 — SIX CROWNS (theme per section, music `mario1`/`mario2`/`mario3`)
*"6 of the hardest Mario levels ever in one stage."* **Read `docs/research-mario.md` first.**

Six back-to-back sections, each an original homage to one of the six most-cited hardest Mario
levels in the research doc. Each section:
- gets its own theme zone (`themeZones`) and its own colour identity from the research,
- opens with a `sign` naming it in our own words (e.g. "I. THE LOST GAUNTLET" — never use
  Nintendo's trademarked level names as the in-game title; homage, not copy),
- is 30–40 tiles wide and uses that level's signature mechanic,
- ends with a checkpoint.

Typical mapping (the level agent must follow the research doc's actual six):
1. **Endless-corridor loop** (Lost Levels 8-4): take the wrong pipe/door and you loop back to the
   start of the section — one correct route through four branches, hinted by coin trails.
2. **Airship gauntlet** (SMB3 W8): girders, rotating cannons firing `ball`s, `thwomp`s, moving
   platform train over the void.
3. **Precision float** (SMW Tubular): a `balloon` power-up, wind zones, and a corridor of
   electric `laser` fences you float through — lose the balloon and you fall.
4. **The perfect run** (Galaxy 2 Grandmaster): no checkpoints inside the section, three chained
   trials (spring chain, beat-block rhythm, saw corridor) — die and you restart the section.
5. **Champion's road** (3D World): neon beat-blocks over the void, conveyor + spike rollers, a
   long jump chain with zero forgiveness.
6. **Darker side** (Odyssey): a long rhythmic ascent of moving platforms and cannon fire with the
   goal at the very top, purple moon palette, stars.
Finish: all six banners flash and a final 20-tile victory sprint to the goal. ~230 tiles.
This is the longest, hardest level before 10. Deaths here should feel like the player's fault.

## Level 7 — BRAIN AND BARREL (theme `factory`, music `factory`)
*"A flinging machine and smarts puzzle level."*

A clanking brass-and-steel factory: pipes, gauges, steam, rotating gears in the parallax.
Two intertwined ideas: **launchers** (the flinging machine) and **puzzles**.
Beats:
1. Tutorial launcher: a fixed-angle barrel with a dotted trajectory preview; ACTION fires.
2. A barrel chain (3 barrels) where each must be fired at the right moment.
3. A **rotating** barrel sweeping 20°–70° — fire at the right angle to hit a small ledge.
4. Puzzle A — ON/OFF: `!` switch, `M`/`N` blocks, and a route that needs the state toggled twice;
   a `sign` hints "ON opens the floor, OFF opens the roof".
5. Puzzle B — ordered switches: four `switch` entities in a room, signs showing a symbol order;
   pressing them in the wrong order resets the room (no death) and re-arms it.
6. Puzzle C — key/door with the key on the far side of a launcher shot, so you must fling the
   *player* to it and come back.
7. Puzzle D — a counting/logic gate: three `toggleblock` groups and a sign giving a riddle whose
   answer is which two to enable.
8. Finale: a three-barrel cannon sequence over a spike pit into the goal.
Every puzzle is solvable without dying; the hazards are around the puzzles, not inside them.
Two checkpoints. ~110 tiles.

## Level 8 — THE ULTIMATE OBBY TYCOON (theme `tycoon`, music `tycoon`)
*"The ultimate obby tycoon level."* **Read `docs/research-troll.md` §3 first.**

A bright Roblox-flavoured plot: checkered ground, plastic-looking blocks, a base plate.
The loop: **run a short obby lap → earn cash → buy a button → the level physically grows →
the next lap is longer and pays more.** `RT.Tycoon` does the heavy lifting.
Phases (each gated by a purchase):
1. Start with 0 cash and a tiny 10-tile obby lap with coins. Complete it → cash.
2. **Dropper 1** (25) — passive cash. **Bridge** (50) — paints tiles that open the next section.
3. **Conveyor obby** (120) + **Dropper 2** (150, faster).
4. **Double Jump** ability (250) — and the next section REQUIRES it.
5. **Spinner gauntlet** (400) — saws and movers appear; paying is how you unlock the hard part,
   which is the joke of the genre.
6. **Dash** ability (700) and the **Tower** (1000) — a vertical climb of movers and crumbles.
7. **The Gate** (2000) — buy the exit. A rebirth button offers 2× income if you re-run the lap.
Cash is shown in the HUD; buy buttons glow when affordable. Dying keeps your cash (deliberate —
this level is about grind, not punishment). Three checkpoints. ~140 tiles. Target 6–9 minutes.

## Level 9 — TRUST NOTHING (theme `troll`, music `troll`)
*"The ultimate troll level."* **Read `docs/research-troll.md` §1–2 first.**

A cheerful, deliberately childish world — pastel sky, smiling clouds, a rainbow — that hates you.
30+ distinct trolls from the research doc, **each used exactly once**, escalating:
mild (a fake platform, a spike that pops out, a coin that is a spike) → medium (invisible bonk
block over a pit, a falling ceiling, a `fakegoal` that says "lol" and sends you back, a
checkpoint that is actually a trap, a sign that lies, a spring that launches you into spikes) →
evil (reversed controls for 8 tiles with a sign that says "don't panic", a gravity flip section,
the goal that runs away three times and then gives up and lets you have it, a corridor where the
real path is *behind* you, a "SAFE ZONE" that is the only lethal tile in the room).
Rules that keep it fun: instant respawn, generous checkpoints (the trap checkpoint only costs a
few tiles), a visible death counter that turns into a badge, comedy sfx on every troll, and the
final door opening with a sincere "ok, you earned it". ~120 tiles.

## Level 10 — THE LAST TRIAL (themes `apocalypse` → `tycoon` → `troll` → Tetris, music `apocalypse`)
*"Luck and skill and tycoon in one, rage-inducing trolls, possible but insane, then beat Tetris
level 28."*

The finale. A burning sky, floating debris, lightning, the ruins of every earlier world drifting
in the parallax. Four movements, each with a checkpoint at its start:

1. **LUCK** — a chance obby. Doors with visible odds (3 doors, 1 opens, the others cost you a
   short spike detour but never a death you cannot avoid), a 50/50 bridge of platforms that
   randomise each attempt but always have a solvable path, a slot-machine gate that opens on a
   match and gives you a free re-spin after two failures. Luck costs **time**, never progress —
   research rule. Skill can bypass: a hard precision route skips the whole RNG for the bold.
2. **TYCOON** — `RT.Tycoon` again with a brutal price ladder: you must earn 1500 while the arena
   actively attacks (cannons, saws, a rising lava line that resets each cycle). Purchases:
   Dropper (100), Shield (300, one free hit), Double Jump (500), Bridge (900), The Elevator
   (1500) which lifts you to movement 3.
3. **TROLLS + SKILL** — the hardest platforming in the game, with trolls layered on: beat-blocks
   over the void where one block per beat is fake, a thwomp corridor with pop-out spikes, a
   crumble staircase that trolls the rhythm, a laser maze with reversed controls for 6 tiles, and
   a final 12-tile precision run with a fake goal at the end (the real goal is one screen higher).
4. **THE ARCADE** — an actual arcade cabinet stands at the end. Touch it, the screen fills, and
   `RT.Tetris.start({level:28, linesToWin:10})` runs the authentic NES Tetris kill-screen-adjacent
   level 28. Clear 10 lines to win the game. Top out → you restart Tetris only (the checkpoint is
   the cabinet, never the level), with a taunt line each time.
Winning shows THE END: total deaths, total time, a rage rating, and the credits.

---

## Route files

`docs/routes/levelNN.json` = `[{"hold":{"right":true},"steps":40},{"tap":"jump"},…]` — a legal
input script that reaches the goal, used by the automated playtest. `tap` presses for 1 step.
For levels 8 and 10 the route may call `"cash": n` to grant cash (testing the tycoon separately)
but must otherwise be legal. For level 10 the route may end at the arcade; Tetris is tested
separately through `__dbg.tetrisInput`.
