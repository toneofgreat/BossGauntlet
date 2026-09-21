# The Six Hardest Official Mario Levels — research for a fusion stage

**For:** a 2D side-scrolling canvas platformer, 32 px tiles, 3-tile jump height, ~4.5-tile max gap.
**Purpose:** build ONE stage that fuses six of the most-cited hardest official Mario levels, section by section.
**Scope rule:** *official* Nintendo-shipped levels only. Kaizo hacks, Mario Maker uploads and ROM hacks are excluded (they are cited constantly but are not official). Referenced for context only: `Kaizo Mario World` — https://en.wikipedia.org/wiki/Kaizo_Mario_World

Everything below that is a factual claim about a Mario game carries a source URL. Everything that is a *design
proposal* (tile counts, hex colours, timing windows) is mine and is labelled **DESIGN**, because no source
publishes those numbers for our engine.

This document is written against `rage-trials/CONTRACT.md` and uses its exact tile characters and entity
type names, so every section below is directly transcribable into a `levels/levelNN.js` descriptor.

---

## 0. Engine constants this document assumes

From `CONTRACT.md` §4 (binding; do not re-derive):

| thing | value | consequence |
|---|---|---|
| tile | 32 px | 1 tile = 32 world px |
| hitbox | 20 x 28 px | player fits a 1-tile corridor, falls into a 1-tile pit |
| max run | 210 px/s | 6.56 tiles/s |
| jump velocity | -560 px/s | |
| gravity rising / falling | 1550 / 2200 px/s² | asymmetric: floaty up, snappy down |
| apex hang | gravity x0.55 while rising and abs(vy) < 45 | widens the apex window ~0.05 s |
| spring power | -900 px/s | |
| coyote / buffer | 6 frames / 8 frames | 0.10 s / 0.13 s of forgiveness |
| camera | shorter screen axis = exactly 11 tiles | **you see ~5 tiles ahead — every telegraph must fit in 5 tiles** |

Derived (arithmetic on the above, **DESIGN** for planning only):

- Jump apex height = 560² / (2 x 1550) = **101 px ≈ 3.16 tiles**. Rise 0.36 s, fall 0.30 s, **airtime ≈ 0.71 s** with hang.
- Horizontal reach at full run = 0.71 s x 210 = **149 px ≈ 4.66 tiles** ⇒ 4-tile gap has ~0.09 s of slack; 3 tiles is comfortable; 2 is free.
- Spring (-900) apex = 900² / (2 x 1550) = **261 px ≈ 8.2 tiles**; rise 0.58 s, fall 0.49 s, **airtime ≈ 1.07 s**, horizontal reach ≈ **7 tiles**.
- A `balloon` (gravity x0.15) gives rising g = 232, falling g = 330 px/s² — a flap-and-drift float, not flight.

The 11-tile camera is the single most important constraint in this document. Champion's Road and The Perfect
Run are 3D levels where the camera pulls back to show the whole trap; a 2D 11-tile window cannot do that, so
every homage below replaces "see it coming from far away" with "a telegraph that fires 0.6-1.0 s before the
hazard, inside 5 tiles."

---

## 1. Which six, and how often they are cited

I sampled eight published rankings plus community threads. A "hit" = the level is named in that ranking.

| Level | Game (year) | TheGamer 20 | CBR 2D 10 | ScreenRant 10 | ScreenRant 3D 10 | GameRant | WatchMojo 10 | Destructoid 10 | hits |
|---|---|---|---|---|---|---|---|---|---|
| **Darker Side / Long Journey's End** | Odyssey (2017) | #17 | — | #9 | #5 | yes | #5 | — | **5** |
| **World C-3** | The Lost Levels (1986) | — | #2 | #7 | — | yes | #9 | #2 | **5** |
| **Champion's Road** | 3D World (2013) | #18 | — | #2 | #1 | — | #4 | — | **4** |
| **Grandmaster Galaxy: The Perfect Run** | Galaxy 2 (2010) | #16 | — | #1 | #2 | — | #10 | — | **4** |
| **Tubular** | Super Mario World (1990) | — | #7 | — | — | yes | — | #6 | **3** + near-universal fan consensus |
| **World 8-Airship** | Super Mario Bros. 3 (1988) | — | #4 | #5 | — | — | — | #7 | **3** |
| The Impossible Pack | NSMB2 DLC (2012) | — | #1 | #10 | — | — | #8 | — | 3 (runner-up) |
| Pachinko / Lily Pad (Sunshine) | 2002 | #14 (Watermelon) | — | #8 | #3, #8 | yes | #7 | #5 | 5 — **excluded: FLUDD-specific, not 2D-expressible** |
| Luigi's Purple Coins | Galaxy / Galaxy 2 | #13 | — | — | #6 | yes | #6 | #1 | 4 — **excluded: a collect-a-thon, not a traversal gauntlet** |
| Rainbow Ride (SM64) | 1996 | #19 | — | — | — | yes | — | — | 2 |
| World 8-4 / D-4 (Lost Levels) | 1986 | — | — | — | — | — | — | #10 (SMB 8-4) | 1 |

Sources for the table:
- TheGamer, "20 Most Difficult Super Mario Levels Of All Time" — https://www.thegamer.com/super-mario-hardest-levels/
- CBR, "The 10 Hardest 2D Mario Levels, Ranked" — https://www.cbr.com/hardest-2d-mario-levels-ranked/
- ScreenRant, "Super Mario: The 10 Hardest Levels Ever" — https://screenrant.com/super-mario-most-difficult-levels/
- ScreenRant, "10 Hardest 3D Mario Levels Of All Time, Ranked" — https://screenrant.com/hardest-3d-mario-levels-ranked/
- GameRant, "Hardest Levels In A Mario Game" — https://gamerant.com/best-worst-hardest-levels-mario-game/
- WatchMojo, "The 10 Hardest Super Mario Levels" — https://www.watchmojo.com/articles/hardest-super-mario-levels
- Destructoid, "The ten most difficult Mario levels EVER!" — https://www.destructoid.com/the-ten-most-difficult-mario-levels-ever/

**Two corrections to the brief:**

1. The brief says "NSMBU Impossible Pack." The Impossible Pack is DLC for **New Super Mario Bros. 2** (3DS),
   released 20 December 2012 in USA/Europe and 21 December in Japan/Australia — not NSMBU.
   https://www.mariowiki.com/Impossible_Pack
2. The brief offers Lost Levels **8-4** and **D-4** as the Lost Levels candidates. Across every list I sampled,
   the Lost Levels entry that actually gets cited is **World C-3** (springs + wind), not 8-4 or D-4. C-3 is also
   the one that maps cleanly onto a 2D engine (`spring` + `wind` entities) whereas 8-4/D-4 are pipe-maze loops.
   I picked C-3 and folded 8-4's two best ideas — the **looping pipe maze** and the **hidden-block Poison
   Mushroom** — into it as a mid-section trap, since both are documented on 8-4's page:
   https://www.mariowiki.com/World_8-4_(Super_Mario_Bros.:_The_Lost_Levels)

**The final six, in the order they should appear in the fusion stage:**

1. **World C-3** — Lost Levels, 1986 — *springs + wind*
2. **World 8-Airship** — SMB3, 1988 — *autoscroll + artillery*
3. **Tubular** — Super Mario World, 1990 — *P-Balloon float over a bottomless pit*
4. **The Perfect Run** — Galaxy 2, 2010 — *one hit = death, electric fences*
5. **Champion's Road** — 3D World, 2013 — *beat blocks, spike poles, rollers*
6. **Darker Side** — Odyssey, 2017 — *the long no-checkpoint gauntlet, mode switches*

That order is chronological AND monotonically escalating in the *kind* of demand: reflex → memorisation →
resource management → zero-error → rhythm → endurance. Keep it.

---

## 2. Level 1 — WORLD C-3 (Super Mario Bros.: The Lost Levels, 1986)

### Why it is hard

- "The entire level focuses on utilizing Super Springs to launch Mario so high into the air that you'll have
  to guess where exactly he is and hope you can land him at the next Super Spring. To make matters worse, a
  blustery wind will affect your trajectory, making deaths feel super cheap at times."
  https://www.nintendolife.com/features/talking-point-whats-the-most-difficult-mainline-mario-game
- Springs launch Mario "high above the screen" with obscured landing spots; wind gusts alter trajectory.
  https://screenrant.com/super-mario-most-difficult-levels/
- "trampolines are charged up and shoot Mario well off the top" and the wind "makes it hard to measure distance."
  https://gamerant.com/best-worst-hardest-levels-mario-game/
- Layout facts: **seven Super Springs**, the last preceding a Scale Lift before the Goal Pole; **wind blows
  throughout**; **Lakitus spawn infinitely from three set locations** throwing Spinies; one Green and one Red
  Koopa Paratroopa; **four Red Piranha Plants** in the warp-pipe section; **three Fire Bars** in the final
  section; **400-second** time limit; the article records **no checkpoints**.
  https://www.mariowiki.com/World_C-3
- Structural cruelty of the whole game: the Poison Mushroom is a power-up that kills you, and wrong pipes in
  8-4 "loop around to the hall with the Fire Bars."
  https://www.mariowiki.com/World_8-4_(Super_Mario_Bros.:_The_Lost_Levels)

### Signature mechanics
Super Spring (a launch far above the visible screen), constant lateral wind, infinite Lakitu spawner,
fire bars, Poison Mushroom, looping wrong-path pipes.

### Colour palette and visual identity
The FDS original renders C-3 in "a monochrome palette"; the *Super Mario All-Stars* port uses "the standard
grassland palette." https://www.mariowiki.com/World_C-3

**DESIGN — theme `smb1`:** SMB1 grassland. Sky `#5C94FC`, ground top `#00A800`, ground body `#C84C0C`,
brick `#D07030`, pipe `#00A800`/`#008800`, cloud/bush white `#FCFCFC`. Keep the palette flat and
low-contrast *except* the springs, which should be the only saturated red-orange (`#E84C20`) on screen —
this is how the player finds the next landing target during a 1.07 s blind arc. Ambient `dust`, parallax
`clouds` + `hills`.

### Homage section — "THE GALE" (38 tiles wide, 14 tall)

Spring launches (-900 px/s) give **1.07 s of airtime, ~8.2 tiles of height, ~7 tiles of horizontal reach**.
The whole section is a chain of those arcs with a cross-wind you must fight mid-air.

**Wind rig (DESIGN):** one `wind` entity spanning the whole section, `fx = +240 px/s²` (blows right, toward
the pit). Player air accel reaches 210 px/s in 0.18 s ⇒ ~1170 px/s² of counter-authority, so the wind is
strong but decisively beatable. Gust cycle: **base 240 for 3.0 s → 0.5 s ramp → gust 480 for 1.4 s → 0.5 s
ramp**, total period **5.4 s**. Telegraph the gust with a `deco:'flag'` at tile 4 that snaps horizontal
0.5 s before the gust peaks, plus the ambient dust doubling in speed. Never let a gust start while the
player is already airborne on the *first* jump of a chain — phase the cycle off `RT.setCheckpoint`.

| cols | what | entity / tile | timing |
|---|---|---|---|
| 0-5 | start ledge, `P` at 2, wind flag deco at 4 | `#`, `deco` | — |
| 6 | **Spring 1** | `S` | teaches the arc with wind at base strength |
| 7-12 | pit (void) | — | 1.07 s of flight |
| 13-15 | 3-tile landing pad, Lakitu spawner above at col 14 | `#`, `flyer` w/ spawn behaviour | spawner drops a Spiny every **2.2 s**, 0.4 s wind-up tell |
| 16 | **Spring 2** | `S` | must be entered running right |
| 17-22 | pit; **a `mushroom` with `poison:true` floats at col 19, y=4** directly on the natural arc | `mushroom` poison | this is the Lost Levels joke — it is *on the line*, so you must steer around your own path |
| 23-25 | landing pad, 2 `coin` above as a "this is the safe arc" line | `#`, `o` | coin arc = the intended trajectory (see §8) |
| 26 | **Spring 3**, sitting on a 1-tile pillar | `S` on `#` | pillar forces a precise step-on |
| 27-31 | pit crossed under **two fire bars** (rotating `saw` on a 3-tile circular path, centres at cols 28 and 30, counter-rotating) | `saw` path circle r=1.5 | period **2.4 s/rev**; the two bars are 180° out of phase, so the safe channel opens for **0.55 s every 1.2 s** |
| 32-34 | **the loop trap**: two pipes side by side, left one is a `portal` back to col 13, right one is the way on. The right pipe has a visible worn lip; the left has a fresh one | `portal`, `deco:'pipe'` | one-time troll; it is escapable in <4 s so it is a tax, not a wall |
| 35-37 | exit ledge → `C` checkpoint | `#`, `C` | |

**Engine features used:** `spring`(S), `wind`, `flyer`, `saw`, `mushroom{poison}`, `portal`, `coin`, `deco`.

**Fairness note:** because the arc is 8.2 tiles tall and the camera only shows 11 tiles, the player *will*
lose sight of the landing pad at apex. Mitigate exactly how Nintendo eventually did: draw a ground-shadow
marker (a 20 px dark ellipse) under the player at the projected landing x, updated live. That single
affordance converts C-3 from "cheap" to "hard." It is the one place I would deviate from the source.

---

## 3. Level 2 — WORLD 8-AIRSHIP (Super Mario Bros. 3, 1988)

### Why it is hard

- "Like with other Airship levels, this level autoscrolls, though it scrolls at a faster rate than usual."
  https://www.mariowiki.com/World_8-Airship_(Super_Mario_Bros._3)
- "The scrolling speed is twice as fast as normal." — same page, citing the level's guide text.
- Composition: "several small platforms, almost all of which have a Rocket Engine on the back end and a
  Rocky Wrench or two stationed on them. The gaps between the platforms vary in size, from small, one block
  length gaps to large chasms." **12 Rocky Wrenches** and **18 Rocket Engines** are present; "the ninth,
  twelfth, thirteenth and fifteenth Rocket Engines may randomly not spew any flames in the original release."
  https://www.mariowiki.com/World_8-Airship_(Super_Mario_Bros._3)
- ScreenRant: "Fast auto-scrolling with small platforms making jumps difficult," hazards include "flames,
  cannonballs, and Rocket Wrenches." https://screenrant.com/super-mario-most-difficult-levels/
- CBR: "Rocky Wrenches, fire obstacles, long gaps, Boom Boom boss, rapid screen scrolling."
  https://www.cbr.com/hardest-2d-mario-levels-ranked/
- Destructoid: "Auto-scrolling stage with Rocky Wrenches throwing obstacles at Mario mid-jump."
  https://www.destructoid.com/the-ten-most-difficult-mario-levels-ever/
- Boss: a single Boom Boom at the end via Warp Pipe, who "can fly after stomping him the first time."
  https://www.mariowiki.com/World_8-Airship_(Super_Mario_Bros._3)

Note: the giant cannon firing huge cannonballs belongs to **World 8-Battleship / the naval fleet**, not
8-Airship. https://www.thonky.com/super-mario-bros-3/world-8-battleship — I am importing the cannon anyway,
because "a 2D side-scroller with cannonballs" is exactly what the engine's `cannon`/`ball` pair is for, and
the two levels are adjacent in World 8. Flag this in any credits text as an 8-Airship *and* 8-Battleship fusion.

### Signature mechanics
Forced autoscroll with an instant-death left edge; pop-up-from-hatch enemies that throw arcing projectiles;
periodic flame jets on the trailing edge of each platform; irregular gap widths; randomised hazard dropouts.

### Colour palette and visual identity
Dark Land airships: riveted grey-brown iron hulls over a black/dark sky, orange flame plumes. The wiki page
gives no palette, so this is **DESIGN — theme `smb3`:** sky gradient `#000000` → `#2C1810`, hull top
`#8C7050`, hull side `#5C4830`, rivets `#C8B090`, bolt shadow `#2C2010`, flame `#FC9838` → `#FCFC54`,
cannonballs pure `#181818` with a 1 px `#606060` rim so they read against the dark sky. Ambient `ash`,
parallax `factory` (girders) at two depths. This is the only section on a **black** sky — it is the visual
palate cleanser between C-3's blue and Tubular's pastel.

### Homage section — "DARK LAND" (42 tiles wide, 12 tall), AUTOSCROLL

**Autoscroll (DESIGN):** 96 px/s = **3 tiles/s**, i.e. 1.45x the player's 210 px/s run — fast enough that you
cannot stop, slow enough that you can run ahead and bank a breather. 42 tiles = 1344 px = **14.0 s** to cross.
Left camera edge kills. Implement in `onUpdate` by driving `RT.cam.x` and testing the player against
`RT.cam.x - RT.view.w/2`.

| t (s) | cols | what | entity / tile | timing window |
|---|---|---|---|---|
| 0.0 | 0-4 | deck, `P`, one `coin` trail teaching "stay right of centre" | `#`, `o` | — |
| 1.0 | 5-7 | **gap 2** | — | trivial, calibrates the autoscroll |
| 1.7 | 8-12 | deck; **hatch wrench A** at col 10 | `trapspike`-style `walker` w/ pop behaviour | hatch rattles **0.35 s**, enemy rises 0.25 s, throws a wrench on a 45° arc (vx 120, vy -300) |
| 3.0 | 13-15 | **gap 3** with a **flame jet** on the right lip of the previous deck | `laser` vertical, `on:1.0 off:1.4 phase:0.3` | **1.4 s** safe window, fires 0.3 s warning glow (engine gives 0.3 s charge) |
| 4.2 | 16-21 | deck; **wrench B + C** at cols 17 and 20 | | two hatches offset by 0.9 s so they force alternating stomps |
| 5.8 | 22-25 | **gap 4** (the hard limit) crossed on a 2-tile `mover` running vertically | `mover` path [[23,7],[23,4]] speed 2.0 | platform completes a leg every **1.5 s**; you get one boarding chance per 3.0 s and the autoscroll gives you 2 |
| 7.5 | 26-30 | deck; **the cannon** fires from off-screen right | `cannon` dir left, `every:2.6`, `speed:300` | ball crosses the 11-tile view in 1.17 s; alternates y=5 (jump it) and y=8 (duck/step up) — **4 balls** during this deck |
| 9.5 | 31-33 | **gap 3** over lava `L` (so a miss is instant, not a long fall) | `L` | |
| 10.3 | 34-38 | final deck; **wrenches D + E** and **two flame jets** 180° out of phase | | the out-of-phase jets create a 0.6 s corridor that moves left→right, so you *walk the wave* |
| 12.8 | 39-41 | pipe → `C` checkpoint on a stable platform | `deco:'pipe'`, `C` | |

**The 8-Airship trick, kept:** the wiki notes that "landing directly on Rocky Wrenches can cast them off the
side of the ship." https://www.mariowiki.com/World_8-Airship_(Super_Mario_Bros._3) — so a stomp on a hatch
enemy should *not* just kill it, it should knock it off the deck with a satisfying arc, and **suppress that
hatch for the rest of the run**. That makes aggression the optimal play, which is the level's actual lesson.

**The randomised-dropout detail, kept but tamed:** the original randomly disables 4 of 18 rocket engines.
Randomness in a rage platformer is poison. Instead: make jet #3 and #6 fire only on **even** passes of the
cycle, so it is deterministic but looks random on a first playthrough. Determinism is non-negotiable —
see §8.

**Engine features used:** autoscroll camera, `laser` (flame jets), `cannon`+`ball`, `mover`, `L` lava,
pop-up `walker`, `o`.

---

## 4. Level 3 — TUBULAR (Super Mario World, 1990)

### Why it is hard

- "Tubular is the second level of the Special World in Super Mario World. Many fans also acclaim this level
  to be the hardest in the game." https://mario.fandom.com/wiki/Tubular
- "The level's main mechanic involves a vast pit where the player must guide Mario or Luigi over it by
  grabbing numerous P-Balloons. This can be difficult to do as multiple enemies are blocking the paths, and
  moving around with the P-Balloon can prove a challenge." https://mario.fandom.com/wiki/Tubular
- "there are no checkpoints, because if you get hit by an enemy or drag out your balloon powers, you have to
  start the entire level all over again." https://mario.fandom.com/wiki/Tubular
- "After only one hit, Mario loses his power-up, plummets into the pit below, and instantly dies."
  https://mario.fandom.com/wiki/Tubular
- Exact contents: **one long area, 300-second time limit, six Dragon Coins**, three Power Balloons in ? Blocks
  — first "next to the last pipe, under a Switch Block," second "between the Confused Chucks and the three
  Koopa Paratroopas in a vertical formation," third "underneath the first Passin' Chuck." Enemies: 5 Red Koopa
  Paratroopas, 2 Jumping Piranha Plants, **4 Volcano Lotuses**, 2 Confused Chucks, 2 Passin' Chucks, 2 Clappin'
  Chucks, 6 Lookout Chucks. The first section is "pipes of various lengths, with Jumping Piranha Plants and
  Chargin' Chucks"; the middle is "a long gap" with "countless fire balls spat by Volcano Lotuses."
  https://www.mariowiki.com/Tubular
- The power-up's control model: Balloon Mario "will gradually float upwards if not moved by the player" and has
  "simple vertical and horizontal mobility"; the balloon "has a set timer, and Mario or Luigi will start to
  flash when the timer is ending." https://www.mariowiki.com/Power_Balloon and
  https://en.wikibooks.org/wiki/Super_Mario_World/Items/P-Balloon
- In the original SMW he can "move in four directions: up, down, left and right" — the diagonal, hover-like
  control only arrived in Super Mario Maker 2, where "the P-Balloon will last indefinitely and never deflates
  as long as you don't get hit." https://www.sm128c.com/power-balloon-compared-super-mario-maker-2-smw-0174
  **No source I could find publishes the exact SMW balloon duration in seconds or frames** — treat any specific
  number as unverified. I use 8.0 s below as a **DESIGN** value, not a citation.
- "Tubular is a fairly short level, but trying to navigate through a maze of obstacles to the Giant Gate before
  the effects of the P-Balloon wear off … made even more brutal by the speed at which the P-Balloon runs out."
  https://www.thegamer.com/super-mario-hardest-levels/

### Signature mechanics
A timed, low-gravity float over a level with **no floor at all**; a resource (balloon time) that must be
re-acquired mid-flight; projectiles on "very odd paths"
(https://www.destructoid.com/the-ten-most-difficult-mario-levels-ever/); ground enemies stationed on pipe
caps that are the only solid things in the world.

### Colour palette and visual identity
Special World levels are pastel sky levels dominated by pipe green and cloud white. The wiki pages do not
publish hexes, so **DESIGN — theme `smw`:** sky `#88C8F8` → `#C8E8F8` vertical gradient, pipe green
`#00B800` top / `#007000` side / `#004000` dark, pipe rim `#58F858`, cloud `#FFFFFF` at 85% alpha,
Volcano-Lotus fireballs `#FC5820` with a `#FCD848` core. The balloon itself `#F8D8E8` with a `#E85878` rim,
and it should **pulse its rim brighter** as the timer runs out (this is the "flashing" tell the wiki
documents). Ambient `none` — the sky must stay clean so a single fireball reads instantly. Parallax `pipes`.

### Homage section — "TUBULAR" (45 tiles wide, 13 tall) — NO FLOOR

**Balloon rig (DESIGN):** `balloon` entity, `dur: 8.0`. Engine gives gravity x0.15 ⇒ rising g = 232,
falling g = 330 px/s²; ACTION/jump is a flap. Horizontal control stays at 210 px/s. 45 tiles = 1440 px, so a
straight-line crossing is **6.9 s** of held run — one balloon *almost* covers it, which is the point: you
must take two, and the second pickup is the level.

Three balloons at cols **5**, **20** and **33** (the source has exactly three:
https://www.mariowiki.com/Tubular). Balloon 1 covers cols 5-20 (15 tiles), balloon 2 covers 20-33, balloon 3
is the safety net for the last 12 tiles. A perfect run can skip balloon 3 with ~1.1 s to spare — put six
`coin` (the Dragon Coin homage) on the route that only a balloon-3 skip can reach.

| cols | what | entity / tile | timing |
|---|---|---|---|
| 0-4 | the last solid ground in the section; `P`, a `sign` reading "THERE IS NO FLOOR" | `#`, `sign` | the one safe spot; a fair level gives you one before it removes the floor |
| 5 | **Balloon 1** in a `B` breakable block at y=6, with an `!` ON/OFF switch above it — homage to the "? Block under a Switch Block" placement | `balloon`, `B`, `!` | 8.0 s starts on pickup |
| 6-11 | **three pipe stubs** (2, 3 and 2 tiles tall) at cols 6, 9, 12 rising from nothing, each capped with a **Jumping Piranha** (`walker` that hops on a 1.8 s cycle, 0.45 s airborne) | `#` stubs, `walker` | pipes are the only solids; landing on one refunds nothing but lets you re-aim |
| 13-19 | **Volcano Lotus row**: four emitters on pipe caps at cols 13, 15, 17, 19, each firing **2 fireballs in a 40° arc every 1.6 s**, phase-offset by 0.4 s so the row produces a left-to-right ripple | `cannon` `aim` variant firing `ball` | the ripple creates a moving **0.7 s** hole you ride through |
| 20 | **Balloon 2** floating free in open air; you must be *at the right altitude* when balloon 1 expires | `balloon` | miss it and balloon 1's last 1.5 s must get you to col 33 — impossible, so this is a real commitment point |
| 21-27 | **Chargin' Chuck lane**: three `flyer` enemies patrolling horizontally at y=4, y=7, y=10, speeds 90/130/90 px/s, so the three lanes desync into a slow-moving braid | `flyer` | full braid period ≈ 9.0 s; a safe lane exists at all times but moves |
| 28-32 | **the vertical squeeze**: two pipe walls leave a 2-tile horizontal slot at y=6, with a `saw` on a 4-tile vertical path crossing it | `#`, `saw` speed 2.0 | saw clears the slot for **1.1 s** out of every 2.6 s |
| 33 | **Balloon 3** (the mercy pickup), deliberately 2 tiles *below* the fast route | `balloon` | taking it costs ~0.8 s and the six coins |
| 34-41 | open sky with two `flyer` sweepers and a 6-`coin` arc along the high line | `flyer`, `o` | |
| 42-44 | landing deck → `C` | `#`, `C` | |

**The critical rule:** while ballooned, **contact with any enemy pops the balloon and does not kill** — you
then fall with normal gravity into the void, which kills. That two-step death is Tubular's exact cruelty
("after only one hit, Mario loses his power-up, plummets into the pit below, and instantly dies" —
https://mario.fandom.com/wiki/Tubular) and it is *more* readable than instant death because the player sees
the cause. Give the pop 0.25 s of hitstop (`RT.hitstop`) so it registers.

**Engine features used:** `balloon`, `cannon`+`ball`, `flyer`, `walker`, `saw`, `B`, `!`, `sign`, `o`.

---

## 5. Level 4 — GRANDMASTER GALAXY: THE PERFECT RUN (Super Mario Galaxy 2, 2010)

### Why it is hard

- "The player has to do the mission with only one hit point and with no Checkpoint Flags, meaning the player
  starts at the very beginning of the mission if they take damage." https://www.mariowiki.com/The_Perfect_Run
- Unlock cost: you must clear The Ultimate Test **and** bank **9,999 Star Bits**.
  https://www.mariowiki.com/The_Perfect_Run
- Area order: Starting Area → Flipswitch Planet → **Electric Maze Area** → Platform Planets → Pull Star Area →
  **Hammer Bro Planets** → Gate Planet. Hazards include "Choppahs and additional Space Mines" plus Bullet
  Bills, Sentry Beams, **electric rails**, Pulse Beams, Roctos, Paragoombas and Flomps, ending with Hammer
  Bros and then **Boomerang Bros**. https://www.mariowiki.com/The_Perfect_Run
- You must also *hold* the Cloud form, since "it is required to complete one section of the mission" and can
  only be lost by taking damage. https://www.mariowiki.com/The_Perfect_Run
- Community framing: "In 'The Perfect Run', you have one single life point, which means you can't take a single
  hit, there are also no checkpoints." https://www.speedrun.com/smg2/guides/e53q5
- The final Hammer/Boomerang Bro section is the hardest part; "once you reach the three Boomerang Bros. you can
  crouch to dodge all the boomerangs." https://www.speedrun.com/smg2/guides/e53q5
- "one of the hardest missions to ever appear in a Mario game."
  https://www.sm128c.com/how-to-beat-the-perfect-run-in-super-mario-galaxy-2-0178
- ScreenRant ranks it the single hardest Mario level: "Daredevil Run variant offers only one hit point and no
  checkpoints." https://screenrant.com/super-mario-most-difficult-levels/

### Signature mechanics
**One hit = full restart.** Flipswitch panels (step on every tile of a grid to open the exit). Electric maze:
a grid of moving electric fences with no attack answer — pure pathing. A finite, non-renewable resource (the
Cloud) you carry across the whole run. A projectile duel that is solved by a defensive posture (crouch), not by
dodging.

### Colour palette and visual identity
Deep-space blacks and purples with neon-cyan electric rails and chrome-blue platforms, star-bit gold, and the
red/yellow Flipswitch panels. **DESIGN — theme `galaxy`:** sky `#080018` → `#1C0038`, nebula wash `#6A2CA0` at
20% alpha, platform top `#5AC8FA`, side `#2878B4`, dark `#103050`, rim `#BCE8FF`, electric rail `#00FFE0` with
additive glow, flipswitch OFF `#C82828` / ON `#F8D820`, star bits `#FFE45C`. Ambient `stars`, parallax `nebula`
+ `stars`. The key visual rule: **electricity is the only cyan in the section**, so cyan means death, always.

### Homage section — "THE PERFECT RUN" (36 tiles wide, 12 tall) — ONE HIT

**The rule (DESIGN):** this section sets `RT.player` to a one-hit state. Any contact — enemy, projectile,
electric rail — calls `RT.killPlayer` and respawns at the section checkpoint, **not** at the stage start. This
is the honest compromise: the *feeling* of "one hit" is preserved, but a 240-tile fusion stage cannot ask for a
full restart at tile 130 (see §8 on checkpoints). A post-game "GRANDMASTER" modifier can restore the true rule.

| cols | what | entity / tile | timing window |
|---|---|---|---|
| 0-3 | arrival pad, `C`, banner "ONE TOUCH AND YOU RESTART" | `C`, `RT.banner` | the level must *say* the rule; this is not optional |
| 4-9 | **Flipswitch floor**: a 6x1 run of `M` ON/OFF blocks with an `!` switch at col 4 — but the twist is that you must cross it left-to-right **while it is OFF**, using `N` blocks that only exist for the 2.0 s the switch holds | `M`, `N`, `!` | switch holds **2.0 s**; the crossing takes 6 tiles / 210 px/s = **0.91 s**, so the margin is 1.1 s |
| 10-17 | **ELECTRIC MAZE**: four vertical `laser` bars at cols 11, 13, 15, 17, each `on:0.9 off:1.1`, phases 0.0 / 0.55 / 1.1 / 1.65 | `laser` | a travelling gap moves right at ~1 tile / 0.55 s = 58 px/s; the player at 210 px/s must **deliberately slow down** and pace the wave — this is the one place the level punishes running |
| 18-21 | **Space Mines**: three `flyer` mines on slow 3-tile vertical bobs, 2.8 s period, that **detonate 0.5 s after the player comes within 2.5 tiles** (0.5 s flashing tell, then a 1.5-tile kill radius) | `flyer` custom | the tell must be audible too — `RT.Audio.sfx` a rising beep |
| 22-25 | **Pull-Star gap**: a 4-tile pit crossed by a `launcher` that auto-rotates through ±35° and fires on ACTION, with the engine's dotted trajectory preview | `launcher` `rotate:true` | sweep period **2.2 s**; the correct firing window is ~**0.45 s** wide; the preview line makes it fair |
| 26-31 | **HAMMER BROS**: two `walker` enemies on 1-tile pedestals at cols 27 and 30, each lobbing an arcing projectile every **1.4 s**, phase-offset 0.7 s | `walker` + `ball` | there is a **crouch-safe** tile directly under each arc; holding DOWN on that tile is a guaranteed dodge, exactly as the speedrun guide describes for Boomerang Bros |
| 32-35 | **Gate**: a `door` that needs 1 `key`, and the key sits between the two Hammer Bros at col 29 | `door`, `key` | you cannot just sprint past — the level forces you into the duel |

**The Cloud analogue:** carry a single `mushroom` (non-poison, a one-hit shield) picked up at col 2. The
section's real design goal is that the shield is *tempting* — spending it on the electric maze means facing
the Hammer Bros naked. Do not give a second one.

**Engine features used:** `M`/`N`/`!` ON-OFF, `laser`, `flyer`, `launcher`, `walker`, `ball`, `door`, `key`,
`mushroom`, `C`.

---

## 6. Level 5 — CHAMPION'S ROAD (Super Mario 3D World, 2013)

### Why it is hard

- "The level is relatively lengthy, and contains no checkpoints or power-ups, including the Invincibility Leaf."
  https://www.mariowiki.com/Champion%27s_Road
- "This level does not even possess a checkpoint, so one mistake means that player must completely restart. It
  has difficult foes at every turn and timed platforms that are almost impossible to master."
  https://screenrant.com/super-mario-3d-world-how-to-beat-champions-road/
- Section order, per the wiki: (1) floating blocks with three Octoombas on dark purple moving platforms;
  (2) a Clear Pipe to three **Fire Bros.**, then single-block-wide platforms patrolled by **five Chargin'
  Chucks**; (3) **Blast Blocks** — "Players must run and time their jumps over Blast Blocks that alternate
  faster in double time" — then an arena of respawning **crumbling blocks**, three Magikoopas and "four Fire
  Bars in each corner"; (4) grey platforms with **six spiked rollers and six swinging spikes** plus **forty
  Fuzzies**; (5) a wall-jump climb with spring platforms and **twelve Horned Ant Troopers**, then **four
  Piranha Creepers** and a swim through blue and red **Spike Blocks**; (6) **Dash Panels** past **eight Ring
  Burners**' shockwaves while collecting **five Key Coins**; (7) Clear Pipes spelling "THANK YOU!!" at the goal.
  https://www.mariowiki.com/Champion%27s_Road
- "run quickly across collapsing platforms while dodging fireballs and Magikoopas, jump in time with rapidly
  disappearing blocks, and complete an auto-runner segment that throws a never-ending barrage of lasers at you."
  https://www.thegamer.com/super-mario-hardest-levels/
- WatchMojo's summary of the demand: "Constant movement required with disappearing platforms, beat blocks,
  swinging spike pendulums." https://www.watchmojo.com/articles/hardest-super-mario-levels
- Blast Blocks are Beep Blocks "in quadruple time," and in Champion's Road they "still alternate in the beat of
  the original theme's BPM (from Beep Block Skyway and Blast Block Skyway)" rather than the level's own tempo.
  https://www.mariowiki.com/Blast_Block — **no source publishes the BPM as a number**; my 120 BPM below is
  **DESIGN**.
- The level is marked on the world map by a crown icon and a **heartbeat sound effect**.
  https://www.mariowiki.com/Champion%27s_Road

### Signature mechanics
**Music-locked hazards.** Champion's Road is the only one of the six where the danger is on a *musical* clock
rather than an arbitrary one, which is why it feels playable rather than random. Plus: one-tile-wide walkways,
crumbling floors, pendulum spikes, rollers, and a dash-panel autorun finale.

### Colour palette and visual identity
Neon on deep purple-black void — glowing pastel block faces (mint, pink, lemon) on "dark purple moving
platforms," grey obstacle plates, and the goal's neon Clear-Pipe lettering.
https://www.mariowiki.com/Champion%27s_Road — **DESIGN — theme `sm3dw`:** void `#100820` → `#2A0F42`, block
face `#F8F0FF` with per-block accent `#7CF0C8` / `#FF8FD0` / `#FFE87C`, platform side `#4A2270`, rim
`#C89CFF`, roller/spike plate grey `#8890A0` with `#C8D0E0` rim, spike tip `#FFFFFF`. The blocks must **glow**
(a 6 px additive halo) and must **dim 0.25 s before they vanish** — the engine's `beatblock` already ships a
0.25 s warning flash, so this is free. Ambient `none` + a slow starfield; parallax `stars` only.

### Homage section — "CHAMPION'S ROAD" (40 tiles wide, 14 tall) — ON THE BEAT

**Music rig (DESIGN):** pick **120 BPM** for this section's track. Beat = 0.5 s. Set `beatblock.period = 1.0`
(0.5 s A solid, 0.5 s B solid) for the first half, then **double time** `period = 0.5` (0.25 / 0.25) for the
last 12 tiles, exactly matching the wiki's "alternate faster in double time." Every other hazard in this
section must be a whole-number multiple of 0.5 s so the whole screen pulses as one instrument. This is the
single best idea in Champion's Road and it is the reason it is *fair*: the player can hear the safe frames.

| cols | what | entity / tile | timing (all multiples of 0.5 s) |
|---|---|---|---|
| 0-3 | arrival, `C`, and a **2-bar silent runway** where nothing can kill you | `#`, `C` | 4.0 s of nothing — this is where the player syncs to the beat |
| 4-11 | **Beat-block staircase**: alternating `beatblock` group A/B in a rising 1-tile stagger, period **1.0 s** | `beatblock` | you land on A, jump on the beat, land on B; 8 tiles = 8 beats = **4.0 s** |
| 12-16 | **One-tile walkway** patrolled by two `walker` "Chucks" at 130 px/s that turn at edges | `#` 1-tile wide, `walker` | walkway is 1 tile wide with void below; stomping is the only pass |
| 17-22 | **Crumble arena**: a 6x1 floor of `K` crumble platforms over lava `L`, with **four `saw` fire bars** rotating from the four corners | `K`, `L`, `saw` | `K` falls 0.35 s after contact, returns 2.5 s later (engine defaults); saws 2.0 s/rev, so the arena has a **1.0 s** all-clear every 2.0 s |
| 23-28 | **Pendulum alley**: three swinging spikes (a `saw` on a pendulum path, 3-tile radius) at cols 24, 26, 28, phases 0 / 0.5 / 1.0 s, period **2.0 s** | `saw` | each pendulum is clear for **0.75 s**; with the 0.5 s phase offsets you must move on every beat — no stopping |
| 29-33 | **Rollers**: three `saw` cylinders rolling left along the floor at 110 px/s, spawning every **2.0 s**, jumped or ducked under a 2-tile ceiling | `saw`, `#` | roller crosses the 11-tile view in 3.2 s; you get 1 clean jump window per roller |
| 34-39 | **DOUBLE TIME**: `beatblock` period **0.5 s** (0.25/0.25) in a 6-tile flat run with `^` spikes in the gaps below | `beatblock`, `^` | 0.25 s windows; the engine's 0.25 s warning flash means the flash *is* the whole off-phase — use a **colour** change, not a flash, at this tempo |
| 39 | goal-adjacent `C` | `C` | |

**Readability at 0.25 s:** at 60 Hz that is 15 frames. A flash-based tell is unreadable. Switch the tell to
*saturation*: solid blocks are fully saturated, about-to-vanish blocks desaturate over 4 frames. And **put the
audio on it** — a hi-hat on every 0.25 s tick. Players will clear this by ear.

**Engine features used:** `beatblock`, `K` crumble, `L`, `saw`, `walker`, `^`, `C`, music-locked timing.

---

## 7. Level 6 — DARKER SIDE (Super Mario Odyssey, 2017)

### Why it is hard

- Entry cost is **500 Power Moons**, and "there are no checkpoints, so if the player dies, they will have to
  restart." https://www.mariowiki.com/Darker_Side
- "The underground tunnel that connects the two platforms is made up of a bunch of floating platforms suspended
  above a sea of lava. This tunnel makes up most of the challenge found within the kingdom, being made of a
  gauntlet of platforming and capture challenges." https://www.mariowiki.com/Darker_Side
- Length: "a test composed of 14 — yes, 14 — different sections"
  https://www.gamesradar.com/super-mario-odyssey-darker-side-challenge-guide/ and "ten capture transformations
  spread across fifteen phases, making this one of the longest Mario levels."
  https://www.thegamer.com/super-mario-hardest-levels/
- The chain of challenges, in order: capture a Frog to reach a pipe; capture Goombas to beat Yoofoe; climb and
  wall-jump; swing across sinking poles; long-jump across platforms rushing through lava; platform as a Lava
  Bubble; platform as an Uproot; swim through freezing water; scale a vertical conveyor belt with Yoshi's
  tongue; follow blossoming flowers; answer Sphynx questions; climb without Cappy up a changing wall; glide as
  Glydon past mosquitos; fling across lava as Volbonans; guard against Burrbos on a moving platform; hop
  swinging platform to swinging platform as Pokio; beat Donkey Kong in 2D; and run a **gauntlet of spike balls
  as Bowser**. https://goombastomp.com/super-mario-odyssey-level-level-darker-side/
- Enemy/hazard roster confirmed by the wiki: Goomba, Yoofoe, Lava Bubble, Moonsnake, Magmato, Uproot, Burrbo,
  Fuzzy, Pulse Beam, Urban Stingby, Pokio, Barrel, Oil drum, Donkey Kong — over a lava sea; the finale is a
  Bowser capture into a "THANK YOU" spark-pylon area. https://www.mariowiki.com/Darker_Side
- "one of the longest levels without checkpoints in Mario history."
  https://www.thegamer.com/super-mario-hardest-levels/
- Nine kingdom themes play sequentially as you traverse it. https://www.mariowiki.com/Darker_Side — this is the
  level's real signature and it is trivially copyable: **the music changes every section.**

### Signature mechanics
Endurance and **ability-switching**: the level keeps taking away and handing back your moveset. Long stretches
over a lava sea. A 2D-in-3D homage segment (Donkey Kong). No checkpoints across the longest span in the series.

### Colour palette and visual identity
Culmina Crater: charcoal-black moon rock over an orange-white lava sea, with the Dark Side's purple-black sky
and pale "THANK YOU" spark pylons at the end. **DESIGN — theme `odyssey`:** sky `#1A0E1E` → `#3A1428`, rock top
`#4A4450`, side `#2E2A34`, dark `#16141A`, rim `#7A7488`, lava `#FF6A00` → `#FFD400` with a `#FFF4C8` surface
line, spark pylon `#E8F4FF`. Ambient `embers`, parallax `volcano`. Because this is the **last** section, let the
lava's glow slowly increase across it — a purely visual escalation that costs nothing and reads as "the end."

### Homage section — "DARKER SIDE" (45 tiles wide, 16 tall) — THE GAUNTLET

The design brief here is different from the other five: Darker Side's difficulty is **accumulation**, not any
single trap. So this section is a chain of **five short, individually-easy trials in a row with no checkpoint
between them**, over lava. Each trial changes the player's abilities. Nothing here should be harder than
"medium" in isolation — the length is the boss.

| cols | trial | ability state | entity / tile | timing |
|---|---|---|---|---|
| 0-2 | arrival ledge, `C` (the **last** checkpoint of the stage), `RT.banner` "NO MORE CHECKPOINTS" | normal | `C` | the warning is the whole point; announce it |
| 3-10 | **Trial 1 — Lava Rush.** A 3-tile `mover` carries you right at 130 px/s across a lava sea while **four `lavaball` podoboos** erupt from below on a 1.8 s cycle, phase-offset 0.45 s | normal | `mover`, `L`, `lavaball` | the eruption apex is 4 tiles; the platform is 1 tile above lava; you jump on beats **0.9 s** apart |
| 11-17 | **Trial 2 — No Cappy.** Double-jump/dash disabled (`RT.player.abilities = {doubleJump:false, dash:false}`); a 3-tile-high wall climb via alternating one-way ledges with `trapspike` pop-outs under each | reduced | `-`, `trapspike` `trigger:'near'` `delay:0.3` | spikes pop **0.3 s** after you get within 2 tiles; the ledge above is reachable in 0.28 s — a true 15-frame commitment |
| 18-25 | **Trial 3 — Burrbo Platform.** A slow 4-tile `mover` (60 px/s, 4.3 s to cross) that **six `walker` Burrbos** run onto from both ends; you must stomp or shove them off without leaving the platform | dash re-enabled | `mover`, `walker` | a Burrbo boards every **1.2 s**, alternating sides; the platform holds 3 at once before you are out of room |
| 26-32 | **Trial 4 — Pokio Poles.** Four `launcher` posts at cols 27, 29, 31, 33 alternating with void; each holds you and fires on ACTION along a **sweeping** angle | normal | `launcher` `rotate:true` `auto:false` | sweep **1.8 s** per post; the safe firing arc is **0.5 s**; four posts in a row = four consecutive 0.5 s windows with no ground between them |
| 33-40 | **Trial 5 — Donkey Kong.** A 2D-in-2D joke: a 4-tile-tall girder stack with **`ball` barrels** rolling down from the top every **1.6 s**, bouncing off each girder lip | normal | `deco:'girder'`, `cannon`+`ball`, `-` | climb 4 ledges while barrels descend; the barrels' bounce is deterministic, seeded — never `RT.random()` |
| 41-44 | **THANK YOU** — spark pylons spelling it in `text` entities, then `G` | — | `text`, `deco`, `G` | both Champion's Road and Darker Side end with a literal "THANK YOU" (https://www.mariowiki.com/Champion%27s_Road, https://www.mariowiki.com/Darker_Side). Copy it. It is the most-earned two words in the series. |

**The nine-themes trick:** Darker Side changes music every section
(https://www.mariowiki.com/Darker_Side). In our fusion stage, do the same across the **whole** 240-tile level —
one `RT.Audio.music()` track per source-level section, cross-faded at the checkpoint. That is what will make a
240-tile stage feel like a journey rather than a slog, and it costs one line per section.

---

## 8. What makes a hard Mario level FAIR — the readability rules

These are the rules that separate the six levels above from a Kaizo hack. Each is sourced.

### 8.1 Four-part structure: introduce, develop, twist, conclude
Koichi Hayashida describes Nintendo's level model as *kishōtenketsu*: "First, you have to learn how to use that
gameplay mechanic, and then the stage will offer you a slightly more complicated scenario in which you have to
use it. And then the next step is something crazy happens that makes you think about it in a way you weren't
expecting." https://www.gamedeveloper.com/design/the-secret-to-i-mario-i-level-design
Mark Brown's formulation: "the stages are four-part, self-contained showcases for new ideas, where a mechanic
can be successfully taught, developed, twisted and then thrown away in about five minutes flat."
https://mcvuk.com/business-news/publishing/video-nintendos-level-design-secrets-in-four-steps/

**Apply it:** every one of the six sections above must open with a **free** instance of its mechanic. Section 1
gives you a spring with the wind at base strength. Section 3 gives you a balloon over solid ground before it
removes the floor. Section 5 gives you 4.0 s of empty runway to find the beat. Do not skip these — they cost
3-4 tiles and they are what make the other 36 legible.

### 8.2 Forgiveness: teach small before you test large
"The best levels introduce a concept, then gently test the player's understanding of that concept, before
eventually challenging their mastery of it." And: "A well-designed level will first give smaller, more
manageable versions of these surprises, maintaining the flow of the level without telegraphing too much."
https://crookedpixels.com/the-ux-of-super-mario-bros-three-concepts-found-in-good-level-design/

**Apply it:** every hazard's first appearance is a 1-unit version at half tempo. The Blast Block section is
period 1.0 s before it is period 0.5 s. The cannon fires one ball before it fires four.

### 8.3 Affordance: no blind leaps, ever
"Players shouldn't have to take blind leaps of faith because they don't know where to go. It's up to the
designer to communicate the level's intent to the player." Coins are the primary tool: "strategically
positioned to indicate where players should jump and highlight areas of interest."
https://crookedpixels.com/the-ux-of-super-mario-bros-three-concepts-found-in-good-level-design/

**Apply it:** with an 11-tile camera, **every jump whose landing is off-screen must have a coin arc.** Use `o`
as a trajectory annotation, not as score. This is non-negotiable in the C-3 spring section and the Tubular
balloon section, which are the two places the player cannot see the destination.

### 8.4 Fair means "signposted," not "easy"
The Mario Maker community's own line: it is "perfectly fair to expect split-second timing, insanely difficult
jumps, and near-impossible speedrun tricks — but it's not fair if there's no indication of which move is
required, where to jump, what path is safe, or how to proceed." And: "If the player is forced to guess on what
to do, such as picking the right door or making a blind jump, it won't feel rewarding even if they pick
correctly." https://supermariomaker2.fandom.com/wiki/Trolling_Techniques

**Apply it:** a 15-frame window is fair. A window you cannot see is not. Our engine already ships the right
tells — `laser` has a 0.3 s charge warning, `beatblock` a 0.25 s flash, `thwomp` a 0.3 s shake, `launcher` a
dotted trajectory preview. **Never build a hazard that lacks a tell.**

### 8.5 The troll must be survivable and learnable
"A good troll level will never make the player pick at random between identical paths: it will always give the
player a way to die and quickly return to the last checkpoint instead of soft-locking… A good troll must leave
the player in control of their own fate — once a troll is known, the player should be able to avoid it by the
second playthrough." https://supermariomaker2.fandom.com/wiki/Trolling_Techniques

**Apply it:** the C-3 looping pipe, the Poison Mushroom and the `F` fake platforms are all *one-time* taxes.
Each must be (a) visually distinct on a second look, and (b) cost under 5 s. The engine's `F` tile already has
"a subtle tell (darker top, no rim highlight, faint 2.5 s flicker)" per `CONTRACT.md` §5 — do not remove it.

### 8.6 Rhythm: intensity must alternate with rest
Good pacing is "the rhythm between intense and quiet moments," and a rest spot works best when "you want the
player to LAND in that respite spot after the challenge that leads into it."
https://gtstu.com/game-level-design-principles/

**Apply it:** every section gets a 2-4 tile flat safe platform at its end, and the player **lands on it** out
of the last hazard rather than walking onto it. Measured across the fusion stage that is roughly 7 s of danger
to 2 s of rest, which is the Champion's Road ratio.

### 8.7 Hard levels earn their hardness by *removing* the safety net, visibly
Kotaku on SMB 8-3: World 8's staircases progressively erode until "8-3's staircase is the sparest of all,
composed of a few, floating blocks," and the level's eight Hammer Bros. are arranged so that "to maximize your
chances of survival, you must defeat all eight… Paradoxically, it's easier to overcome eight of them than it
is to overcome four," because the power-ups are hidden under the first four.
https://kotaku.com/what-made-super-mario-bros-level-8-3-so-good-1833135706

**Apply it:** this is the best single design lesson in the research. Make the *aggressive* line the *safe* line.
The 8-Airship stomps that permanently disable hatches, and the Perfect Run key that sits between the Hammer
Bros, are both built on it.

### 8.8 Checkpoint placement
"Placing checkpoints in the appropriate spot will keep the player motivated to complete your stage, making them
feel like they've earned it after conquering a significant challenge."
https://supermariomaker2.fandom.com/wiki/Trolling_Techniques

Five of the six source levels have **no checkpoints at all** — Tubular
(https://mario.fandom.com/wiki/Tubular), Champion's Road (https://www.mariowiki.com/Champion%27s_Road), The
Perfect Run (https://www.mariowiki.com/The_Perfect_Run), Darker Side (https://www.mariowiki.com/Darker_Side)
and C-3 (https://www.mariowiki.com/World_C-3). **Do not copy that.** A 240-tile fusion stage with no
checkpoints is not homage, it is a different and worse game. Instead:

- `C` at the **end** of each of the first five sections (5 checkpoints, ~40 tiles apart, ~35-50 s of play each).
- Place the flag so the player **lands on it** coming out of the last hazard (§8.6), never 3 tiles before one.
- Reset state on respawn is already handled — `CONTRACT.md` §4: "Everything one-shot (crumbled platforms,
  popped traps) resets on respawn unless `e.persistent = true`." Set `persistent: true` on the C-3 loop pipe
  and the disabled airship hatches so the player never re-pays a learned troll.
- The **last** section (Darker Side) deliberately has none, and says so out loud with a banner. One
  no-checkpoint stretch at the very end is the homage; six of them is a bug report.
- Optional post-game **GRANDMASTER** modifier that disables all five `C` flags and restores one-hit death.
  That is where the true Perfect Run experience lives, opt-in.

### 8.9 Determinism
Every source level above is deterministic except SMB3's randomly-silent rocket engines
(https://www.mariowiki.com/World_8-Airship_(Super_Mario_Bros._3)), which is universally regarded as the worst
thing about it. `CONTRACT.md` §2 already mandates a fixed 60 Hz step and `RT.seed(n)`. **Use `RT.seed` at
section entry and never call `RT.random()` inside an update loop.** If a hazard must look random, make it
periodic with a long, prime-ish period (e.g. 7 beats against a 4-beat pattern).

### 8.10 The 11-tile camera rule
Everything above collapses into one engine-specific rule: **you have 5 tiles of look-ahead, which at 210 px/s
is 0.76 s.** Therefore no tell may fire later than 0.7 s before its hazard, and no hazard may travel toward the
player faster than ~420 px/s (or it enters the screen and hits in under 0.4 s, inside human reaction time).
The 8-Airship cannonball at 300 px/s crosses the view in 1.17 s — that is the upper bound; do not exceed it.

---

## 9. Fusion stage assembly

| # | section | source | tiles | cumulative | theme | music | new mechanic |
|---|---|---|---|---|---|---|---|
| 1 | THE GALE | Lost Levels C-3 (1986) | 38 | 0-37 | `smb1` | smb1 | `spring` + `wind` |
| 2 | DARK LAND | SMB3 8-Airship (1988) | 42 | 38-79 | `smb3` | smb3 | autoscroll + `cannon` |
| 3 | TUBULAR | SMW (1990) | 45 | 80-124 | `smw` | smw | `balloon`, no floor |
| 4 | THE PERFECT RUN | SMG2 (2010) | 36 | 125-160 | `galaxy` | galaxy | one-hit, `laser` maze |
| 5 | CHAMPION'S ROAD | SM3DW (2013) | 40 | 161-200 | `sm3dw` | sm3dw | `beatblock` on the beat |
| 6 | DARKER SIDE | Odyssey (2017) | 45 | 201-245 | `odyssey` | odyssey | endurance, no checkpoint |
| | **total** | | **246** | | | | |

246 tiles is within `CONTRACT.md` §5's 400-tile cap. Use `themeZones` with those exact `x0`/`x1` boundaries;
cross-fade music on the `C` flags. Height: take the max (16, from Darker Side) — the tile array must be
rectangular, so pad the shorter sections with empty rows at the top.

**Transition tiles:** insert a 3-tile flat "airlock" at every boundary where the theme swaps, so the parallax
and palette change does not happen mid-jump. Those 3 tiles are also the §8.6 rest beat. Budget them inside each
section's count (they are already the "0-3 arrival" rows above).

**Sections nobody should cut:** the free-practice opener of each section (§8.1) and the coin arcs over blind
jumps (§8.3). They are 8% of the tiles and 80% of the difference between "hard" and "unfair."

---

## 10. Source list

- TheGamer, 20 Most Difficult Super Mario Levels — https://www.thegamer.com/super-mario-hardest-levels/
- CBR, 10 Hardest 2D Mario Levels — https://www.cbr.com/hardest-2d-mario-levels-ranked/
- ScreenRant, 10 Hardest Levels Ever — https://screenrant.com/super-mario-most-difficult-levels/
- ScreenRant, 10 Hardest 3D Mario Levels — https://screenrant.com/hardest-3d-mario-levels-ranked/
- ScreenRant, 9 Tips For Champion's Road — https://screenrant.com/super-mario-3d-world-how-to-beat-champions-road/
- GameRant, Hardest Levels In A Mario Game — https://gamerant.com/best-worst-hardest-levels-mario-game/
- WatchMojo, 10 Hardest Super Mario Levels — https://www.watchmojo.com/articles/hardest-super-mario-levels
- Destructoid, Ten Most Difficult Mario Levels EVER — https://www.destructoid.com/the-ten-most-difficult-mario-levels-ever/
- Nintendo Life, Most Difficult Mainline Mario Game — https://www.nintendolife.com/features/talking-point-whats-the-most-difficult-mainline-mario-game
- Kotaku, What Made SMB Level 8-3 So Good — https://kotaku.com/what-made-super-mario-bros-level-8-3-so-good-1833135706
- Super Mario Wiki, World C-3 — https://www.mariowiki.com/World_C-3
- Super Mario Wiki, World 8-4 (Lost Levels) — https://www.mariowiki.com/World_8-4_(Super_Mario_Bros.:_The_Lost_Levels)
- Super Mario Wiki, World D-4 — https://www.mariowiki.com/World_D-4
- Super Mario Wiki, World 8-Airship (SMB3) — https://www.mariowiki.com/World_8-Airship_(Super_Mario_Bros._3)
- Thonky, SMB3 World 8 Battleship — https://www.thonky.com/super-mario-bros-3/world-8-battleship
- Super Mario Wiki, Tubular — https://www.mariowiki.com/Tubular
- Mario Fandom Wiki, Tubular — https://mario.fandom.com/wiki/Tubular
- Super Mario Wiki, Power Balloon — https://www.mariowiki.com/Power_Balloon
- Wikibooks, SMW P-Balloon — https://en.wikibooks.org/wiki/Super_Mario_World/Items/P-Balloon
- SM128C, Power Balloon SMM2 vs SMW — https://www.sm128c.com/power-balloon-compared-super-mario-maker-2-smw-0174
- Super Mario Wiki, The Perfect Run — https://www.mariowiki.com/The_Perfect_Run
- Speedrun.com, How to beat The Perfect Run — https://www.speedrun.com/smg2/guides/e53q5
- SM128C, How to Beat The Perfect Run — https://www.sm128c.com/how-to-beat-the-perfect-run-in-super-mario-galaxy-2-0178
- Super Mario Wiki, Champion's Road — https://www.mariowiki.com/Champion%27s_Road
- Super Mario Wiki, Blast Block — https://www.mariowiki.com/Blast_Block
- Super Mario Wiki, Darker Side — https://www.mariowiki.com/Darker_Side
- GamesRadar, Darker Side challenge guide — https://www.gamesradar.com/super-mario-odyssey-darker-side-challenge-guide/
- Goomba Stomp, Odyssey Level by Level: Darker Side — https://goombastomp.com/super-mario-odyssey-level-level-darker-side/
- Super Mario Wiki, Impossible Pack — https://www.mariowiki.com/Impossible_Pack
- Game Developer, The Secret to Mario Level Design — https://www.gamedeveloper.com/design/the-secret-to-i-mario-i-level-design
- MCV/DEVELOP, Nintendo's level design secrets in four steps — https://mcvuk.com/business-news/publishing/video-nintendos-level-design-secrets-in-four-steps/
- Crooked Pixels, The UX of Super Mario Bros. — https://crookedpixels.com/the-ux-of-super-mario-bros-three-concepts-found-in-good-level-design/
- Super Mario Maker 2 Wiki, Trolling Techniques — https://supermariomaker2.fandom.com/wiki/Trolling_Techniques
- GTSTU, Game Level Design Principles — https://gtstu.com/game-level-design-principles/
- TV Tropes, That One Level / Super Mario Bros. — https://tvtropes.org/pmwiki/pmwiki.php/ThatOneLevel/SuperMarioBros
