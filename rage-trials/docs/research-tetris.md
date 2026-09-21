# NES Tetris, Level 28 — implementation research

Target: a faithful NES Tetris minigame that **starts on level 28**, embedded as the final challenge of a
2D canvas platformer. Everything below is written so you can type it straight into JS.

**Primary source note.** Most numbers here come from a byte-accurate ca65 disassembly of the retail
Nintendo NES ROM (`CelestialAmber/TetrisNESDisasm`), which I downloaded and read directly. Where a claim
comes from the disassembly I quote the label and the bytes, so you can re-check it. Wiki claims are used
for the empirically-measured things the code does not state in one place (ARE range, human technique
speeds). Every claim has a URL.

---

## 0. The 60 Hz contract (read this first)

Every NES Tetris timing below is in **NTSC frames at 60.0988 Hz**. Do **not** drive the minigame off
`requestAnimationFrame` deltas directly — a 120 Hz display or a 50 Hz throttle silently changes the
difficulty of the whole thing. Use a fixed-step accumulator:

```js
const FRAME_MS = 1000 / 60.0988;   // 16.6389 ms
let acc = 0, last = performance.now();
function loop(now) {
  acc += Math.min(now - last, 250);   // clamp tab-switch spikes
  last = now;
  while (acc >= FRAME_MS) { tetrisFrame(); acc -= FRAME_MS; }  // simulate
  render();
  requestAnimationFrame(loop);
}
```

`tetrisFrame()` is the unit of all the numbers in this document. The NTSC frame rate of 60.0988 Hz and the
"frames per gridcell" framing are the standard way both wikis express gravity
([tetris.wiki](https://tetris.wiki/Tetris_(NES,_Nintendo)), [harddrop.com](https://harddrop.com/wiki/Tetris_(NES,_Nintendo))).

Note the PAL ROM is a *different game* — different gravity, different DAS. Use NTSC (PAL numbers appear
below only so you don't mix them up by accident).

---

## 1. The gravity table — frames per gridcell, levels 0–29

This is the actual table from the ROM. Label `framesPerDropTable`, NTSC branch, 30 bytes:

```
.byte $30,$2B,$26,$21,$1C,$17,$12,$0D
.byte $08,$06,$05,$05,$05,$04,$04,$04
.byte $03,$03,$03,$02,$02,$02,$02,$02
.byte $02,$02,$02,$02,$02,$01
```

— [main.asm, `framesPerDropTable`](https://github.com/CelestialAmber/TetrisNESDisasm/blob/master/main.asm)

| Level | Frames/cell | Cells/sec | Level | Frames/cell | Cells/sec |
|---|---|---|---|---|---|
| 0 | 48 | 1.25 | 15 | 4 | 15.02 |
| 1 | 43 | 1.40 | 16 | 3 | 20.03 |
| 2 | 38 | 1.58 | 17 | 3 | 20.03 |
| 3 | 33 | 1.82 | 18 | 3 | 20.03 |
| 4 | 28 | 2.15 | **19** | **2** | **30.05** |
| 5 | 23 | 2.61 | 20 | 2 | 30.05 |
| 6 | 18 | 3.34 | 21 | 2 | 30.05 |
| 7 | 13 | 4.62 | 22 | 2 | 30.05 |
| 8 | 8 | 7.51 | 23 | 2 | 30.05 |
| 9 | 6 | 10.02 | 24 | 2 | 30.05 |
| 10 | 5 | 12.02 | 25 | 2 | 30.05 |
| 11 | 5 | 12.02 | 26 | 2 | 30.05 |
| 12 | 5 | 12.02 | 27 | 2 | 30.05 |
| 13 | 4 | 15.02 | **28** | **2** | **30.05** |
| 14 | 4 | 15.02 | **29+** | **1** | **60.10** |

**Confirmed: levels 19–28 are all 2 frames per cell; level 29 and above is 1 frame per cell — the
kill screen.** Ten consecutive `$02` bytes at indices 19–28, then `$01`.
Corroborated independently by [tetris.wiki](https://tetris.wiki/Tetris_(NES)),
[harddrop.com](https://harddrop.com/wiki/Tetris_(NES,_Nintendo)) and
[meatfighter's disassembly writeup](https://meatfighter.com/nintendotetrisai/) ("level 29 is twice as
fast as level 28").

Speed only increases at levels 1–10, 13, 16, 19 and 29; everything between is flat
([Wikipedia](https://en.wikipedia.org/wiki/Tetris_(NES_video_game))).

Implementation gotcha from the code: the lookup is guarded by `cpx #$1D / bcs @noTableLookup`, i.e. for
level ≥ 29 the game uses a hard-coded `1` and never reads index 29. So:

```js
const FRAMES_PER_CELL = [48,43,38,33,28,23,18,13,8,6,5,5,5,4,4,4,3,3,3,2,2,2,2,2,2,2,2,2,2];
const gravity = lvl => (lvl >= 29 ? 1 : FRAMES_PER_CELL[lvl]);   // level 28 -> 2
```

**PAL for contrast (do not use):** `$24,$20,$1D,$19,$16,$12,$0F,$0B,$07,$05,$04,$04,$04,$03,$03,$03,$02,$02,$02,$01…`
— PAL hits 1 frame/cell at level **19**, not 29 (same `framesPerDropTable`, `.if PAL = 1` branch).

### What 2 frames/cell means in wall-clock terms

- One row every **33.3 ms**. Spawn (row 0) to floor (row 19) = 19 rows × 2 = **38 frames ≈ 0.63 s**.
- Add entry delay (§3) and you get a piece every **~0.75–0.95 s**, i.e. **~70–80 pieces/minute**.
- The bottom row gives you exactly **2 frames** of slide/spin before the lock (see "Lock behaviour").

---

## 2. DAS — delayed auto-shift

### The constants, from the ROM

```
; NTSC
DAS_DELAY := $0A   ; = 10
DAS_RESET := $10   ; = 16
; PAL
DAS_DELAY := $08   ; = 8
DAS_RESET := $0C   ; = 12
```
— [constants.asm](https://github.com/CelestialAmber/TetrisNESDisasm/blob/master/constants.asm)

### The algorithm, from `shift_tetrimino`

Per frame, while the piece is under player control:

1. **If Down is held, `shift_tetrimino` returns immediately.** You literally cannot move left/right
   while soft-dropping (`lda heldButtons / and #BUTTON_DOWN / bne @ret`). This is a real mechanic, not
   an emulator artifact — replicate it or level 28 plays wrong.
2. If Left or Right was *newly pressed* this frame → `autorepeatX = 0`, then shift 1 column immediately.
3. Else if Left or Right is *held* → `autorepeatX++`; if `autorepeatX >= 16` then `autorepeatX = 10`
   and shift 1 column.
4. If the shift is blocked by the wall or the stack, X is restored **and `autorepeatX` is set to 16**
   (`@restoreX: lda #DAS_RESET`). So DAS sits "full" against a wall and fires the instant the
   obstruction clears.
5. Right has priority over Left (the code tests `BUTTON_RIGHT` first), so Left+Right together moves right.

Net behaviour: **tap = 1 cell instantly, then a 16-frame wait, then 1 cell every 6 frames** (≈10 cells/s).
Matches both wikis: "DAS initial delay is 16 frames, and then every 6 frames"
([tetris.wiki](https://tetris.wiki/Tetris_(NES,_Nintendo)); harddrop adds the reset-to-10 detail:
[harddrop.com](https://harddrop.com/wiki/Tetris_(NES,_Nintendo))). PAL is 12 then every 4.

### DAS charging through the entry delay — the single most important level-28 mechanic

`shift_tetrimino` is only called from play-state 1 (`playState_playerControlsActiveTetrimino`). During
lock, line-clear animation and spawn, it never runs — so **`autorepeatX` is frozen and cannot be reset**.
Harddrop states this explicitly: "during ARE the DAS counter effectively freezes… the counter only resets
to zero by pressing down the left or right buttons in a time other than ARE", and "when dead tetrominos
or a wall blocks the active piece, the DAS counter instantly jumps to 16"
([harddrop.com](https://harddrop.com/wiki/Tetris_(NES,_Nintendo))).

Consequence: a player who holds a direction into the entry delay arrives at spawn with **DAS already
charged**, so the very first frame of control produces a shift and then one every 6 frames. That is the
only reason 19–28 is playable with the D-pad held. Reachability from the spawn origin (column 5):

| Situation | Frames of free fall | Shifts at frames 0, 6, 12, … | Columns reachable from 5 |
|---|---|---|---|
| L28, empty board (19 rows) | 38 | 7 | any column (needs ≤ 5) |
| L28, stack 10 high (9 rows) | 18 | 4 | columns 1–9 |
| L28, stack 15 high (4 rows) | 8 | 2 | columns 3–7 |
| L29, empty board | 19 | 4 | columns 1–9 |
| L29, stack 10 high | 9 | 2 | columns 3–7 |

(Derived from gravity 2 vs 1 frames/cell and the 6-frame DAS repeat above.) This is why level 29 is "the
kill screen": with a stack of any height, charged DAS can no longer reach the walls before the piece
lands. Tetris Interest puts it the same way: "Level 29 is known as the Killscreen because it is nearly
impossible to move pieces left and right by holding down the D-Pad, aka using DAS"
([tetrisinterest.com](https://tetrisinterest.com/blue-scuti-became-the-first-person-to-beat-nes-tetris/)).

### Hypertapping

Rather than hold the direction, tap it faster than 10 Hz so every tap is a "newly pressed" shift and DAS
never engages. "Horizontal tetromino speed is maximized by rapidly tapping the D-pad more than 10 times
per second… the technique involves flexing the biceps until it tremors, so that the high-speed tremor
taps the thumb on the D-pad" ([Tetris Wiki](https://tetris.fandom.com/wiki/Tetris_(NES,_Nintendo)),
[simon.lc explainer](https://simon.lc/what-is-das-and-hyper-tapping-in-tetris)). Practical hypertap rates
of ~12–15 Hz give a shift every 4–5 frames — a modest gain over DAS's 6, but crucially it is available
*immediately* with no 16-frame charge, and it survives the kill screen better.

### Rolling

Invented ~2020–21. "Players hold the D-pad lightly with their thumb and use the fingers of their other
hand to drum ('roll') against the back of the controller… players can register inputs at speeds exceeding
20 times per second. This technique is what made the 10 million, 20 million, and 40 million point barriers
possible" ([GIGAZINE](https://gigazine.net/gsc_news/en/20210427-nes-tetris-rolling/),
[Tom's Hardware](https://www.tomshardware.com/video-games/retro-gaming/tetris-was-finally-beaten-after-34-years-game-kill-screen-pops-up-at-level-157-hypertapping-and-rolling-were-key-techniques)).
At 20–30 Hz that's a shift every 2–3 frames, i.e. roughly one column per cell of fall even at level 29 —
which is how the kill screen became survivable at all. On 21 Dec 2023 Blue Scuti (Willis Gibson, 13)
became the first human to crash the game, on level 157 after 1,511 lines
([Kotaku](https://kotaku.com/twitch-youtube-blue-scuti-tetris-kill-screen-nes-1851134043),
[videogamecanon](https://www.videogamecanon.com/adventurelog/blue-scuti-tetris/)).

**Why this matters for your game:** the "hold a direction" input model is exactly good enough for level 28
and not good enough for level 29. Keep authentic 16/6 DAS and you have reproduced the real skill ceiling.
See §7 for the concessions worth making on touch.

---

## 3. Everything else the core loop needs

### Board

**10 columns × 22 rows, top 2 rows hidden** — "the Nintendo Tetris playfield consists of a matrix with 22
rows and 10 columns such that the top 2 rows are hidden from the player"
([meatfighter](https://meatfighter.com/nintendotetrisai/)). The visible well is 10×20; only rows 0–19 are
ever copied to VRAM (`copyPlayfieldRowToVRAM` stops at row 20). In practice: a 10×20 visible grid plus a
2-row spawn buffer above it.

### Spawn

`playState_spawnNextTetrimino`:

```
fallTimer   = 0
tetriminoY  = 0
tetriminoX  = 5
currentPiece = spawnOrientationFromOrientation[nextPiece]
playState   = 1
autorepeatY = 0          ; <-- soft-drop hold is cleared on every spawn
```

- **Origin is always (x = 5, y = 0)** — "when a Tetrimino is spawned, it is always positioned at
  coordinates (5, 0) within the playfield" ([meatfighter](https://meatfighter.com/nintendotetrisai/));
  confirmed by `lda #$05 / sta tetriminoX` in the disassembly.
- **`autorepeatY = 0` at spawn** means holding Down through a lock does **not** carry the soft drop into
  the next piece. You must release and re-press Down for every piece. Easy to get wrong.

**Spawn orientations** (`spawnTable`, one per piece type, in the randomizer's index order):

```
.byte tDown, jDown, zHoriz, oFixed, sHoriz, lDown, iHoriz
```

and the per-mino offsets, straight out of `orientationTable` as `(dy, tile, dx)` triplets — these are the
exact spawn shapes relative to the origin:

| Piece | Spawn orientation | Mino offsets (dx, dy) | Occupied columns | Tile |
|---|---|---|---|---|
| T | `tDown` ($02) | (−1,0) (0,0) (1,0) (0,1) | 4, 5, 6 | tile1 |
| J | `jDown` ($07) | (−1,0) (0,0) (1,0) (1,1) | 4, 5, 6 | tile3 |
| Z | `zHoriz` ($08) | (−1,0) (0,0) (0,1) (1,1) | 4, 5, 6 | tile2 |
| O | `oFixed` ($0A) | (−1,0) (0,0) (−1,1) (0,1) | 4, 5 | tile1 |
| S | `sHoriz` ($0B) | (0,0) (1,0) (−1,1) (0,1) | 4, 5, 6 | tile3 |
| L | `lDown` ($0E) | (−1,0) (0,0) (1,0) (−1,1) | 4, 5, 6 | tile2 |
| I | `iHoriz` ($12) | (−2,0) (−1,0) (0,0) (1,0) | 3, 4, 5, 6 | tile1 |

— [main.asm, `orientationTable` / `spawnTable`](https://github.com/CelestialAmber/TetrisNESDisasm/blob/master/main.asm),
cross-checked against [meatfighter](https://meatfighter.com/nintendotetrisai/) (`02 07 08 0A 0B 0E 12` =
`Td Jd Zh O Sh Ld Ih`).

Notice every spawn puts the flat side up with the nub/foot **below** the spine — pieces enter one row
lower than modern SRS spawns, so the well is effectively 19 rows of travel.

### The randomizer (re-roll once on a repeat)

The PRNG is a 16-bit Fibonacci LFSR seeded to `$8988`: new bit = bit1 XOR bit9, shift right
([meatfighter](https://meatfighter.com/nintendotetrisai/)); period 32767. Piece selection, logic verbatim
from `pickRandomTetrimino`:

```
spawnCount++                                  ; wraps at 256
idx = (rngByte + spawnCount) & 7
if idx == 7                     -> reroll
else piece = spawnTable[idx]
     if piece == previousSpawnId -> reroll     ; "don't repeat"

reroll:
  advance PRNG
  idx2 = (rngByte & 7) + previousSpawnId       ; note: + the ORIENTATION id, not 0..6
  while idx2 >= 7: idx2 -= 7                   ; mod 7 by repeated subtraction
  piece = spawnTable[idx2]

previousSpawnId = piece
```

So: **one uniform draw with an invalid 8th slot; on an invalid draw *or* an immediate repeat, exactly one
re-roll, and that re-roll is biased by the previous piece's orientation id.** No bag, no drought
protection, and a repeat *can* still come out (the re-roll is not filtered). Resulting distribution as
measured by meatfighter: **T 14.73%, S 14.73%, J 14.29%, Z 14.29%, O 14.29%, L 13.84%, I 13.84%**
([meatfighter](https://meatfighter.com/nintendotetrisai/)). Long I-droughts are a genuine feature of NES
Tetris and a large part of what kills level-28 runs — keep it.

If you want the flavour without the LFSR, `Math.random()` plus the re-roll rule is close enough; if you
want determinism for replays or a leaderboard, implement the LFSR (four lines).

### Next-piece preview

One piece, always shown in the box to the right. The retail ROM lets Select toggle it off mid-game
(`gameModeState_updateCountersAndNonPlayerState`: `newlyPressedButtons & BUTTON_SELECT → displayNextPiece ^= 1`)
— a hidden hard-mode toggle you could expose as a bonus. Default: **on, 1 piece, no hold, no ghost piece,
no hard drop** ([tetris.wiki](https://tetris.wiki/Tetris_(NES,_Nintendo)): "no lock delay, wall kick, or
hard drop").

### Rotation — Nintendo Rotation System, right-handed, no kicks

`rotate_tetrimino`: A = clockwise, B = counter-clockwise. Each is a single table lookup into
`rotationTable` (2 entries per orientation), then `isPositionValid`. **If the rotated position collides,
the orientation is simply restored — there are no wall kicks and no floor kicks.**

```
.byte tLeft, tRight   ; from tUp      (B, A)
.byte tUp,   tDown    ; from tRight
.byte tRight,tLeft    ; from tDown
.byte tDown, tUp      ; from tLeft
.byte jDown, jUp      ; from jLeft
...
.byte zVert, zVert    ; from zHoriz   ; S, Z and I have only 2 states
.byte oFixed,oFixed   ; from oFixed   ; O does not rotate
.byte iVert, iVert    ; from iHoriz
```

**S, Z and I have 2 orientations; O has 1; T, J and L have 4** — 19 orientations total plus a `hidden`
one used during the clear animation ([main.asm `orientationTable`](https://github.com/CelestialAmber/TetrisNESDisasm/blob/master/main.asm),
matching meatfighter's "19 total orientations"). tetris.wiki calls the whole thing the "right-handed
Nintendo Rotation System" ([tetris.wiki](https://tetris.wiki/Tetris_(NES,_Nintendo))).

Practical consequences: **a vertical I flush against a wall cannot be rotated flat**, and the classic NES
right-well I-piece placement only works because the right-handed system puts the vertical I in column x,
not x−1. Port `orientationTable` verbatim and you get all of this for free. Rotation costs no time — it is
not gated by DAS or gravity; one rotation per frame per press.

### Soft drop, and the fact that there is no hard drop

`drop_tetrimino`, exact logic:

- If `autorepeatY == 0` (not soft-dropping): if **Left or Right is held → soft drop cannot start**; else
  if Down is the *only* newly-pressed D-pad direction → `autorepeatY = 1`.
- If `autorepeatY != 0`: if Down is still held → `autorepeatY++`; when it reaches 3 → `autorepeatY = 1`,
  `holdDownPoints++`, **and the piece drops one row**. That is **one cell every 2 frames (½G)** after a
  3-frame lead-in. If Down is released → `autorepeatY = 0` **and `holdDownPoints = 0`** (the accrued drop
  points are thrown away).
- While `autorepeatY != 0`, the normal gravity path is bypassed entirely.

Matching prose: "after the first 3 frames of holding down without holding left or right or pressing up,
and every 2 frames thereafter, the active piece will move downwards, or lock in place if it cannot move
downwards" ([negative-seven](https://negative-seven.github.io/tetris_explained/)); soft drop speed 1/2G
([harddrop](https://harddrop.com/wiki/Tetris_(NES,_Nintendo))).

Two consequences that matter at level 28:

1. **Soft drop is 2 frames/cell — exactly the same as level-28 gravity.** Holding Down at level 28 buys
   *zero* speed. It only buys points (1 per row, and only if you never release), and it costs you the
   ability to move horizontally. At level 29 it is actively *slower* than gravity (2 vs 1), because the
   soft-drop branch replaces the gravity branch entirely.
2. **There is no hard drop and no lock delay** ([tetris.wiki](https://tetris.wiki/Tetris_(NES,_Nintendo))).
   Hard drop had to be *added* by ROM hackers ([gridbugs](https://www.gridbugs.org/reverse-engineering-nes-tetris-to-add-hard-drop/)).

### Lock behaviour

There is no lock-delay counter. When the gravity (or soft-drop) step fails `isPositionValid`, Y is
restored and `playState = 2` (`playState_lockTetrimino`) on that same frame. So the slide/spin window on
the bottom row is exactly `gravity(level)` frames — **2 frames at level 28**, i.e. one input opportunity.
Because the check is "can I move down", you can still slide or spin *into* an overhang during those
frames, which is where NES tuck/spin techniques come from ("lock delay equal to the drop delay; achievable
via slides and spins exploiting validation logic" — [meatfighter](https://meatfighter.com/nintendotetrisai/)).

### ARE / entry delay after lock

Mechanism, from the disassembly: locking sets `vramRow = max(tetriminoY − 2, 0)` and
`copyPlayfieldRowToVRAM` copies **one 10-byte row per frame** until `vramRow` reaches 20, at which point it
is set to `$20`. `playState_spawnNextTetrimino` refuses to run until `vramRow == $20`. So the higher the
piece locked, the more rows must be copied and the longer the delay — plus a handful of fixed frames for
the play-state chain (lock → check rows → lines/stats → garbage → spawn).

Measured range, per both wikis: **"ARE is 10–18 frames depending on the height at which the piece locked;
pieces that lock in the bottom two rows are followed by 10 frames of entry delay, and each group of 4 rows
above that has an entry delay 2 frames longer"**
([tetris.wiki](https://tetris.wiki/Tetris_(NES,_Nintendo)), [harddrop](https://harddrop.com/wiki/Tetris_(NES,_Nintendo))).

Use this table:

| Lock row (0 = top of visible well) | ARE frames |
|---|---|
| 18–19 | 10 |
| 14–17 | 12 |
| 10–13 | 14 |
| 6–9 | 16 |
| 0–5 | 18 |

```js
function areFrames(lockRow) {            // lockRow = bottom row the piece occupies, 0..19
  const above = Math.max(0, 18 - lockRow);
  return Math.min(18, 10 + 2 * Math.ceil(above / 4));
}
```

Remember that DAS is frozen (not cleared) through all of these frames, and a direction press during ARE
does not zero it. That window is the player's entire preparation time.

### Line-clear animation

`updateLineClearingAnimation`, verbatim behaviour:

- Runs only on frames where `frameCounter & 3 == 0`, i.e. every 4th frame.
- Each step blanks **one column from each side, working outward from the centre**:
  `leftColumns = 4,3,2,1,0` and `rightColumns = 5,6,7,8,9`.
- `rowY` counts 0 → 4, so there are **5 steps, 4 frames apart**, then the play state advances.

Total: **17–20 frames depending on which frame the piece locked** (the phase of the global frame counter)
— exactly as tetris.wiki describes: "line clear delay is an additional 17~20 frames depending on the frame
that the piece locks; the animation has 5 steps that advance when the global frame counter modulo 4 equals 0"
([tetris.wiki](https://tetris.wiki/Tetris_(NES,_Nintendo))). This is *added to* the ARE, so a line clear
costs roughly 27–38 frames of non-play. Render it centre-outward in 5 discrete steps; do not fade.

For a **tetris** (4 rows) the game additionally flashes the background: in the render path, while
`completedLines == 4` and `frameCounter & 3 == 0`, it writes `$30` (white) to the universal background
colour, and every 8th frame re-triggers SFX `$09`. That is the famous strobe.

### Top-out

`playState_lockTetrimino` first calls `isPositionValid`; if the just-locked position is invalid (what
happens when a piece spawns into occupied cells and immediately fails to move), the game sets noise SFX
`$02`, `playState = $0A`, `curtainRow = $F0` (= −16). `playState_updateGameOverCurtain` then advances one
row every 4 frames (`frameCounter & 3`), drawing tile `$4F` across all 10 columns of rows 0 → 19. So:
**16 frames of pause, then a 20-row curtain at 4 frames per row ≈ 144 frames (2.4 s) total.** The
condition itself: "the game ends when it is no longer possible to spawn the next piece — all four cells of
the playfield corresponding to the spawned Tetrimino's square positions must be empty"
([meatfighter](https://meatfighter.com/nintendotetrisai/)).

---

## 4. Scoring and the level transition (what "beating level 28" means)

### Scoring

`pointsTable`, BCD words:

```
.word $0000, $0040, $0100, $0300, $1200
```

added `level + 1` times (`generalCounter = levelNumber + 1`, then a `dec/bne` loop).
— [main.asm `pointsTable` / `addLineClearPoints`](https://github.com/CelestialAmber/TetrisNESDisasm/blob/master/main.asm)

| Clear | Base | **× (level+1) at level 28 (×29)** |
|---|---|---|
| Single | 40 | **1,160** |
| Double | 100 | **2,900** |
| Triple | 300 | **8,700** |
| **Tetris** | **1200** | **34,800** |

Confirmed by [harddrop's scoring page](https://harddrop.com/wiki/Scoring): "Single 40, Double 100,
Triple 300, Tetris 1200; points for each action = base value × (level + 1)".

**Soft-drop points:** 1 point per row continuously soft-dropped, with no level multiplier
(`addHoldDownPoints`; `holdDownPoints` is zeroed the instant Down is released). Harddrop: "the game awards
the number of points equal to the number of grid spaces that the player has continuously soft dropped the
piece". Note the disassembly's `cmp #$02 / bmi` — a 1-row drop awards nothing, and the BCD addition is
buggy for some values (negative-seven documents "binary values are added to BCD scores without proper
conversion", producing "unintuitive and often incorrect point awards" —
[negative-seven](https://negative-seven.github.io/tetris_explained/)). Do not replicate the bug; just
award `rows` points.

**Score cap: 999,999.** The code clamps to `$99 $99 $99` (`lda #$99` ×3) when the top BCD byte would carry
past 99 — the famous "maxout". Modern players display 7–8 digits by tracking the overflow separately; if
you want authenticity, cap at 999999 and treat a maxout as a win condition in its own right.

### Level transition in A-type (`playState_updateLinesAndStatistics`)

For each cleared line: `lines++` (BCD), then if the units digit is 0, the 16-bit BCD `lines` value is
shifted right 4 bits and its **low byte** is compared against `levelNumber`; if `levelNumber <` that byte,
`levelNumber++` and SFX `$06` plays.

Because `lines` is packed BCD, that low byte works out to `16 × (hundreds digit) + (tens digit)`. So:

> **Level up happens at the first multiple of 10 lines where `16·H + T > currentLevel`**, where H and T
> are the hundreds and tens digits of the line count.

This reproduces the commonly quoted rule — "when the player clears (startLevel × 10 + 10) or
max(100, startLevel × 10 − 50) lines, whichever comes first, the level advances by 1; then every 10 lines"
([tetris.wiki](https://tetris.wiki/Tetris_(NES))) — for every start level the menu can actually select
(0–19), and it is why a level-18 start reaches 19 at **130** lines (`H=1, T=3 → 19 > 18`). It also
explains the "erratic advancement for levels 10–19" bug both meatfighter and negative-seven describe
([meatfighter](https://meatfighter.com/nintendotetrisai/), [negative-seven](https://negative-seven.github.io/tetris_explained/)):
levels 10–15 all level up at exactly 100 lines, because `H=1, T=0 → 16 > 15`.

**Applying it to a level-28 start (lines = 0, level = 28):**

- `H = 0`: max is `T = 9` → 9. Never > 28.
- `H = 1`: max is `16 + 9 = 25`. Never > 28. **Lines 100–190 do not level you up.**
- `H = 2, T = 0`: `32 > 28` ✓ → **the level ticks to 29 at 200 lines.**

(The `max(100, 10L − 50)` shorthand would predict 230; it is an approximation fitted to start levels ≤ 25
and is wrong here. The BCD derivation above is what the ROM does.)

After that first tick, every subsequent multiple of 10 raises the level again: 210 → 30, 220 → 31, …

### So what does "beating level 28" mean?

Authentically: **survive 200 lines at 2 frames per cell, at which point the game hands you the kill
screen.**

Budget that honestly before shipping it as a win condition:

- 200 lines = **500 pieces minimum** (2000 cells ÷ 4).
- At ~0.8 s per piece that is **~6.5–7 minutes of flawless level-28 play**, with one input opportunity on
  the bottom row and DAS that cannot reach the walls once the stack is 15 high.
- Real humans do this only with rolling or hypertapping, and the world's best treat a level-19 *start* as
  the hard tournament setting ([CTWC](https://en.wikipedia.org/wiki/Classic_Tetris_World_Championship)).

**Recommendation for the minigame:** keep every authentic timing, but set the win at **30 lines** (≈75
pieces, ≈1 minute) or **a score target near 100,000** (three tetrises plus change at ×29). Display
`LINES 000 / 030` so the goal is legible. Then offer the authentic 200-line run as an optional "true
ending" and let the level actually roll to 29 — that moment (gravity halving, palette switching from blue
to orange) is a great final beat and it is free: you have already implemented it.

---

## 5. Colours — level 28 uses palette 8

Palettes cycle every 10 levels via `updatePaletteForLevel`, which computes `levelNumber mod 10` by
repeated subtraction of 10, multiplies by 4, and copies 4 bytes into background palette 2 and sprite
palette 2. The table, verbatim, with the disassembly's own comment:

```
; 4 bytes per level (bg, fg, c3, c4)
colorTable:
        .dbyt   $0F30,$2112,  $0F30,$291A
        .dbyt   $0F30,$2414,  $0F30,$2A12
        .dbyt   $0F30,$2B15,  $0F30,$222B
        .dbyt   $0F30,$0016,  $0F30,$0513
        .dbyt   $0F30,$1612,  $0F30,$2716
```
— [main.asm `colorTable`](https://github.com/CelestialAmber/TetrisNESDisasm/blob/master/main.asm),
the same 10 entries listed at ROM `$984C` by [meatfighter](https://meatfighter.com/nintendotetrisai/).

**28 mod 10 = 8 → entry 8 → `0F 30 16 12`.** Every byte is an index into the NES 2C02 palette; using the
standard, most-reproduced RGB approximation of that palette
([lospec NES palette](https://lospec.com/palette-list/nintendo-entertainment-system) — the NES has no true
RGB output, so any hex is an approximation: [nesdev PPU palettes](https://www.nesdev.org/wiki/PPU_palettes)):

### Level 28 palette

| Role | NES index | Hex | Description |
|---|---|---|---|
| background | `$0F` | `#000000` | black |
| white / "fg" | `$30` | `#FCFCFC` | white |
| colour A (c3) | `$16` | `#F83800` | vivid red-orange |
| colour B (c4) | `$12` | `#0058F8` | strong blue |

**Level 28 is the red-and-blue level.** Two piece shades plus white, exactly as asked.

### Which pieces get which colour

From `orientationTable`'s per-mino tile bytes, and `constants.asm` (`tile1 = $7B, tile2 = $7C, tile3 = $7D`):

| Tile | Pieces | Palette slot | Level-28 hex |
|---|---|---|---|
| `tile1` | **T, O, I** | entry 1 (white) | `#FCFCFC` |
| `tile2` | **Z, L** | entry 2 (c3) | `#F83800` |
| `tile3` | **J, S** | entry 3 (c4) | `#0058F8` |

(The tile → palette-slot assignment follows the CHR pattern indices 1/2/3 against the 4-byte background
palette the code writes; the piece → tile mapping is verbatim from `orientationTable`, and meatfighter
lists the same bytes: "T: $7B, J: $7D, Z: $7C, O: $7B, S: $7D, L: $7C, I: $7B".)

Block rendering: two of the three block graphics are a solid colour square with a small white highlight
notch in the upper-left; the third (`tile1`) is a solid white square with a dark outline. All at 8×8 NES
pixels. If your platformer uses 32 px tiles, an 8× scale of the NES block is far too big for a 10×20 well
on a phone — use a 16–24 px cell for the Tetris well and draw the highlight as a 2 px inner L so it
survives the downscale.

### Neighbours, for the level-29 reveal and any level-27 tease

| Level | mod 10 | Bytes | c3 | c4 |
|---|---|---|---|---|
| 26 | 6 | `0F 30 00 16` | `$00` `#7C7C7C` grey | `$16` `#F83800` red |
| 27 | 7 | `0F 30 05 13` | `$05` `#A80020` crimson | `$13` `#6844FC` violet |
| **28** | **8** | **`0F 30 16 12`** | **`#F83800` red** | **`#0058F8` blue** |
| 29 | 9 | `0F 30 27 16` | `$27` `#FCA044` orange | `$16` `#F83800` red |
| 30 | 0 | `0F 30 21 12` | `$21` `#3CBCFC` cyan | `$12` `#0058F8` blue |

Rolling from 28 to 29 visibly swaps blue → orange while keeping the red. That is your "you broke it"
visual cue, and it costs one array lookup.

Above level 138 the real ROM's modulo fails and it reads arbitrary bytes as colours — the celebrated
glitch palettes ([meatfighter](https://meatfighter.com/nintendotetrisai/)). Not needed here, but a fun
easter egg if a player somehow keeps going.

---

## 6. Sound

### A correctness warning about "the Type A theme"

**Korobeiniki is not in Nintendo's NES Tetris.** It is the **Game Boy** Tetris "A-Type" theme, arranged by
Hirokazu Tanaka in 1989 ([Wikipedia: Korobeiniki](https://en.wikipedia.org/wiki/Korobeiniki)). The NES
cart's three options are:

| Slot | Tune | Based on |
|---|---|---|
| Music 1 | arranged by Tanaka | **"Dance of the Sugar Plum Fairy"**, Tchaikovsky |
| Music 2 | Tanaka, original | "traditional Russian sound" |
| Music 3 | Tanaka, original | mellow; also Nintendo's phone hold music |

plus "Success!" (line-clear fanfare), a Bizet *Toréador Song* victory cue, and a high-score theme
([VGMPF: Tetris (NES)](https://vgmpf.com/Wiki/index.php/Tetris_(NES))).

For a minigame, Korobeiniki is still the right call — it is what players *mean* by the Tetris theme, and
the folk melody itself is public domain: an 1861 Nekrasov poem, popularised by the Prigozhy and
Chernyavsky arrangements of 1898 ([Wikipedia](https://en.wikipedia.org/wiki/Korobeiniki)).
**Caveat worth knowing: The Tetris Company holds a sound trademark on the specific game arrangement and
has required its inclusion in official versions since 2002** (same source) — so synthesise the folk melody
yourself from the notes below rather than sampling or transcribing a Nintendo arrangement.

### The melody, with durations, ready to synthesise

Sourced version with explicit rhythm — the widely-published RTTTL (Nokia ringtone) transcription:

```
tetris:d=4,o=5,b=160:e6,8b,8c6,8d6,16e6,16d6,8c6,8b,a,8a,8c6,e6,8d6,8c6,b,8b,8c6,
d6,e6,c6,a,2a,8p,d6,8f6,a6,8g6,8f6,e6,8e6,8c6,e6,8d6,8c6,b,8b,8c6,d6,e6,c6,a,a
```
— [arcadetones Tetris ringtone](http://arcadetones.emuunlim.com/other/tetris.html).
`d=4` default quarter, `o=5` default octave, `b=160` → **160 BPM, 4/4**.

RTTTL octaves run one higher than scientific pitch for this tune, so **subtract one octave**: `e6 → E5`.
Written out in bars of 4/4 at 160 BPM (quarter = 375 ms, eighth = 187.5 ms):

**Section A (8 bars, E minor)**

| Bar | Notes (duration · pitch) |
|---|---|
| 1 | quarter E5 · 8th B4 · 8th C5 · quarter D5 · 16th E5 · 16th D5 · 8th C5 · 8th B4 |
| 2 | quarter A4 · 8th A4 · 8th C5 · quarter E5 · 8th D5 · 8th C5 |
| 3 | quarter B4 · 8th B4 · 8th C5 · quarter D5 · quarter E5 |
| 4 | quarter C5 · quarter A4 · half A4 |
| 5 | 8th rest · quarter D5 · 8th F5 · quarter A5 · 8th G5 · 8th F5 |
| 6 | quarter E5 · 8th E5 · 8th C5 · quarter E5 · 8th D5 · 8th C5 |
| 7 | quarter B4 · 8th B4 · 8th C5 · quarter D5 · quarter E5 |
| 8 | quarter C5 · quarter A4 · half A4 |

(Every bar sums to eight eighths; bar 8's final A4 is a half note so the loop lands on the downbeat.)

**Section B (8 bars, all half notes — the slow, low answer)**

`E5 C5 | D5 B4 | C5 A4 | G#4 B4 | E5 C5 | D5 B4 | C5 E5 | A5 G#5`

— pitch sequence from the [piano-keyboard-guide tutorial](https://www.piano-keyboard-guide.com/how-to-play-the-tetris-theme-song-easy-piano-tutorial-korobeiniki/)
("E C D B C A Ab B / E C D B C E A Ab"); the [kalimba tab](https://www.kalimbatabs.net/kalimba-tabs-tutorials/tetris-theme-korobeiniki/)
gives the same A-section contour plus the bass/bridge figure `A F | G E | F D | C E | A F | G E | F A C B`,
useful as your second voice.

**Frequencies** (A4 = 440 Hz, equal temperament) for a lookup table:

```
G#4 415.30 | A4 440.00 | B4 493.88 | C5 523.25 | D5 587.33 | E5 659.25
F5  698.46 | G5 783.99 | G#5 830.61 | A5 880.00 | C6 1046.50
```

**Arrangement notes.** The NES APU gives you two pulse channels, a triangle, noise and DPCM
([Ricoh 2A03](https://en.wikipedia.org/wiki/Ricoh_2A03)); Tanaka's driver uses SQ1 for melody, SQ2 for a
counter-melody/harmony and the triangle for bass, per the disassembly's `music_music2_sq1Routine*`,
`sq2Routine*`, `triRoutine*`, `noiseRoutine*` structure. With WebAudio: melody on a `square` oscillator
(which is exactly the 50% duty the SFX use), a second `square` a third or sixth below, bass on `triangle`,
and a short noise burst for percussion. Keep each voice's gain around 0.08–0.12 or three squares will clip.

**Tempo acceleration — a mechanic, not a flourish.** `updateMusicSpeed` (called on every lock and every
line update) scans **playfield row 5** for any non-empty cell. If one is found it sets `allegro` and
switches to the `+4` entry in `musicSelectionTable` (the "Fast" variant); if row 5 is clear again it
switches back. So: **the music jumps to its fast version the moment the stack reaches 15 rows high, and
drops back when you dig out.** VGMPF lists all three tracks with a "Fast" twin and notes that "in-game
tracks accelerate when the play field nearly fills"
([VGMPF](https://vgmpf.com/Wiki/index.php/Tetris_(NES))); Korobeiniki's accelerating performance is the
folk original's own tradition ([Wikipedia](https://en.wikipedia.org/wiki/Korobeiniki)). Implement it as a
~1.25× playback-rate switch on the same loop — the cheapest tension mechanic you will ever add.

### Sound effects — exact IDs, registers and what they sound like

The engine has four SFX slots mapped to APU channels; a slot's `Init` byte selects a routine (1-based into
these tables). From `soundEffectSlot*Init_table`:

| Slot | Channel | ID → effect |
|---|---|---|
| 0 | noise | 2 = **game-over curtain**, 3 = ending rocket |
| 1 | pulse 1 (SQ1) | 1 menu option · 2 menu screen · **3 shift** · **4 tetris** · **5 rotate** · **6 level-up** · **7 lock** · 8 chirp-chirp · **9 tetris-flash blip** · **10 line completed** |
| 2 | pulse 2 | 2 low buzz, 3 medium buzz (unused) |
| 3 | triangle | 1 falling alien, 2 donk |

Each `Init` writes 4 raw bytes to the channel registers (for SQ1: `$4000` vol/duty, `$4001` sweep, `$4002`
timer low, `$4003` length + timer high) and runs for a given number of frames. The data, verbatim, decoded
— pitches from `f = 1789773 / (16·(t+1))`:

| Effect | Trigger in code | Bytes | Decoded | Sounds like |
|---|---|---|---|---|
| **Shift** (move L/R) | `shift_tetrimino`, every successful shift | `98 7F 80 38`, 2 frames | 50% duty, vol 8, t=128 → **867 Hz (≈A5)**, no sweep | a dry 33 ms **tick**. Fires on *every* DAS repeat — at 6 frames apart it becomes a machine-gun rattle, a huge part of the NES Tetris signature |
| **Rotate** | `rotate_tetrimino`, A or B when valid | `9E 7F C0 28` then `B2 7F C0 08`, 4 frames | 50% duty, vol 14 → **580 Hz (≈D5)**, then a vol-2 tail | a bright short **"boop"** with a quiet decay |
| **Lock** | end of `checkForCompletedRows` when `completedLines == 0` | `9F 84 FF 0B`, 15 frames | 50% duty, vol 15, t=1023 → **109 Hz**, sweep **enabled, downward**, shift 4 | a low descending **"thunk"**, ~250 ms |
| **Line completed** | once per completed row found | `9C 9A A0 09`, ~5 frames, retriggered | 50% duty, vol 12, t=416 → **268 Hz**, sweep **up**, shift 2 | a short **rising blip**; 1–4 in quick succession make the familiar ladder |
| **Tetris** | `completedLines == 4` | `9E 9D C0 08`, retriggered | 50% duty, vol 14, t=192 → **580 Hz**, sweep **up**, shift 5 (fast) | the big ascending **"bwoop"** fanfare |
| **Tetris flash blip** | render path, every 8 frames during the 4-line flash | `9E 7F 69 08` | vol 14, t=105 → **1055 Hz (≈C6)**, timer offset by a counter | high **strobe pings** riding the white flash |
| **Level up** | on every `levelNumber++` | `DE 7F A8 18`, 6 frames, plus the pitch list `69 A8 69 A8 8D 53 8D 53` | 25% duty, vol 14; timers → **C6, E5, C6, E5, G5, E6, G5, E6** | a fast 8-step **two-note arpeggio** climbing — the sound of hitting 29 |
| **Game over** | `playState_lockTetrimino` when the lock is invalid | `1F 7F 0F C0`, **64 frames**, modulated by `noiselo_table` / `noisevol_table` | noise channel, vol 15, longest period; the volume table `BF FF EE … 11` decays monotonically | a ~1 s **white-noise crash that fades**, running under the descending curtain |

— all from [main.asm](https://github.com/CelestialAmber/TetrisNESDisasm/blob/master/main.asm)
(`soundEffectSlot1_*InitData`, `noiselo_table`, `noisevol_table`) and
[constants.asm](https://github.com/CelestialAmber/TetrisNESDisasm/blob/master/constants.asm)
(`SFX_TETRIS_INIT`, `SFX_LEVELUP_INIT`, …). Register semantics:
[2A03 sound hardware doc](http://bobrost.com/nes/files/nessound.txt).

WebAudio recipe for the ones you cannot skip:

```js
function blip({freq, ms, vol = 0.12, type = 'square', sweepTo = null}) {
  const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (sweepTo) o.frequency.exponentialRampToValueAtTime(sweepTo, t + ms / 1000);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
  o.connect(g).connect(master); o.start(t); o.stop(t + ms / 1000 + 0.01);
}
const sfx = {
  shift:  () => blip({freq: 867, ms: 33,  vol: 0.07}),
  rotate: () => blip({freq: 580, ms: 66,  vol: 0.11}),
  lock:   () => blip({freq: 109, ms: 250, vol: 0.14, sweepTo: 60}),
  line:   () => blip({freq: 268, ms: 90,  vol: 0.12, sweepTo: 520}),
  tetris: () => blip({freq: 580, ms: 400, vol: 0.14, sweepTo: 1600}),
  level:  () => [1046, 659, 1046, 659, 784, 1319, 784, 1319]
                  .forEach((f, i) => setTimeout(() => blip({freq: f, ms: 50}), i * 50)),
};
```

Game over: a 1 s buffer of white noise through a lowpass whose cutoff and gain both ramp down.

---

## 7. Is level 28 humanly possible, and what a touch version may concede

### Why 28 is possible at all and 29 is not

Three things, all quantified above:

1. **Gravity is 2 frames/cell and DAS repeats every 6.** A piece needs at most 5 shifts to reach either
   wall from column 5. With DAS carried in fully charged through the entry delay, 5 shifts take 24 frames
   = 12 rows of fall — available whenever the stack is below 12 high. At level 29 (1 frame/cell) the same
   5 shifts need 24 rows of fall, which do not exist. That is the whole kill screen.
2. **DAS charges through ARE and stays full against a wall.** The preparation window (10–18 frames of
   entry delay, 27–38 after a clear) is where level-28 play actually happens: you decide, charge, and
   arrive pre-aimed. ([harddrop](https://harddrop.com/wiki/Tetris_(NES,_Nintendo)))
3. **Hypertapping (~12–15 Hz) and rolling (20+ Hz) beat DAS outright**, at 4–5 and 2–3 frames per shift.
   Rolling is what turned 29+ from impossible into merely brutal, and it is why a human beat the game in
   2023 ([GIGAZINE](https://gigazine.net/gsc_news/en/20210427-nes-tetris-rolling/),
   [Tom's Hardware](https://www.tomshardware.com/video-games/retro-gaming/tetris-was-finally-beaten-after-34-years-game-kill-screen-pops-up-at-level-157-hypertapping-and-rolling-were-key-techniques)).

The other quiet difficulty at 28: **the bottom-row window is 2 frames.** One tuck, one spin, then it locks.
And **no hard drop** means every piece costs its full fall time, so a level-28 run is also an endurance
test — 500 pieces for the authentic 200 lines.

### The one thing you must not concede

**Keep 2 frames per cell.** That is the identity of level 28. Everything else on this list is negotiable;
gravity is not. Soften gravity and you have made a different game, and the player will feel it.

### Concessions that keep the gravity honest

Ranked by help gained per unit of authenticity lost:

1. **Faster DAS.** Charge 10 frames, repeat 3 (instead of 16/6). Doubles horizontal speed without touching
   gravity — a full-width traverse becomes 5 × 3 = 15 frames = 7 rows of fall. It is exactly the rolling
   advantage, handed to the player for free. Do this before anything else, and keep the
   charge-through-ARE rule; that rule is what makes the input *feel* like NES Tetris.
2. **Hard drop.** Non-authentic (NES has none — [tetris.wiki](https://tetris.wiki/Tetris_(NES,_Nintendo)))
   but on a touch screen it is the difference between playable and not: it removes the dead fall time,
   roughly halving the per-piece cycle and therefore the run length. Award the classic 2 points/row so it
   is also the scoring-optimal play.
3. **Big tap zones.** Minimum 48 × 48 CSS px per target, and put the drop control *away* from the movement
   controls — "keep the dedicated DROP button separated from the main movement controls to reduce
   accidental hard drops" is the standard advice, and mobile Tetris itself uses tap-to-rotate /
   drag-to-move / swipe-down-to-hard-drop
   ([Tetris Mobile help centre](https://playstudios.helpshift.com/hc/en/16-tetris-mobile/faq/2944-tetris-controls/)).
4. **A short lock delay on touch only** — say 8 frames instead of 2, reset on a successful move, capped at
   2 resets. At 2 frames a touch player cannot land a tuck at all. This removes the most unfair deaths; it
   is also the most visible deviation, so gate it behind the difficulty setting.
5. **Bigger next-preview, optional faint ghost.** Cheap, and it compensates for a phone showing the board
   at half a CRT's apparent size. Keep a switch to turn both off.

Concessions to **refuse**: hold queue, 7-bag randomizer, SRS with wall kicks, infinite lock-delay resets.
Each changes the *strategy* rather than the *input difficulty*, and the NES randomizer's I-droughts plus
the no-kick NRS are most of what makes NES stacking feel like NES stacking.

### Recommended control schemes

**Keyboard (authentic-first, the desktop default)**

| Key | Action | Notes |
|---|---|---|
| ← / → | shift | authentic 16-frame charge, 6-frame repeat; charge persists through ARE |
| Z | rotate CCW | NES "B" |
| X or ↑ | rotate CW | NES "A" |
| ↓ | soft drop | ½G, 3-frame lead-in, blocked while ← / → held, points reset on release |
| Space | hard drop | **off in Authentic mode**, on in Fair mode; 2 pts/row |
| Shift | hold | never — there is no hold |
| Esc / P | pause | pause the accumulator, not just the render |

Expose the DAS numbers in a settings panel (`16/6` authentic, `10/3` fair). Classic-Tetris players will
look for it, and it costs two variables.

**Touch (fair-but-brutal)**

Layout: the well centred and as tall as the viewport allows; a full-width invisible gesture layer over the
well; two large fixed buttons in the bottom corners.

| Gesture / control | Action |
|---|---|
| Drag horizontally anywhere over the well | move — **1 column per cell-width of finger travel**, position-based, not velocity-based. This is the touch equivalent of rolling: the finger *is* the piece's column, so multi-column moves are instant and the player can pre-position during ARE. |
| Tap left half | rotate CCW |
| Tap right half | rotate CW |
| Swipe down fast (> 400 px/s) | hard drop |
| Drag down slowly and hold | soft drop, ½G |
| Bottom-left button (≥ 64 px) | rotate CW (redundant, for players who prefer buttons) |
| Bottom-right button (≥ 64 px) | hard drop |

Why position-based dragging rather than swipe-to-step: at 2 frames/cell a stepped swipe cannot reliably
issue five discrete moves in 38 frames, and any velocity-based scheme makes the final column a lottery.
Absolute finger → column mapping removes the entire DAS problem on touch **while leaving gravity
untouched** — exactly the trade you want. Standard mobile Tetris already uses drag-to-move plus
tap-to-rotate plus swipe-down-to-drop, so it will not feel alien
([Tetris Mobile help centre](https://playstudios.helpshift.com/hc/en/16-tetris-mobile/faq/2944-tetris-controls/)).

Ship two difficulties and label them honestly:

- **AUTHENTIC 28** — 16/6 DAS, no hard drop, 2-frame lock window, 200 lines to win. For the one player who
  wants it.
- **RAGE 28** — 10/3 DAS (or drag), hard drop, 8-frame lock with 2 resets, 30 lines to win. Still 2 frames
  per cell, still no hold, still the NES randomizer. This is the one 95% of players will finish, and it
  will still be the hardest thing in the platformer.

---

## 8. Constants block, copy-paste

```js
export const NES = {
  FPS: 60.0988,
  COLS: 10, ROWS_VISIBLE: 20, ROWS_TOTAL: 22,
  SPAWN_X: 5, SPAWN_Y: 0,

  FRAMES_PER_CELL: [48,43,38,33,28,23,18,13,8,6,5,5,5,4,4,4,3,3,3,2,2,2,2,2,2,2,2,2,2],
  gravity: lvl => lvl >= 29 ? 1 : NES.FRAMES_PER_CELL[lvl],

  DAS_CHARGE: 16, DAS_RESET_TO: 10,   // repeat = 16 - 10 = 6 frames
  SOFT_DROP_LEAD: 3, SOFT_DROP_PERIOD: 2,
  LOCK_DELAY: 0,                      // none; you get gravity(level) frames on the floor
  ARE: r => Math.min(18, 10 + 2 * Math.ceil(Math.max(0, 18 - r) / 4)),
  CLEAR_STEPS: 5, CLEAR_STEP_FRAMES: 4,   // 17-20 frames total, centre-outward
  CURTAIN_LEAD: 16, CURTAIN_STEP_FRAMES: 4, CURTAIN_ROWS: 20,

  POINTS: [0, 40, 100, 300, 1200],    // x (level + 1)
  SCORE_CAP: 999999,
  MUSIC_ALLEGRO_ROW: 5,               // any block in row 5 -> switch to the fast track

  // level 28 == palette 8 == 0F 30 16 12
  PALETTE_28: { bg: '#000000', white: '#FCFCFC', c3: '#F83800', c4: '#0058F8' },
  PIECE_COLOUR: { T: 'white', O: 'white', I: 'white', Z: 'c3', L: 'c3', J: 'c4', S: 'c4' },

  SPAWN: {                            // (dx, dy) from origin, NES spawn orientations
    T: [[-1,0],[0,0],[1,0],[0,1]],
    J: [[-1,0],[0,0],[1,0],[1,1]],
    Z: [[-1,0],[0,0],[0,1],[1,1]],
    O: [[-1,0],[0,0],[-1,1],[0,1]],
    S: [[0,0],[1,0],[-1,1],[0,1]],
    L: [[-1,0],[0,0],[1,0],[-1,1]],
    I: [[-2,0],[-1,0],[0,0],[1,0]],
  },
  ROT_STATES: { T: 4, J: 4, L: 4, S: 2, Z: 2, I: 2, O: 1 },   // no wall kicks, ever

  START_LEVEL: 28,
  LINES_TO_29: 200,                   // first multiple of 10 where 16*H + T > 28
};
```

---

## Sources

- [CelestialAmber/TetrisNESDisasm — `main.asm`](https://github.com/CelestialAmber/TetrisNESDisasm/blob/master/main.asm) — primary: `framesPerDropTable`, `shift_tetrimino`, `drop_tetrimino`, `rotate_tetrimino`, `rotationTable`, `orientationTable`, `spawnTable`, `pickRandomTetrimino`, `playState_spawnNextTetrimino`, `playState_lockTetrimino`, `playState_checkForCompletedRows`, `playState_updateLinesAndStatistics`, `pointsTable`, `updateLineClearingAnimation`, `copyPlayfieldRowToVRAM`, `updatePaletteForLevel`, `colorTable`, `updateMusicSpeed`, `soundEffectSlot*Init_table`, all `*InitData`, `noiselo_table`, `noisevol_table`
- [CelestialAmber/TetrisNESDisasm — `constants.asm`](https://github.com/CelestialAmber/TetrisNESDisasm/blob/master/constants.asm) — `DAS_DELAY` / `DAS_RESET` (NTSC + PAL), `SFX_*_INIT`, tile and orientation IDs
- [tetris.wiki — Tetris (NES, Nintendo)](https://tetris.wiki/Tetris_(NES,_Nintendo)) — gravity table, DAS, ARE range, line-clear delay, NRS, no lock delay / kick / hard drop
- [tetris.wiki — Tetris (NES)](https://tetris.wiki/Tetris_(NES)) — gravity table, level-advance formula
- [Hard Drop wiki — Tetris (NES, Nintendo)](https://harddrop.com/wiki/Tetris_(NES,_Nintendo)) — DAS counter reset-to-10, DAS during ARE, DAS full against a wall, ARE by lock height, ½G soft drop
- [Hard Drop wiki — Scoring](https://harddrop.com/wiki/Scoring) — 40/100/300/1200 × (level+1), soft-drop points
- [meatfighter — Applying AI to Nintendo Tetris](https://meatfighter.com/nintendotetrisai/) — LFSR, re-roll rule and measured piece probabilities, 22×10 playfield with 2 hidden rows, spawn at (5,0), top-out condition, `$984C` palette table, `$898E` drop table, 999999 cap, level-up BCD bug
- [negative-seven — NES Tetris bugs and mechanics explained](https://negative-seven.github.io/tetris_explained/) — soft-drop frame rule, hold-down scoring bugs, level-up encoding bugs, max horizontal speed
- [gridbugs — Reverse-engineering NES Tetris to add hard drop](https://www.gridbugs.org/reverse-engineering-nes-tetris-to-add-hard-drop/) — no hard drop in the original; RAM addresses
- [Wikipedia — Tetris (NES video game)](https://en.wikipedia.org/wiki/Tetris_(NES_video_game)) — speed increases only at 1–10 / 13 / 16 / 19 / 29; kill screen; 10 cycling palettes
- [GIGAZINE — rolling](https://gigazine.net/gsc_news/en/20210427-nes-tetris-rolling/) and [Tom's Hardware — Tetris beaten at level 157](https://www.tomshardware.com/video-games/retro-gaming/tetris-was-finally-beaten-after-34-years-game-kill-screen-pops-up-at-level-157-hypertapping-and-rolling-were-key-techniques) — hypertapping and rolling rates
- [Tetris Interest — Blue Scuti](https://tetrisinterest.com/blue-scuti-became-the-first-person-to-beat-nes-tetris/) and [Kotaku](https://kotaku.com/twitch-youtube-blue-scuti-tetris-kill-screen-nes-1851134043) and [Video Game Canon](https://www.videogamecanon.com/adventurelog/blue-scuti-tetris/) — why 29 is the killscreen; the 2023 crash at level 157 after 1,511 lines
- [Tetris Wiki (Fandom) — Tetris (NES, Nintendo)](https://tetris.fandom.com/wiki/Tetris_(NES,_Nintendo)) — hypertapping description
- [simon.lc — What is DAS and hyper tapping](https://simon.lc/what-is-das-and-hyper-tapping-in-tetris)
- [lospec — NES palette](https://lospec.com/palette-list/nintendo-entertainment-system) and [nesdev — PPU palettes](https://www.nesdev.org/wiki/PPU_palettes) — hex approximations for `$0F $30 $16 $12` and friends
- [Wikipedia — Korobeiniki](https://en.wikipedia.org/wiki/Korobeiniki) — 1861 Nekrasov poem, 1898 arrangements, public domain, Tanaka's Game Boy A-Type, Tetris Company sound trademark, accelerating performance tradition
- [VGMPF — Tetris (NES)](https://vgmpf.com/Wiki/index.php/Tetris_(NES)) — the actual NES track list (Sugar Plum Fairy plus two Tanaka originals, each with a "Fast" twin), Bizet victory cue
- [arcadetones — Tetris RTTTL](http://arcadetones.emuunlim.com/other/tetris.html) — melody with durations, 160 BPM
- [piano-keyboard-guide — Korobeiniki](https://www.piano-keyboard-guide.com/how-to-play-the-tetris-theme-song-easy-piano-tutorial-korobeiniki/) and [kalimbatabs — Tetris theme](https://www.kalimbatabs.net/kalimba-tabs-tutorials/tetris-theme-korobeiniki/) — A and B section pitch sequences
- [Ricoh 2A03 (Wikipedia)](https://en.wikipedia.org/wiki/Ricoh_2A03) and [2A03 sound hardware doc](http://bobrost.com/nes/files/nessound.txt) — channels and register semantics
- [Tetris Mobile help centre — controls](https://playstudios.helpshift.com/hc/en/16-tetris-mobile/faq/2944-tetris-controls/) — touch conventions
- [Classic Tetris World Championship (Wikipedia)](https://en.wikipedia.org/wiki/Classic_Tetris_World_Championship) — tournament context for level-19 starts
