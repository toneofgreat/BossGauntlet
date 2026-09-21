# Mobile-Friendly 2D Platformer Game Feel & Canvas Visual Polish

Research notes for a 2D side-scrolling canvas platformer: 32 px tiles, fixed 60 Hz simulation,
jump-and-run player, spikes, moving / falling / fake platforms, springs & launchers, switches,
enemies, coins. Every factual claim carries its source URL. Numbers marked **[derived]** are
computed here from a cited formula, not quoted from a source.

---

## 0. Drop-in parameter block (read this first, justifications follow)

All values are for **TILE = 32 px**, a **fixed 60 Hz** simulation step (`dt = 1/60 s`), and a
**3-tile (96 px) maximum jump height**. Both unit systems are given: pixels-per-second (use with
`dt`) and pixels-per-frame (use if you step once per fixed tick).

```js
// ---- world ----------------------------------------------------------------
const TILE = 32;
const DT   = 1 / 60;              // fixed step; accumulate and step, never use raw rAF delta
const PLAYER_W = 20, PLAYER_H = 28;   // hitbox, inset inside the 32px tile grid

// ---- jump (3 tiles high, 21 frames to apex) --------------------------------
const JUMP_H   = 3 * TILE;        // 96 px
const T_APEX   = 0.35;            // s  -> 21 frames (snappy band is 0.30-0.45 s)
const JUMP_V   = 576.0;           // px/s  = 9.60 px/frame   (timestep-corrected, see 1.2)
const G_RISE   = 1645.7;          // px/s^2 = 0.4571 px/frame^2
const G_FALL   = 2.00 * G_RISE;   // 3291.4 px/s^2 = 0.9143 px/frame^2
const G_APEX   = 0.50 * G_RISE;   // while |vy| < APEX_BAND  (Celeste "half gravity")
const G_CUT    = 2.00 * G_RISE;   // after an early jump-button release
const APEX_BAND    = 200;         // px/s  (~0.38 * JUMP_V, the Celeste ratio)
const CUT_FACTOR   = 0.60;        // vy *= 0.60 on release -> min hop 34.6 px = 1.08 tiles
const MAX_FALL     = 780;         // px/s = 13 px/frame  (terminal velocity)
const FAST_FALL    = 1080;        // px/s = 18 px/frame  (holding down)

// ---- run ------------------------------------------------------------------
const MAX_RUN      = 280;         // px/s = 4.667 px/frame = 8.75 tiles/s
const RUN_ACCEL    = 2800;        // px/s^2 -> 0.10 s (6 frames) to top speed
const RUN_DECEL    = 3600;        // px/s^2 -> 0.078 s (5 frames) to a stop
const TURN_MULT    = 1.8;         // accel multiplier when input opposes velocity
const AIR_MULT     = 0.65;        // Celeste's air-control multiplier (accel); use 0.45 for decel
const APEX_SPEED_MULT = 1.10;     // max run while inside APEX_BAND
const APEX_ACCEL_MULT = 1.15;     // accel while inside APEX_BAND
const JUMP_H_BOOST = 112;         // px/s added in the held direction at takeoff (0.4 * MAX_RUN)

// ---- forgiveness ----------------------------------------------------------
const COYOTE_TIME   = 0.100;      // s = 6 frames
const JUMP_BUFFER   = 0.133;      // s = 8 frames
const CORNER_UP     = 6;          // px of head-bonk nudge (~30% of PLAYER_W)
const CORNER_SIDE   = 4;          // px of horizontal step-around nudge
const CEIL_VARJUMP_GRACE = 0.05;  // s: keep the variable-jump window alive after a ceiling bonk

// ---- launchers ------------------------------------------------------------
const SPRING_SMALL = 1.41 * JUMP_V;  // 6 tiles  (height scales with v^2)
const SPRING_BIG   = 1.73 * JUMP_V;  // 9 tiles
const SPRING_NOCUT = 0.10;           // s during which the player cannot cut the boost

// ---- feel / feedback ------------------------------------------------------
const HITSTOP_LIGHT = 3;          // frames (50 ms)  coin, switch
const HITSTOP_HEAVY = 6;          // frames (100 ms) enemy stomp, spring
const HITSTOP_DEATH = 10;         // frames (166 ms) death
const SHAKE_MAX_PX  = 14;         // offset = SHAKE_MAX_PX * trauma^2
const SHAKE_DECAY   = 1.8;        // trauma units per second
const CAM_DEADZONE  = { w: 3 * TILE, h: 2 * TILE };
const CAM_LOOKAHEAD = 0.25;       // s of velocity projected ahead, clamped to +/- 3 tiles
const CAM_K         = 9;          // exponential smoothing rate, 1/s
```

**Airtime and gap budget [derived]** from the numbers above: rise 0.350 s, fall
`sqrt(2*96/3291.4) = 0.2415 s`, total airtime **0.5975 s (36 frames)**. At `MAX_RUN = 280 px/s`
a full-speed jump covers **167 px, about 5.2 tiles**. Design comfortable gaps at 3-4 tiles,
"you must be running" gaps at 5 tiles, and never 6.

---

## 1. Platformer controller feel

### 1.1 The jump equation: design in height and time, not in force

The canonical reference is J. Kyle Pittman's GDC 2016 talk *Math for Game Programmers: Building a
Better Jump* (GDC Vault: https://gdcvault.com/play/1023559/Math-for-Game-Programmers-Building ;
video: https://www.youtube.com/watch?v=hG9SzQxaCm8 ; slides:
http://www.mathforgameprogrammers.com/gdc2016/GDC2016_Pittman_Kyle_BuildingABetterJump.pdf ).
The talk's thesis is that you should let designers specify **desired jump height and either the
time or the horizontal distance to the apex**, and derive gravity and launch velocity from those,
rather than hand-tuning a force value
(https://gdcvault.com/play/1023559/Math-for-Game-Programmers-Building).

The two-parameter (height, time-to-apex) form:

```
g  = 2h / t^2
v0 = 2h / t          (equivalently v0 = g * t)
```

This is confirmed in the talk summary and in GDQuest's writeup of the same kinematics, which gives
`jump_speed = (-2.0 * height) / time_to_peak` and
`jump_gravity = (2.0 * height) / pow(time_to_peak, 2.0)`
(https://www.gdquest.com/library/kinematic_jump_formulas/), and again by an independent jump-arc
calculator that states `g = 2 x h / t^2` and `v = 2 x h / t`
(https://tools.puida.com/creative/gamedesign/jump-arc-calculator/).

Pittman's second, more designer-friendly form replaces time with **space**: foot speed `vx` and
the lateral distance to the peak `xh`, "allowing designers to think in spatial terms rather than
time values" (https://slidetodoc.com/building-a-better-jump-j-kyle-pittman-pirate/). Substituting
`t = xh / vx` into the equations above gives the widely quoted pair **[derived]**:

```
v0 = 2h * vx / xh
g  = 2h * vx^2 / xh^2
```

This is the form to use when your level grid is the design language: "3 tiles up while crossing
4 tiles" is a sentence a level designer can say, and it converts directly into constants.

GDQuest additionally gives the asymmetric-fall and distance forms
(https://www.gdquest.com/library/kinematic_jump_formulas/):

```
fall_gravity = (2.0 * height) / pow(time_to_descent, 2.0)
jump_h_speed = distance / (time_to_peak + time_to_descent)
```

**Integration.** Pittman recommends velocity Verlet, whose position update carries the
half-acceleration term (https://slidetodoc.com/building-a-better-jump-j-kyle-pittman-pirate/):

```
pos += vel*dt + 0.5*acc*dt*dt
new_acc = f(pos)
vel += 0.5*(acc + new_acc)*dt
acc = new_acc
```

and notes that when acceleration is constant the simplified variant
`pos += vel*dt + 0.5*acc*dt*dt; vel += acc*dt` is "100% accurate"
(https://slidetodoc.com/building-a-better-jump-j-kyle-pittman-pirate/). The same slides frame a
whole jump as "a series of parabolic arcs of different shapes" spliced together with continuous
velocity, which is exactly how variable jump height, fast-fall and double jump are implemented
(https://slidetodoc.com/building-a-better-jump-j-kyle-pittman-pirate/).

### 1.2 The timestep correction nobody applies (and you should)

If you use plain semi-implicit Euler (`vel += g*dt; pos += vel*dt`) with the textbook constants,
**your jump falls short of the requested height by half a frame of launch velocity**. The
jump-tuner project documents this precisely: after `n` steps the discrete position is
`y = n*dt*v0 - g*dt^2*n(n+1)/2`, which "sits exactly `(g*dt/2)*t` below the continuous parabola",
and at the apex that shortfall equals `v0*dt/2`, "half a frame of launch velocity, independent of
how small the jump is" (https://github.com/slippylabs/jump-tuner.slippylabs.com).

The corrected constants for velocity-first integration, from the same source, replace one apex
time with `(t - dt)`:

```
v0 = 2h / (t - dt)
g  = 2h / (t * (t - dt))
```

(https://github.com/slippylabs/jump-tuner.slippylabs.com). The source also notes that
position-first integration "picks up the opposite sign" of the same correction, and that the
corrected formulas were verified against 1,503 checks, hitting requested heights exactly when the
apex lands on a step boundary and "within one step of velocity" otherwise
(https://github.com/slippylabs/jump-tuner.slippylabs.com).

**Worked for this game [derived].** `h = 96 px`, `t = 0.35 s`, `dt = 1/60 s`:

```
v0 = 2*96 / (0.35 - 0.0166667) = 192 / 0.3333333 = 576.00 px/s = 9.600 px/frame
g  = 2*96 / (0.35 * 0.3333333) = 192 / 0.1166667 = 1645.71 px/s^2 = 0.45714 px/frame^2
```

Verification by hand **[derived]**: frames to apex `= 9.600 / 0.45714 = 21.0`; total rise
`= sum over k=1..21 of (9.600 - 0.45714k) = 201.60 - 105.60 = 96.00 px`. Exactly three tiles, on a
frame boundary. The uncorrected constants (`v0 = 9.143`, `g = 0.4354`) would have produced
**91.2 px** -- nearly 5 px short of the tile you told the designer they could reach, which is
precisely the class of bug that makes a "reachable" ledge occasionally unreachable.

**Always run the simulation on a fixed accumulator**, not on the raw `requestAnimationFrame`
delta, or the corrected constants become meaningless and 120 Hz phones jump differently from 60 Hz
phones. `requestAnimationFrame` callbacks are throttled or suspended in background tabs
(https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame), so the
accumulator must be clamped or a tab-switch will run hundreds of steps in one frame on resume:

```js
let acc = 0, last = performance.now();
function frame(now) {
  acc += Math.min(now - last, 100) / 1000;   // clamp the resume spike
  last = now;
  while (acc >= DT) { step(DT); acc -= DT; }
  render(acc / DT);                           // leftover becomes a render-only lerp alpha
  requestAnimationFrame(frame);
}
```

MDN also explicitly recommends `requestAnimationFrame` over `setInterval` for canvas animation
(https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas).

### 1.3 Asymmetric gravity, jump cut, apex hang

Three separate gravity values, all scaling off `G_RISE`:

**1. Fall gravity multiplier.** Falling faster than you rose is near-universal. The documented
typical range is **1.5-2.5x**, with "Super Mario uses ~2x, Celeste uses ~2.5x"
(https://tools.puida.com/creative/gamedesign/jump-arc-calculator/). Use **2.0x** as the default for
a 32 px game; 2.5x starts to feel like the player is being yanked down. The same source gives the
"good feel" time-to-apex band as **0.3-0.45 s**, "with anything longer feeling floaty"
(https://tools.puida.com/creative/gamedesign/jump-arc-calculator/) -- hence `T_APEX = 0.35`.

**2. Variable jump height (jump cut).** Two implementations, both shipped in famous games:

* **Velocity clamp on release.** On the frame the button goes up while `vy < 0`, do
  `vy *= CUT_FACTOR`. Because height scales with `v^2`, `CUT_FACTOR` directly sets the minimum hop:
  `h_min = JUMP_H * CUT_FACTOR^2` **[derived]**. For a 32 px-tile game the minimum hop must still
  clear one tile, so `CUT_FACTOR >= sqrt(32/96) = 0.577`; **0.60 gives a 34.6 px hop**, just over
  one tile **[derived]**. Encode that as an assertion: a tap that cannot clear a single block feels
  broken no matter how good everything else is.
* **Held-force window (Celeste's approach).** Celeste declares `VarJumpTime = .2f`: for up to 0.2 s
  after takeoff, holding jump keeps re-applying jump speed, and releasing simply stops re-applying
  it (https://raw.githubusercontent.com/NoelFB/Celeste/master/Source/Player/Player.cs,
  https://deepwiki.com/NoelFB/Celeste/2.3-player-movement-and-physics). This yields a continuum of
  heights rather than two, and is the better choice if you want mid-length hops.

Dawnosaur's widely used reference controller exposes the same idea as a third gravity band,
`jumpCutGravityMult`, "applied when jump button released mid-jump; increases descent speed"
(https://github.com/DawnosaurDev/platformer-movement/blob/main/Scripts/PlayerMovement.cs). Any of
the three is fine; pick one and do not mix.

**3. Apex hang / half gravity at the top.** Celeste's `HalfGravThreshold = 40f` reduces gravity
while vertical speed magnitude is under that threshold, "allowing more control at the apex and
enabling variable jump heights by releasing the jump button early"
(https://deepwiki.com/NoelFB/Celeste/2.3-player-movement-and-physics). The Celeste ratio is
`40 / 105 = 0.38` of jump speed
(https://raw.githubusercontent.com/NoelFB/Celeste/master/Source/Player/Player.cs), which for
`JUMP_V = 576` gives `APEX_BAND ~ 219 px/s` **[derived]**; round to 200. Dawnosaur names the same
idea `jumpHangGravityMult` + `jumpHangTimeThreshold`, described as making the jump "feel more
bouncy, responsive", and crucially pairs it with `jumpHangAccelerationMult` and
`jumpHangMaxSpeedMult` so the player also steers *faster* at the apex
(https://github.com/DawnosaurDev/platformer-movement/blob/main/Scripts/PlayerMovement.cs). The
horizontal half is the underrated one: it is what makes a long jump feel steerable.

```js
function gravityNow(p, holdJump, holdDown) {
  if (p.vy < 0 && !holdJump && !p.cutApplied) { p.vy *= CUT_FACTOR; p.cutApplied = true; }
  if (Math.abs(p.vy) < APEX_BAND && !holdDown) return G_APEX;
  if (p.vy < 0) return holdJump ? G_RISE : G_CUT;
  return holdDown ? G_FALL * 1.4 : G_FALL;
}
```

### 1.4 Terminal velocity and fast-fall

Celeste caps normal falling at `MaxFall = 160f` and fast-falling at `FastMaxFall = 240f`, ramping
into the fast cap with `FastMaxAccel = 300f`
(https://raw.githubusercontent.com/NoelFB/Celeste/master/Source/Player/Player.cs,
https://deepwiki.com/NoelFB/Celeste/2.3-player-movement-and-physics). The ramp is the detail worth
copying: snapping instantly to a higher cap reads as a glitch, ramping reads as a dive.

For this game **[derived]**: a full-height fall under `G_FALL` reaches
`sqrt(2 * 3291.4 * 96) = 795 px/s`, so setting `MAX_FALL = 780` means terminal velocity engages
only at the tail of a maximum drop and never during normal platforming. `FAST_FALL = 1080`
(18 px/frame) is the dive cap; ramp into it over ~0.15 s rather than snapping.

**Tunnelling guard.** 18 px/frame is under one 32 px tile, so a single-AABB sweep *happens* to be
safe -- but do not rely on that. Move in pixel steps (1.8) so that springs, moving platforms and
any faster hazard you add later cannot punch through a one-tile-thick floor.

### 1.5 Horizontal acceleration, deceleration, turning, air control

Celeste's ground numbers, for calibration:
`MaxRun = 90f`, `RunAccel = 1000f`, `RunReduce = 400f`, `AirMult = .65f`, `HoldingMaxRun = 70f`
(https://raw.githubusercontent.com/NoelFB/Celeste/master/Source/Player/Player.cs,
https://deepwiki.com/NoelFB/Celeste/2.3-player-movement-and-physics). Note the shape of it:
`RunAccel / MaxRun = 11.1 per second`, i.e. Madeline reaches top speed in **0.09 s** **[derived]**,
and `RunReduce` is the *smaller* number, used as "deceleration when above max speed"
(https://deepwiki.com/NoelFB/Celeste/2.3-player-movement-and-physics) -- overspeed from a dash or a
spring is bled off gently, not erased.

Celeste's world is 8 px tiles, so `MaxRun = 90 px/s` is **11.25 tiles/s** **[derived]**. Matching
that tile rate at 32 px would mean 360 px/s, which on a phone screen scrolls uncomfortably fast;
**280 px/s (8.75 tiles/s)** is the recommendation, with `RUN_ACCEL = 2800` preserving the
"top speed in ~0.1 s" snap **[derived]**.

`AirMult = .65f` applied to air movement is Celeste's air control
(https://raw.githubusercontent.com/NoelFB/Celeste/master/Source/Player/Player.cs); Dawnosaur splits
it into separate `accelInAir` and `deccelInAir` multipliers
(https://github.com/DawnosaurDev/platformer-movement/blob/main/Scripts/PlayerMovement.cs). Keeping
air *deceleration* lower than air *acceleration* (0.65 vs 0.45) preserves momentum through a jump,
which is what makes long gaps feel committed rather than mushy.

**Turn boost.** Multiply acceleration by ~1.8 when the input sign opposes the velocity sign.
Without it a full direction change costs `2 * MAX_RUN / RUN_ACCEL = 0.2 s` **[derived]**, long
enough for a player to feel the controls "stick" -- and on touch, where the player cannot feel a
stick return to centre, it is worse.

**Takeoff horizontal boost.** Celeste adds `JumpHBoost = 40f` on top of `MaxRun = 90f` when jumping
with a direction held
(https://raw.githubusercontent.com/NoelFB/Celeste/master/Source/Player/Player.cs) -- a 0.44 ratio,
hence `JUMP_H_BOOST = 112 px/s` here **[derived]**. It makes a running jump feel like a leap and
quietly extends the maximum gap.

The GMTK *Platformer Toolkit* is the best interactive way to build intuition for all of these: it
exposes "over 30 variables that drive the hero's movement, including max speed, jump height, squash
and stretch, coyote time", then lets you "play through a sample level with your chosen stats", with
Air Acceleration, Air Control, Air Brake, gravity, fall gravity multiplier and edge/corner
forgiveness among the panels (https://gmtk.itch.io/platformer-toolkit). Note that even its own
users complained the air variables were unexplained -- "On the Jump page, I had no idea what 'Air
Acceleration', 'Air Control' and 'Air Brake' meant" (https://gmtk.itch.io/platformer-toolkit) -- so
if you ship a debug slider panel (you should), label each slider with the unit and the effect.

### 1.6 Coyote time and jump buffering

**Coyote time** is "a brief period of time after running off a platform where the game will still
register the player pressing the jump button"
(https://gmtk.itch.io/platformer-toolkit/comments?after=71). The under-appreciated justification is
not generosity but latency: "There's always some delay between the player pressing buttons and the
result showing up on their screen, and it's very possible for a player to say 'That's BS, I totally
pressed the jump button before running off the cliff,' and be right because their image was delayed
from the game's logic" (https://gmtk.itch.io/platformer-toolkit/comments?after=71). On a phone --
touch digitiser latency, plus browser event dispatch, plus compositor -- that delay is larger than
on desktop, so **mobile needs coyote time more, not less**.

**Jump buffering** lets the player "input the jump button and still have successful execution" when
they press slightly before landing (https://gmtk.itch.io/platformer-toolkit/comments?after=71).

Concrete windows:

| Mechanic | Recommended | Evidence |
|---|---|---|
| Coyote time | 0.10 s (6 frames) | Celeste ships `JumpGraceTime = 0.1f` (https://raw.githubusercontent.com/NoelFB/Celeste/master/Source/Player/Player.cs); a survey source gives 5-8 frames and states "Celeste uses a 5-frame coyote window, and Super Meat Boy uses a similar duration" (https://www.gamejuice.co.uk/articles/coyote-time-input-buffering); calculator band 0.05-0.15 s (https://tools.puida.com/creative/gamedesign/jump-arc-calculator/) |
| Jump buffer | 0.133 s (8 frames) | "100 to 150 milliseconds ... about 6 to 9 frames at 60fps" (https://www.gamejuice.co.uk/articles/coyote-time-input-buffering); calculator band 0.1-0.2 s (https://tools.puida.com/creative/gamedesign/jump-arc-calculator/) |
| Ceiling variable-jump grace | 0.05 s | Celeste's `CeilingVarJumpGrace = .05f` (https://raw.githubusercontent.com/NoelFB/Celeste/master/Source/Player/Player.cs) |

Rules that prevent the classic bugs:

* **Zero the coyote timer the instant you jump**, or the player gets a free double jump. The
  toolkit's described implementation checks the counter against the coyote value "(usually something
  like 0.2)" and resets it on a successful jump
  (https://gmtk.itch.io/platformer-toolkit/comments?after=71).
* **Zero the buffer when it is consumed**, and only consume it while grounded-or-coyote.
* **The two coexist.** "A player who runs off an edge (triggering coyote time) and then presses jump
  slightly before they would have landed on the next platform (triggering input buffer) has both
  systems active simultaneously" (https://www.gamejuice.co.uk/articles/coyote-time-input-buffering).
* **Do not grant coyote time after a deliberate downward action** -- a fast-fall, a drop-through on
  a one-way platform, or a jump. Coyote time is for walking off ledges only.
* Keep coyote **shorter** than the buffer, as the survey source recommends (coyote 5-8 frames, buffer
  6-9) (https://www.gamejuice.co.uk/articles/coyote-time-input-buffering): a long coyote window reads
  as floating in air; a long buffer never reads as anything.

```js
// per fixed step
p.coyote = p.grounded ? COYOTE_TIME : Math.max(0, p.coyote - DT);
p.buffer = jumpPressedThisStep ? JUMP_BUFFER : Math.max(0, p.buffer - DT);
if (p.buffer > 0 && p.coyote > 0) {
  p.vy = -JUMP_V;
  if (inputX !== 0) p.vx += Math.sign(inputX) * JUMP_H_BOOST;
  p.buffer = 0; p.coyote = 0; p.cutApplied = false;
  sfx.jump(); squash(0.82, 1.18, 0.12);
}
```

### 1.7 Corner correction and ledge forgiveness

Corner correction is the mechanic players never notice and always feel. "If you bonk your head on a
corner, the game tries to wiggle you to the side around it"
(https://forum.godotengine.org/t/corner-correction-like-in-celeste/15784). In Celeste specifically,
"if you hit a block from below by just a pixel, your character will actually be moved sideways to
slide up the block as if you hadn't collided from the bottom, with no loss of speed", and "dashing
horizontally into a ledge or touching the ceiling within 4 pixels of a corner of a solid surface
causes Madeline to automatically be pushed around the corner rather than getting stopped by it"
(https://celeste.ink/wiki/Tech).

The constants are in the source: `UpwardCornerCorrection = 4`, `DashCornerCorrection = 4`,
`DuckCorrectCheck = 4`, `WallJumpCheckDist = 3`, `DashVFloorSnapDist = 3`
(https://raw.githubusercontent.com/NoelFB/Celeste/master/Source/Player/Player.cs). The application
is a simple outward scan -- `for (int i = 1; i <= DashCornerCorrection; i++)` over candidate
offsets, taking the first collision-free position
(https://raw.githubusercontent.com/NoelFB/Celeste/master/Source/Player/Player.cs). DeepWiki
summarises the collision system as including "a system that slightly adjusts the player's position
to help them move smoothly around corners and edges"
(https://deepwiki.com/NoelFB/Celeste/2.3-player-movement-and-physics).

**Scale it to the body, not the tile.** Celeste's hitbox is 8 px wide, so 4 px is half the body
width. For a 20 px-wide player the literal equivalent is 10 px, which over-corrects visibly;
**6 px up and 4 px sideways (about 30% and 20% of body width)** is the recommendation here
**[derived]**.

The implementation guidance that makes this tractable: "split the movement into two functions. One
for X and one for Y. This made everything easier to think about and easier to resolve the
collisions", and on collision "we try to move you out of it depending on the direction that you
where moving. If while correcting you in one axis you collide again then we just don't move you,
after that it's time for the other axis to try and correct you"
(https://amano.games/devlog/how-to-correct-a-corner).

```js
// called when an upward move was blocked
function correctUpward(p, dy) {
  for (let i = 1; i <= CORNER_UP; i++) {
    for (const s of [-1, 1]) {
      if (!solidAt(p.x + s * i, p.y + dy, PLAYER_W, PLAYER_H)) { p.x += s * i; return true; }
    }
  }
  return false;   // genuine ceiling: stop vy, and start CEIL_VARJUMP_GRACE
}
```

Other forgiveness worth shipping, all cheap:

* **Ground-check widening.** Test the floor with a box 1-2 px wider than the hitbox on each side, so
  standing on the extreme pixel of a ledge still counts as grounded.
* **Landing snap.** When a downward move is blocked, snap flush to the surface and zero `vy`; when
  descending within 2-3 px of a floor, snap down rather than leaving a sliver gap. Celeste's
  `DashVFloorSnapDist = 3` is the same idea
  (https://raw.githubusercontent.com/NoelFB/Celeste/master/Source/Player/Player.cs).
* **Ceiling variable-jump grace.** After a head bonk, keep the variable-jump window alive for
  `CeilingVarJumpGrace = .05f` so a jump under a low ceiling is not silently truncated
  (https://raw.githubusercontent.com/NoelFB/Celeste/master/Source/Player/Player.cs).
* **Spike direction check.** Only kill when the player's velocity points into the spike, and inset
  the lethal AABB to roughly the visible spike body (e.g. 28x12 within the 32x32 tile) rather than
  the whole cell. This eliminates the "I brushed it sideways and died" complaint, which on touch is
  the single most common rage-quit trigger.

### 1.8 Collision: the Celeste Actor/Solid model, verbatim

Maddy Thorson's notes are the reference implementation, described as "a very simple system that I
arrived at after about a decade of experimenting with tile-based platformers"
(https://www.maddymakesgames.com/articles/celeste_and_towerfall_physics/index.html ; also mirrored
at https://maddythorson.medium.com/celeste-and-towerfall-physics-d24bd2ae0fc5). The rules:

* "All of our physics are handled by two classes: Solids and Actors"
  (https://www.maddymakesgames.com/articles/celeste_and_towerfall_physics/index.html).
* "All colliders are axis-aligned bounding boxes (AABBs)" and "All collider positions, widths, and
  heights are integer numbers"
  (https://www.maddymakesgames.com/articles/celeste_and_towerfall_physics/index.html).
* "Except for special circumstances, Actors and Solids will never overlap"
  (https://www.maddymakesgames.com/articles/celeste_and_towerfall_physics/index.html).
* Actors expose `public void MoveX(float amount, Action onCollide)` and `public void MoveY(float, Action)`;
  float amounts accumulate into a **remainder** counter, and "since positions are represented as
  integers we can't move in fractions of pixels, so we only move when the rounded remainder is
  non-zero"; movement then proceeds **pixel by pixel**, checking ahead, and on collision the
  callback fires and movement halts
  (https://www.maddymakesgames.com/articles/celeste_and_towerfall_physics/index.html).
* Solids move with no collision callback and interact with Actors two ways: **carrying** riders
  (detected by `public virtual bool IsRiding(Solid solid)`, checked *before* the Solid moves) and
  **pushing** overlapped Actors; "Pushing takes priority over carrying"
  (https://www.maddymakesgames.com/articles/celeste_and_towerfall_physics/index.html).
* "Pushed Actors receive only the distance between edges; carried Actors receive full movement with
  no collision callback"
  (https://www.maddymakesgames.com/articles/celeste_and_towerfall_physics/index.html).
* `public virtual void Squish()` defines behaviour when an Actor is caught between Solids and
  "defaults to destruction"
  (https://www.maddymakesgames.com/articles/celeste_and_towerfall_physics/index.html).

Why this matters for **your** feature list: moving platforms, falling platforms and switch-driven
gates are all Solids, and the carry / push / squish trichotomy is exactly the set of bugs that
otherwise eats a week. Port the model, not just the idea. A community port of the same engine
including moving platforms exists for reference (https://github.com/bennyfrancis/Celestefall), as
does a pixel-perfect proof-of-concept (https://github.com/passiomatic/platformer-physics).

```js
// integer position + subpixel remainder, pixel-marched
class Actor {
  moveX(amount, onCollide) {
    this.rx += amount;
    let move = Math.round(this.rx);
    if (!move) return;
    this.rx -= move;
    const sign = Math.sign(move);
    while (move) {
      if (!solidAt(this.x + sign, this.y, this.w, this.h)) { this.x += sign; move -= sign; }
      else { onCollide && onCollide(); return; }
    }
  }
}
```

Two consequences to plan for. First, **render with the remainder**: draw at `x + rx` (or at a
smoothed interpolation of the previous and current integer positions) so integer stepping does not
read as 1 px jitter at low speeds. Second, **one-way platforms** fall out naturally: in `moveY`,
only treat a one-way as solid when `sign > 0` and the actor's bottom was above the platform's top
at the start of the step.

### 1.9 Reference tables

**Celeste `Player.cs` constants** (all from
https://raw.githubusercontent.com/NoelFB/Celeste/master/Source/Player/Player.cs , cross-checked
against https://deepwiki.com/NoelFB/Celeste/2.3-player-movement-and-physics). Celeste's world unit
is a 8 px tile, so divide by 8 to get tiles/s.

| Constant | Value | Meaning |
|---|---|---|
| `MaxRun` | 90f | max horizontal run speed |
| `RunAccel` | 1000f | ground acceleration |
| `RunReduce` | 400f | deceleration when above max speed |
| `AirMult` | .65f | air-control multiplier |
| `HoldingMaxRun` | 70f | max run while carrying something |
| `Gravity` | 900f | base gravity |
| `HalfGravThreshold` | 40f | |vy| under which gravity halves (apex hang) |
| `MaxFall` | 160f | terminal velocity |
| `FastMaxFall` | 240f | fast-fall terminal velocity |
| `FastMaxAccel` | 300f | ramp rate into fast-fall |
| `JumpSpeed` | -105f | launch velocity |
| `JumpHBoost` | 40f | horizontal boost at takeoff with direction held |
| `VarJumpTime` | .2f | variable-jump hold window |
| `JumpGraceTime` | 0.1f | coyote time |
| `CeilingVarJumpGrace` | .05f | keeps var-jump alive after a ceiling bonk |
| `UpwardCornerCorrection` | 4 | px of head-bonk nudge |
| `DashCornerCorrection` | 4 | px of dash corner nudge |
| `DuckCorrectCheck` | 4 | px of duck-out-of-gap nudge |
| `WallJumpCheckDist` | 3 | px of wall-detection reach |
| `WallJumpForceTime` | .16f | forced-direction window after a wall jump |
| `WallJumpHSpeed` | MaxRun + JumpHBoost | wall jump horizontal speed |
| `WallSlideStartMax` | 20f | |
| `WallSlideTime` | 1.2f | stamina-like slide duration |
| `WallSpeedRetentionTime` | .06f | grace that keeps speed when hitting a wall |
| `DashSpeed` | 240f | |
| `EndDashSpeed` | 160f | |
| `DashTime` | .15f | |
| `DashVFloorSnapDist` | 3 | px of floor snap after a dash |
| `BounceAutoJumpTime` | .1f | auto-jump window after a bounce (springs) |
| `HoldMinTime` | .35f | |

**Ratios worth carrying across scales [derived]**, since these transfer between tile sizes better
than raw values do:

| Ratio | Celeste value | Applied here |
|---|---|---|
| `RunAccel / MaxRun` | 11.1 /s (0.09 s to top speed) | 10 /s (0.10 s) |
| `RunReduce / RunAccel` | 0.40 | 0.40 for over-speed bleed |
| `HalfGravThreshold / |JumpSpeed|` | 0.38 | `APEX_BAND / JUMP_V = 0.35` |
| `MaxFall / |JumpSpeed|` | 1.52 | `780 / 576 = 1.35` |
| `FastMaxFall / MaxFall` | 1.50 | `1080 / 780 = 1.38` |
| `JumpHBoost / MaxRun` | 0.44 | 0.40 |
| `UpwardCornerCorrection / bodyWidth` | 0.50 (4 / 8) | 0.30 (6 / 20) |

### 1.10 Level-element specifics, derived from the parameter set

* **Springs / launchers.** Height scales with `v^2`, so a 6-tile spring needs
  `sqrt(6/3) = 1.41 x JUMP_V` and a 9-tile spring `sqrt(9/3) = 1.73 x JUMP_V` **[derived]**.
  Critically, **disable the jump-cut for ~0.1 s after a launch** so a player still holding or
  releasing the jump button cannot accidentally halve a spring boost; Celeste does the analogous
  thing with `BounceAutoJumpTime = .1f`
  (https://raw.githubusercontent.com/NoelFB/Celeste/master/Source/Player/Player.cs). Spring feedback:
  squash the spring to 0.6 y-scale for 2 frames then overshoot to 1.15, 6 frames of hitstop, a
  `SHAKE` trauma of 0.35, and a rising sine "boing" (4.7).
* **Moving platforms.** Implement as Solids with `IsRiding` carry semantics
  (https://www.maddymakesgames.com/articles/celeste_and_towerfall_physics/index.html). Two extras
  the player will feel: (a) on leaving a horizontally moving platform, add a fraction (0.6-1.0) of
  the platform velocity to the player so jumps off a moving platform behave physically; (b) ease the
  platform with a sine or `easeInOutSine` path rather than a linear ping-pong, so the reversal does
  not read as a teleport.
* **Falling platforms.** Telegraph for 0.25-0.35 s with a 1 px, 20 Hz horizontal shake plus a dust
  puff, then release under a gentler gravity (~1200 px/s^2) so the player can still react, despawn
  1.5 s later, respawn 2 s after that. Never make the *first* falling platform in a level lethal.
* **Fake platforms.** Render at 0.85 alpha with a 2 px inward bevel that is slightly off from the
  real tileset's bevel -- perceivable on close inspection, invisible at speed. On contact, dissolve
  over 6 frames into 8-12 particles that inherit the player's velocity; give 1 frame of coyote-like
  grace so a player who taps jump on the same frame still gets the jump.
* **Switches / gates.** 0.08 s squash on the switch, a two-click beep (4.7), tint change, and open
  the gate over 0.2 s with an ease-out-back overshoot. Gates are Solids, so the squish path applies:
  a closing gate must push or kill, and "Pushing takes priority over carrying"
  (https://www.maddymakesgames.com/articles/celeste_and_towerfall_physics/index.html).
* **Enemies.** Give the stomp a generous vertical window (kill if the player's bottom is above the
  enemy's mid-line and `vy > 0`), then rebound at `0.8 x JUMP_V`, or `1.0 x` if the jump button is
  held -- the Mario convention. 6 frames of hitstop, trauma 0.3.
* **Coins.** 12 px pickup radius with a 20 px magnet that pulls the coin toward the player at
  400 px/s once inside, then a 0.25 s tween to the HUD counter; a 3-frame hitstop is enough, and
  the pitch should rise with a combo counter (4.7).

---

## 2. Touch controls for platformers

### 2.1 What the best mobile platformers actually do

The consistent lesson from well-reviewed touch platformers is that the winners either **hide the
buttons** or **make them enormous and invisible**, and never draw a skeuomorphic D-pad.

* **Dadish** (Thomas K. Young). "The controls feature an invisible control stick on the left side of
  the screen that controls left/right movement by sliding your thumb back and forth, while the entire
  right side of the screen serves as one big invisible button for jumping and double jumping",
  described by TouchArcade as "Nice and simple"
  (https://toucharcade.com/2020/01/16/dadish-release-date/). TouchArcade repeatedly credits the game
  with "great touchscreen controls" (https://toucharcade.com/games/dadish). The 3D sequel is the
  counter-example that proves the rule: reviewers criticised it because "camera movement is tied to
  a virtual right analog stick rather than just being the whole right side of the screen"
  (https://toucharcade.com/2024/04/26/toucharcade-game-of-the-week-dadish-3d/), and a video review is
  titled around controls getting in the way (https://www.youtube.com/watch?v=SDz1H62uPdM).
  **Takeaway: the entire right half of the screen is the jump button. Not a circle on it.**
* **Super Cat Tales** (Neutronized). No virtual buttons at all: "you tap and hold the left side of
  the screen to go left, and the right side to go right. A swift double-tap triggers your cat's
  sprint, and if you sprint off the edge of a platform, you'll leap through the air"
  (https://toucharcade.com/2016/11/25/super-cat-tales-review/). Walking into walls auto-starts a
  climb, and wall-jumps reach higher ledges
  (https://toucharcade.com/2016/11/25/super-cat-tales-review/). The design intent is explicit: the
  game "avoids using virtual buttons and finds a way to build the game around a more fitting setup
  for touchscreen", and "for a game that only has two 'buttons' to control it, Super Cat Tales is
  fantastically well-designed, with each level built perfectly with the restrictions in mind"
  (https://www.pocketgamer.com/super-cat-tales/review/). It is credited with setting "the benchmark
  for unique and intuitive platforming controls on a touchscreen"
  (https://toucharcade.com/2023/05/26/toucharcade-game-of-the-week-super-cat-tales-paws/).
  **Takeaway: contextual jumping (jump derived from state, not from a separate button) removes an
  entire input channel. Consider it for a "simple controls" accessibility mode.**
* **Leo's Fortune** (1337 & Senri). "Drag on the left side of the screen to move left or right, and
  drag on the right side to jump or drop" -- left thumb slides, right thumb swipes up/down
  (https://www.imore.com/leos-fortune-review). Reviewers drew the general principle: "Good controls
  can exist on a mobile game when you embrace the touch screen rather than fight it with on-screen
  controls and tapping" (https://www.androidcentral.com/leos-fortune-android-review). Crucially the
  design compensates for touch imprecision: "It can be annoying to play a precision platformer with
  touchscreen controls, but Leo's Fortune is pretty forgiving. A small miscalculation isn't always
  going to send you tumbling into an abyss or drop you on to a floor of spikes"
  (https://toucharcade.com/2014/04/28/leos-fortune-review/).
  **Takeaway: on touch, widen the forgiveness windows rather than the platforms.**
* **Rayman Jungle Run** (Pastagames/Ubisoft). Reduced to one touch: "Rayman charges forward
  automatically the moment the level begins, leaving players to help him clear gaps, avoid nasties,
  and collect glowing Lums with a single tap of their finger"; you "tap anywhere on-screen and he
  leaps in the air" (https://www.pocketgamer.com/rayman-jungle-run/hands-on-with-rayman-jungle-run-on-ios-and-android/).
  TouchArcade notes the tap-anywhere scheme covers three of its four worlds, with wall-run, float
  and attack layered on the same input (https://toucharcade.com/2012/09/19/rayman-jungle-run-review-a-run-away-hit/),
  and the design lineage is explicitly Canabalt: "Jungle Run streamlines controls by taking a page
  out of auto-runners like Canabalt -- Rayman is in constant motion, so all you have to worry about
  is dodging obstacles" (https://www.destructoid.com/reviews/review-rayman-jungle-run/).
  **Takeaway: tap-anywhere is the lowest-friction jump input that exists. If a level needs
  precise stopping, it is a level problem, not a control problem.**

### 2.2 The recommended layout for this game

Landscape, full-bleed, three invisible regions, no drawn D-pad:

```
+-----------------------------------------------------------+
|  [pause]                                    HUD / timer   |
|                                                           |
|                      GAME VIEW                            |
|                                                           |
|  +---------------+---------------+---------------------+   |
|  |   LEFT 22%    |  RIGHT 22%    |   JUMP  (rest)      |   |  <- bottom 45% of the screen
|  +---------------+---------------+---------------------+   |
+-----------------------------------------------------------+
```

* **Left / right as two adjacent halves of one pad**, not two separated circles: the player slides a
  thumb between them without lifting. This is the mechanism the HTML5 devlog describes -- once a
  finger contacts an element, that element receives all subsequent events for that touch, so it uses
  `Document.elementFromPoint()` during `touchmove` "to determine the current button position",
  tracking `Touch.lastDPadPressed` so it can "unpress the previous button and press the new one as
  the finger slides across the interface" (https://www.aaronbell.com/mobile-touch-controls-from-scratch/).
  With Pointer Events you get the same behaviour by **not** calling `setPointerCapture` on the pad
  and instead hit-testing `clientX/clientY` against your own rects each `pointermove`.
* **Jump is everything else in the bottom band, plus the whole right side above it** -- the Dadish
  rule (https://toucharcade.com/2020/01/16/dadish-release-date/).
* **A second jump tap while airborne** is your double-jump / dive input; no new region needed.
* **Sizes.** WCAG 2.1 puts the minimum target at 44x44 CSS px, iOS HIG at 44x44 pt and Android at
  48x48 dp (https://www.w3.org/WAI/GL/mobile-a11y-tf/wiki/M2 ,
  https://www.uxpin.com/studio/blog/responsive-design-touch-devices-key-considerations/). For game
  controls specifically the guidance is far larger -- "buttons should be at least 80-120 pixels in
  size on a 1080p base resolution", with movement controls on the left and actions on the right, and
  "avoid forcing players to stretch to the corners"
  (https://inairspace.com/blogs/learn-with-inair/godot-touch-controls-for-mobile-a-complete-practical-guide-1).
  Keep at least an 8 px gap between distinct interactive elements
  (https://inairspace.com/blogs/learn-with-inair/godot-touch-controls-for-mobile-a-complete-practical-guide-1).
  Percentage sizing beats pixel sizing: the HTML5 devlog sizes its buttons at 18% of screen width and
  12% of height (https://www.aaronbell.com/mobile-touch-controls-from-scratch/).
* **Thumb zone.** "Key actions should be placed in the bottom third of screens for one-handed ease";
  in landscape "thumbs reach the left and right lower quadrants"
  (https://parachutedesign.ca/blog/thumb-zone-ux/). So: nothing interactive in the top half, and
  never in a corner.
* **Pressed states are mandatory.** "For every touch control, provide pressed states by changing
  color, scale, or opacity when pressed"
  (https://inairspace.com/blogs/learn-with-inair/godot-touch-controls-for-mobile-a-complete-practical-guide-1).
  For invisible regions, show a 10% white radial glow at the touch point for 120 ms -- enough to
  confirm the input registered without cluttering the screen.
* **Let the player move the regions.** Reviewers of Dadish-style schemes value being able to
  "customize button placement for maximum comfort", adjust opacity "so they don't block gameplay",
  and "size them according to your finger reach" (https://dadish.io/). A single "drag to reposition
  the jump zone" settings screen is a small amount of code for a large accessibility win.

### 2.3 Pointer Events implementation

Use **Pointer Events**, not Touch Events: one code path covers mouse, pen and touch, and `pointerId`
gives you per-finger tracking. `pointerId` is "a unique identifier for each pointer causing an
event", `pointerType` is `"mouse" | "pen" | "touch"`, and the lifecycle is
`pointerdown -> pointermove -> pointerup`, with `pointercancel` fired when "the browser cancels the
pointer (device deactivated, interaction interpreted as pan/zoom, etc.)"
(https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events).

MDN's own multi-touch game pattern is a `Map` keyed by `pointerId`
(https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events):

```js
const pointers = new Map();          // pointerId -> {x, y, region}
const canvas = document.getElementById('game');

canvas.addEventListener('pointerdown', e => {
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, region: regionAt(e.clientX, e.clientY) });
  recomputeInput();
  e.preventDefault();
});
canvas.addEventListener('pointermove', e => {
  const p = pointers.get(e.pointerId); if (!p) return;
  p.x = e.clientX; p.y = e.clientY; p.region = regionAt(p.x, p.y);   // slide between left/right
  recomputeInput();
});
for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) {
  canvas.addEventListener(ev, e => { pointers.delete(e.pointerId); recomputeInput(); });
}
```

Three non-obvious rules:

1. **Handle `pointercancel` as a release.** It fires when the OS or browser steals the gesture
   (https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events). Dropping it is the classic
   "my character kept running after a notification appeared" bug.
2. **Do not use `setPointerCapture` for the movement pad.** Capture routes all events for that
   pointer to the capturing element and suppresses `pointerover/enter/leave/out`
   (https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events) -- great for dragging a slider,
   wrong for a pad you want to slide *across*. Do your own rect hit-testing instead. Capture *is*
   right for a draggable settings widget, and MDN warns to call `setPointerCapture()` *after* DOM
   movements "to prevent losing track of the element"
   (https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events).
3. **Keep handlers tiny.** MDN's best practices: "Minimize work in event handlers", "Target specific
   elements -- don't attach handlers to `document` or high-level nodes", and "Make targets large
   enough ... (~44px minimum)" (https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events).
   Handlers should only mutate an input-state object; the fixed-step loop reads it.

Also register with `{ passive: false }` where you call `preventDefault()`, and consider
`pointerrawupdate` (listed among the pointer events at
https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events) only if you measure a real latency
win -- it fires more often and costs main-thread time.

### 2.4 The CSS that stops the browser fighting you

```css
html, body { margin: 0; height: 100%; overflow: hidden; overscroll-behavior: none; }
#game, .touchzone {
  touch-action: none;                        /* kill pan + pinch + double-tap zoom */
  -webkit-tap-highlight-color: transparent;  /* no grey flash on tap (WebKit) */
  -webkit-touch-callout: none;               /* no long-press context menu on iOS */
  user-select: none; -webkit-user-select: none;
}
#stage { height: 100svh; }                   /* see 2.5 */
```

* **`touch-action: none`** "disables all browser handling of panning and zooming gestures"; MDN adds
  that applications using Pointer Events "will still receive `pointercancel` events when gestures
  start", and flags the accessibility cost -- "Disabling all gestures may prevent users with low
  vision from zooming the page, violating WCAG 1.4.4"
  (https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action). So scope `none` to the canvas and
  the touch zones, and leave menus/settings pages pinchable.
* **`touch-action: manipulation`** is the right value for menu buttons: it "enables panning and pinch
  zoom gestures" while disabling double-tap zoom, and importantly "removes the delay browsers add for
  click events to detect double-tap zooming"
  (https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action).
* MDN notes gesture resolution walks `touch-action` "up the element tree to the first scrolling
  element", and that "changes to `touch-action` during an active gesture have no effect"
  (https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action) -- so set it before the first
  touch, not in response to one. `touch-action` has been widely available since September 2019
  (https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action).
* **Pull-to-refresh and rubber-banding** need `overscroll-behavior: none` plus `overflow: hidden` on
  the scroller; `touch-action` alone does not stop every platform's overscroll.
* **Belt and braces:** the from-scratch HTML5 implementation "consumes all `touchmove` events outside
  buttons using `event.preventDefault()` to prevent unwanted screen dragging"
  (https://www.aaronbell.com/mobile-touch-controls-from-scratch/). Keep a document-level
  `touchmove`/`gesturestart` preventer as a fallback for older iOS.
* **Do not feature-detect touch with `'ontouchstart' in window`** -- it "produces false positives on
  Windows 8" and generally "touch detection remains problematic across platforms"
  (https://www.aaronbell.com/mobile-touch-controls-from-scratch/). Instead show whichever control
  scheme the last input event used, and switch live.

### 2.5 Viewport, address bars and fullscreen

`100vh` is broken on mobile because "the classic `vh` unit does not account for the browser's own UI:
the address bar, tab strip, and toolbar", and `100vh` was defined against the largest possible
viewport with toolbars collapsed (https://csstoolkit.net/blog/css-dvh-svh-lvh-guide/). The fix is the
dynamic viewport units: "`svh` is the small viewport (address bar shown), `lvh` is the large viewport
(address bar hidden), and `dvh` updates live as the bar moves"
(https://csstoolkit.net/blog/css-dvh-svh-lvh-guide/). More precisely, `svh` is the height "when the
address bar UI hasn't shrunk its size yet" and `lvh` after it has
(https://ishadeed.com/article/new-viewport-units/).

**Recommendation: `100svh` for the game stage.** Use `svh` "when content must not overflow and a
small gap at the bottom is acceptable"; `dvh` "always fill[s] the exact visible screen ... at the
cost of a layout shift mid-scroll", and a resize mid-play is worse than a 40 px letterbox
(https://csstoolkit.net/blog/css-dvh-svh-lvh-guide/). Support is fine: "Chrome 108+, Edge 108+,
Firefox 101+, Safari 15.4+, Opera 94+, and Samsung Internet 21+", above 90% globally
(https://www.testmuai.com/learning-hub/viewport-unit-variants-browser-support/). Keep a
`--vh` custom-property fallback set from `visualViewport` for very old iOS.

Also resize the canvas from `ResizeObserver` / `visualViewport.resize`, not from `window.resize`
alone, and debounce it by a frame -- iOS fires several resizes as the bar animates.

**Fullscreen.** Request it from a user gesture (the pause menu's "Fullscreen" toggle, or the first
tap on the title screen); it both removes the address bar and is the precondition for orientation
lock. **Orientation lock** accepts `"any" | "natural" | "landscape" | "portrait" |
"portrait-primary" | "portrait-secondary" | "landscape-primary" | "landscape-secondary"`, returns a
Promise, and MDN is explicit that "typically orientation locking is only enabled on mobile devices,
and when the browser context is full screen"
(https://developer.mozilla.org/en-US/docs/Web/API/ScreenOrientation/lock). Errors to handle:
`InvalidStateError` (document not fully active), `SecurityError` (hidden document, or a sandboxed
iframe without `allow-orientation-lock`), `NotSupportedError` (UA cannot lock that orientation), and
`AbortError` (another `lock()` in flight, or `unlock()` called while pending)
(https://developer.mozilla.org/en-US/docs/Web/API/ScreenOrientation/lock). The feature has "Limited
availability" and is "not Baseline because it does not work in some of the most widely-used browsers"
(https://developer.mozilla.org/en-US/docs/Web/API/ScreenOrientation/lock) -- **iOS Safari does not
lock**, so treat the lock as a bonus and always ship a working portrait layout.

```js
async function goFullscreenLandscape(el) {
  try { await el.requestFullscreen({ navigationUI: 'hide' }); } catch {}
  try { await screen.orientation.lock('landscape'); } catch {}   // never fatal
}
```

**Portrait layout** (mandatory fallback, and preferable for one-handed play): letterbox the game into
the upper ~62% of the screen and put the control band in the lower ~38%, which sits squarely in the
thumb zone's "bottom third" (https://parachutedesign.ca/blog/thumb-zone-ux/). In portrait, narrow the
camera's horizontal view and *raise* the look-ahead so the player still sees incoming hazards. Do not
show a "please rotate your device" wall -- it reads as brokenness.

Respect the safe-area insets so the control band is not under a home indicator or notch:
`padding-bottom: max(12px, env(safe-area-inset-bottom))`, with `viewport-fit=cover` in the viewport
meta.

### 2.6 Haptics

`navigator.vibrate()` takes either a duration in ms or an array pattern of alternating
vibrate/pause intervals, e.g. `navigator.vibrate(200)` or
`navigator.vibrate([100, 30, 100, 30, 200])`; it returns `true` if vibration started and `false` if
invalid parameters prevented it, and cancelling is `vibrate(0)` or `vibrate([])`
(https://developer.mozilla.org/en-US/docs/Web/API/Navigator/vibrate).

Caveats to code around, all from MDN
(https://developer.mozilla.org/en-US/docs/Web/API/Navigator/vibrate):

* **Sticky user activation is required** -- "The user has to interact with the page or a UI element
  in order for this feature to work."
* "If the device doesn't support vibration, this method has no effect."
* "Some devices may not vibrate if they are in Silent mode or Do Not Disturb (DND) mode."
* "If a vibration pattern is already in progress when this method is called, the previous pattern is
  halted and the new one begins instead" -- so a spammy per-coin buzz will cut off your death buzz.
* Over-long patterns are truncated, "the max length depends on the implementation".
* It is "not Baseline because it does not work in some of the most widely-used browsers", and iOS
  Safari is among those without support.

A restrained mapping that survives the "new pattern halts the old" rule:

| Event | Pattern | Notes |
|---|---|---|
| Jump | none | too frequent; buzzing every jump is fatiguing and masks real signals |
| Land from a big fall | `12` | only when `vy` at impact exceeded 0.7 * MAX_FALL |
| Coin | none (or `8` with a 120 ms rate limit) | off by default |
| Spring | `18` | |
| Switch | `10` | |
| Death | `[30, 40, 60]` | the only long pattern in the game |
| Level complete | `[20, 60, 20, 60, 40]` | |

Expose a **Haptics on/off** switch, default on for Android, and never rely on haptics to convey
information that is not also visual and audible.

---

## 3. Canvas-2D visual polish that reads as detailed and realistic

### 3.1 Layer order (draw in exactly this order)

```
1  sky            vertical gradient, cached, redrawn only when the palette changes
2  far parallax   0.15x camera    silhouetted mountains / city
3  mid parallax   0.30x           hills, big trees
4  god rays       0.55x, 'lighter'
5  near parallax  0.55x           closer foliage, banners
6  fog band A     0.70x, alpha 0.05
7  tile chunks    1.00x           pre-rendered offscreen chunks, 1 drawImage each
8  drop shadows   cached blob sprites under entities
9  entities       platforms, springs, switches, enemies, coins
10 player         squash/stretch applied via ctx.scale
11 particles      one pass, split into 'source-over' then 'lighter' sub-passes
12 foreground     1.25x parallax: grass blades, pipes crossing the frame
13 fog band B     1.10x, alpha 0.04
14 vignette       cached radial gradient, drawn once per frame
15 flash          full-screen fill at low alpha for hits/deaths
16 HUD            separate DOM/canvas layer, not redrawn every frame
```

MDN's canvas optimisation guidance directly supports splitting these: "Use multiple layered canvases
for complex scenes" -- "Layer items using multiple `<canvas>` elements" and "Update only layers that
change (UI, gameplay, static background)"; and "Use plain CSS for large background images" via a
`<div>` positioned under the canvas "to avoid rendering on every tick"
(https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas).

### 3.2 Resolution, DPR and crispness

MDN's high-DPI canvas recipe
(https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas , and the
original at https://web.dev/articles/canvas-hidipi):

```js
const dpr = window.devicePixelRatio;
const rect = canvas.getBoundingClientRect();
canvas.width  = rect.width  * dpr;
canvas.height = rect.height * dpr;
ctx.scale(dpr, dpr);
canvas.style.width  = `${rect.width}px`;
canvas.style.height = `${rect.height}px`;
```

The web.dev version is the same idea: "create images scaled up by the devicePixelRatio and then use
CSS to scale it down by the same amount, and the same is true for canvas", with
`var dpr = window.devicePixelRatio || 1` (https://web.dev/articles/canvas-hidipi).

**Cap the DPR.** "Modern mobile device screens often yield a `devicePixelRatio` value greater than 2,
which can significantly impact canvas rendering performance", and the practical fix is
`Math.min(devicePixelRatio, 2)`; one documented approach goes further and "caps DPR to 1.5 on
coarse/small-screen devices while keeping a cap of 2 for desktop", reporting improvements "from 20-30
fps to consistent 60fps" from this class of optimisation
(https://docs.bswen.com/blog/2026-02-21-canvas-performance-optimization/). Recommendation:

```js
const coarse = matchMedia('(pointer: coarse)').matches;
const dpr = Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2);
```

and ship an in-game **Resolution** slider (0.75 / 1.0 / 1.25) that multiplies this, because a phone
that thermal-throttles mid-level is a real failure mode.

Other rendering hygiene from MDN
(https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas):

* "Avoid floating-point coordinates and use integers instead" -- "Sub-pixel rendering forces extra
  anti-aliasing calculations"; use `Math.floor()` on `drawImage` coordinates. Do this for **tiles and
  sprites**, but keep the camera itself fractional and floor only at draw time, or motion stutters.
* "Don't scale images in `drawImage`" -- "Cache various sizes of images on offscreen canvas when
  loading".
* "Turn off transparency" with `canvas.getContext("2d", { alpha: false })` **on the bottom-most
  layer only** (upper layers must stay transparent).
* "Batch canvas calls together", "Avoid unnecessary canvas state changes", "Try different ways to
  clear canvas -- `clearRect()` vs `fillRect()` vs resizing canvas", "Avoid text rendering whenever
  possible", and "Be careful with heavy physics libraries".
* "Scaling canvas using CSS transforms" is faster because "CSS transforms use GPU", and "it's better
  to have a smaller canvas scaled up than a larger canvas scaled down". This is the cheapest global
  performance lever you have: render at 0.8 scale and let the compositor upscale.

For a crisp pixel-art look, `ctx.imageSmoothingEnabled = false` and integer-scale the transform:
`Game.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)`, choosing
`desiredScale = Math.min(xScale, yScale)` for letterboxing or `Math.max(...)` to fill and crop
(https://7tonshark.com/posts/pixel-art-canvas-resize/). That source lays out four options -- fixed
size, DPI-aware fixed size, letterbox, and zoom/crop
(https://7tonshark.com/posts/pixel-art-canvas-resize/); **letterbox** is right for a precision
platformer, because crop changes how much level a player can see and therefore changes difficulty
between devices.

### 3.3 Offscreen tile caching and auto-edging

**Cache the static tilemap.** MDN's first optimisation is "Pre-render similar primitives or repeating
objects on an offscreen canvas ... Render the offscreen image to primary canvas as needed"
(https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas). Chunk the
level into 512x512 px (16x16 tile) canvases, render each once, then draw only the 4-9 visible chunks:
one `drawImage` per chunk instead of hundreds of per-tile calls. Rebuild only the chunks a switch or
a destroyed tile dirties.

`OffscreenCanvas` is now "widely available ... since March 2023" and can be driven from a worker via
`htmlCanvas.transferControlToOffscreen()` + `worker.postMessage({canvas: offscreen}, [offscreen])`,
with results shown through an `ImageBitmapRenderingContext`
(https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas). For chunk baking, a plain
`document.createElement('canvas')` is sufficient and simpler; reach for `OffscreenCanvas` in a worker
only if baking a large level visibly hitches the first frame -- its stated benefit is "offload[ing]
rendering to worker threads, preventing main thread blocking"
(https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas).

**Auto-edging / bevelling.** Compute an 8-bit neighbour mask per tile (N, NE, E, SE, S, SW, W, NW),
"If a neighbor has the same terrain, its bit is set to 1. Otherwise, 0. The bitmask value then serves
as a lookup index" (https://jaconir.online/blogs/bitmask-autotile-guide). The reason you need 47
variants and not 256 is the diagonal-gating rule: "A corner peering bit only counts when both of its
adjacent side bits are set", because "a diagonal neighbour with nothing beside it touches your tile
at a single point -- there is nothing to draw differently"
(https://blobsmith.itch.io/blobsmith-lite/devlog/1627776/why-a-blob-autotile-is-47-tiles-and-not-256-we-asked-godot-all-256-times).
The 47 are unevenly loaded: "16 of them answer a single neighbourhood each, and 7 answer sixteen
each" (https://blobsmith.itch.io/blobsmith-lite/devlog/1627776/why-a-blob-autotile-is-47-tiles-and-not-256-we-asked-godot-all-256-times).
A dual-grid variant that halves the art requirement is documented at
https://excaliburjs.com/blog/Dual%20Tilemap%20Autotiling%20Technique/ , and an interactive
explanation at https://www.redblobgames.com/articles/autotile/claude/ .

You do not need 47 hand-drawn tiles to look good in Canvas 2D. Draw them procedurally into the cache
at load time:

```js
// per tile, once, into the chunk canvas
ctx.fillStyle = base;            ctx.fillRect(x, y, 32, 32);
if (!mask.N) { ctx.fillStyle = light; ctx.fillRect(x, y, 32, 3); }        // top highlight
if (!mask.S) { ctx.fillStyle = dark;  ctx.fillRect(x, y + 29, 32, 3); }   // bottom shade
if (!mask.W) { ctx.fillStyle = lightW; ctx.fillRect(x, y, 2, 32); }
if (!mask.E) { ctx.fillStyle = darkE;  ctx.fillRect(x + 30, y, 2, 32); }
if (!mask.N) { grassFringe(ctx, x, y, hash(tx, ty)); }                     // 2-4px irregular top
speckle(ctx, x, y, hash(tx, ty), 6);                                       // deterministic noise dots
```

Two details that do most of the "looks detailed" work: (a) **deterministic per-tile hashing**, so the
speckles and grass fringe differ per tile but are identical every time the chunk is rebuilt; (b) a
**3 px top highlight and 3 px bottom shade only on exposed faces**, which is what makes a flat
tilemap read as extruded geometry.

### 3.4 Parallax and skies

"Generally for a parallax effect you want each layer step closer to the viewer to go twice as fast as
the layer behind it" (https://justinjerzak.wordpress.com/2014/05/14/javascript-parallax-scroll-canvas-tutorial/).
For horizontally repeating layers, "layers only repeat horizontally so the rendering and scrolling
logic is somewhat different", and the standard structure is "an array of objects where each object
represents a layer and will contain all the data needed to achieve infinite scrolling for that layer"
(https://jslegenddev.substack.com/p/how-to-implement-infinite-parallax).

```js
const LAYERS = [
  { img: far,  f: 0.15, fy: 0.05, y: 0.30 },
  { img: mid,  f: 0.30, fy: 0.10, y: 0.42 },
  { img: near, f: 0.55, fy: 0.18, y: 0.55 },
  { img: fore, f: 1.25, fy: 0.40, y: 0.92 },   // > 1 => crosses the frame in front
];
for (const L of LAYERS) {
  const w = L.img.width;
  let x = -((cam.x * L.f) % w);
  const y = Math.floor(H * L.y - cam.y * L.fy);
  for (; x < W; x += w) ctx.drawImage(L.img, Math.floor(x), y);
}
```

**Use a vertical factor about a third of the horizontal one** (`fy ~ f/3`). Matching them makes the
sky slide up and down alarmingly during jumps; omitting vertical parallax entirely makes the
background feel painted on.

**Dynamic gradient skies** are almost free and carry an enormous amount of mood. Build a
`createLinearGradient(0, 0, 0, H)` with 3-4 stops, interpolate the stop colours per level (or over
time within a level) in HSL, and **cache the gradient object** -- recreating a gradient every frame
is a per-frame allocation plus a shader rebuild. Add a sun/moon disc with a large soft radial
gradient behind the far layer, and tint the far parallax layer toward the sky colour with a
`'source-atop'` fill so distant geometry desaturates into haze -- aerial perspective is the single
strongest depth cue you can add for two lines of code
(https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/globalCompositeOperation
documents `source-atop` as drawing "only where it overlaps the existing canvas content").

### 3.5 Shadows, glow, vignette -- all cached, never per-frame

**Never set `shadowBlur` in the render loop.** MDN lists "Avoid the `shadowBlur` property whenever
possible" among its optimisation rules
(https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas). Instead
bake blurred artefacts once:

```js
// one-time: a soft elliptical shadow blob
const shadowSprite = (() => {
  const c = document.createElement('canvas'); c.width = 64; c.height = 32;
  const g = c.getContext('2d');
  const rg = g.createRadialGradient(32, 16, 0, 32, 16, 32);
  rg.addColorStop(0, 'rgba(0,0,0,0.42)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 64, 32);
  return c;
})();
// per frame: one drawImage, scaled by how close the ground is
const k = clamp(1 - distToGround / (5 * TILE), 0.25, 1);
ctx.drawImage(shadowSprite, px - 32 * k, groundY - 8 * k, 64 * k, 32 * k);
```

The ground shadow that shrinks and fades with altitude is worth calling out separately: in a 2D
platformer it is the only cue that tells the player *where they will land*, and adding it measurably
reduces deaths on blind drops.

**Glow via additive compositing.** `'lighter'` is documented as: "Where both shapes overlap, the
color is determined by adding color values", i.e. `Result = Top + Bottom` clamped, with typical uses
"Glow effects, Light bloom effects, Additive light mixing"
(https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/globalCompositeOperation).
Recipe: draw the sprite normally, then draw a cached radial-gradient blob over it with
`globalCompositeOperation = 'lighter'` and `globalAlpha` 0.25-0.5. Always restore to
`'source-over'` immediately -- a leaked composite mode is a nasty class of bug because it usually
renders *almost* correctly. `'screen'` ("the pixels are inverted, multiplied, and inverted again",
giving "a lighter picture") is the gentler alternative when `'lighter'` blows out to white
(https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/globalCompositeOperation).
`'multiply'` ("a darker picture") is the right mode for a coloured light-pool or a tinted lava glow
on the floor (same source).

**Vignette.** One cached radial gradient from transparent at ~45% radius to
`rgba(8,6,16,0.45)` at the corners, drawn as the last world-space pass. Build it on resize only. A
vignette plus a 1-2% desaturation at the edges is the cheapest "this looks like a rendered scene"
trick in the toolbox.

### 3.6 Squash and stretch, hit-stop, screen shake

**Squash and stretch** is the first item in the canonical juice talk, *Juice it or lose it* by Martin
Jonasson and Petri Purho (GDC Europe 2012;
https://www.gdcvault.com/play/1016487/juice-it-or-lose ,
https://www.youtube.com/watch?v=Fy0aCDmgnxg). The talk's premise: "A juicy game feels alive and
responds to everything you do tons of cascading action and response for minimal user input"
(https://roblog.co.uk/2024/03/juicy-games/), demonstrated by taking "a dull Breakout clone" and
piling on effects live on stage until it "feels alive" (https://roblog.co.uk/2024/03/juicy-games/).
Squash specifically is "flattening objects on impact and stretching them on rebound, with the
deformation read by the eye as weight and energy" (https://roblog.co.uk/2024/03/juicy-games/). Note
that GMTK's *Platformer Toolkit* also exposes squash and stretch as a first-class movement variable,
not an afterthought (https://gmtk.itch.io/platformer-toolkit).

Implement it as a **volume-preserving** scale pair driven by a spring, so it settles instead of
popping:

```js
// state: sx, sy, vsx, vsy ; target 1,1
function squash(tx, ty, k = 220, d = 18) { p.sx = tx; p.sy = ty; }   // kick
function stepSquash(dt) {
  for (const a of ['x', 'y']) {
    const s = p['s' + a], v = p['vs' + a];
    const acc = -k * (s - 1) - d * v;
    p['vs' + a] = v + acc * dt;
    p['s' + a] = s + p['vs' + a] * dt;
  }
}
// draw
ctx.translate(px, py + PLAYER_H / 2);
ctx.scale(p.sx, p.sy);
ctx.drawImage(sprite, -w / 2, -PLAYER_H);
```

Kick values: **takeoff** `(0.82, 1.18)`; **landing** `(1.25, 0.75)` scaled by impact speed
`clamp(|vy| / MAX_FALL, 0.25, 1)`; **spring launch** `(0.7, 1.4)`; **turnaround** `(1.1, 0.95)`.
Also stretch along the velocity vector while airborne: `sy = 1 + clamp(|vy| / MAX_FALL, 0, 0.35)`.

**Hit-stop.** Freezing the simulation for a handful of frames on impact "helps sell that the
collision actually happened, gives the eyes a few frames to register and confirm it happened, and
makes the impact seem more powerful" (https://www.ssbwiki.com/Hitlag), and the same source notes it
is used in "Hollow Knight, Celeste, and Dead Cells" (https://www.ssbwiki.com/Hitlag). Shipped frame
counts from fighting games give the scale: Street Fighter IV uses roughly 9 frames for light
attacks, 11 for medium, 13 for hard and 8 for projectiles, while Street Fighter II used about 14
frames regardless of strength (https://sonichurricane.com/?p=1043). The same source shows why it
also *helps* input handling: the freeze "stabilizes cancel timing by providing a window where inputs
register", e.g. "You have that entire 12-frame impact freeze window to complete the input"
(https://sonichurricane.com/?p=1043).

For a platformer, scale down from those numbers: **3 frames** for a coin or switch, **6** for an
enemy stomp or spring, **10** for death. Implementation rule: during hit-stop, **skip the physics
step but keep rendering, keep the shake decaying, keep particles moving, and keep reading input into
the buffer** -- that last part is the difference between hit-stop feeling punchy and feeling like a
dropped frame.

**Screen shake.** Squirrel Eiserloh's *Math for Game Programmers: Juicing Your Cameras With Math*
(GDC 2016; https://gdcvault.com/play/1023146/Math-for-Game-Programmers-Juicing ,
https://www.youtube.com/watch?v=tu-Qe66AvtY , slides at
http://www.mathforgameprogrammers.com/gdc2016/GDC2016_Eiserloh_Squirrel_JuicingYourCameras.pdf )
gives the model still used everywhere: a single **trauma** scalar, with shake magnitude proportional
to **trauma squared**, and **Perlin noise** rather than `random()` for the offsets -- the talk's
guidance is summarised as "Camera shake = trauma^2" and "Use Perlin noise for shakes and for, like,
everything else" (https://archive.org/stream/GDC2016Eiserloh/GDC2016-Eiserloh_djvu.txt). The talk
covers "all the different types of camera shakes there are" and "how math contributes to the smooth
motion of a camera lazily following its player"
(https://www.gamedeveloper.com/programming/video-sprucing-up-cameras-with-math). A reference Unity
implementation that "generates pseudo-random camera shake using Perlin noise" is at
https://github.com/IronWarrior/UnityCameraShake .

```js
let trauma = 0;
const addTrauma = t => { trauma = Math.min(1, trauma + t); };
function shakeOffset(dt, time) {
  trauma = Math.max(0, trauma - SHAKE_DECAY * dt);
  const s = trauma * trauma;                 // squared: small hits stay subtle
  const f = 26;                              // noise frequency, Hz
  return {
    x: SHAKE_MAX_PX * s * (noise1(time * f)       * 2 - 1),
    y: SHAKE_MAX_PX * s * (noise1(time * f + 37)  * 2 - 1),
    r: 0.022 * s * (noise1(time * f + 91) * 2 - 1),   // ~1.3 deg max rotational shake
  };
}
```

Trauma budget: coin 0, switch 0.15, heavy land 0.45, enemy stomp 0.4, spring 0.35, falling-platform
break 0.5, death 1.0. Add **rotational** shake as well as translational -- it is what separates
"the camera is vibrating" from "the world was hit". Because `trauma^2` makes small events nearly
invisible, tune the small ones by *raising* their trauma rather than by lowering the exponent, and
expose a **Screen shake 0-100%** slider (0 must fully disable it, including rotation) for motion
sensitivity and for players who get nauseous.

**Death sequence** (the moment that has to feel good in a rage platformer, because players will see
it hundreds of times):

```
f0        freeze input, trauma 1.0, hitstop 10 frames, full-screen white flash alpha 0.5 -> 0 over 6 frames
f0        emit 28 shards (player-coloured, inherit 0.5x velocity + radial 120-320 px/s) + 18 dark dust
f0        low-pass sweep on the music bus for 300 ms, death SFX (4.7)
f0-f10    scale the player sprite to 1.4 while fading alpha to 0
f10-f24   time-dilation: step physics at 0.35x so the debris arcs read
f24-f36   fade to the level tint, camera drifts 8 px toward the killer
f36       respawn at the checkpoint with a 6-frame scale-in from 0.6 and 0.2 s of invulnerability
```

Total ~600 ms. Keep it under 700 ms: in a death-heavy game the respawn loop *is* the core loop, and
every 100 ms above that multiplies by the death counter.

### 3.7 Particles, trails, ambience

* **Budget.** Pool a hard cap of **300** live particles and drop the oldest when full; ambient
  idle ~40, a death burst 60, a landing puff 8-12, a coin pop 10. Never allocate per particle in
  the loop -- MDN's advice to batch draw calls and avoid state changes applies directly
  (https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas).
* **Draw them in two passes**, one `'source-over'` and one `'lighter'`, each setting `fillStyle`
  once per colour bucket, to avoid a `save/restore` per particle.
* Prefer `fillRect` for 1-3 px particles over `arc()` + `fill()`: no path construction, and at small
  sizes the shape difference is invisible.
* **Ambient particles** sell "this world is alive" more cheaply than anything else: 30-50 dust motes
  drifting with a slow sine sway, spawned in a band around the camera and wrapped rather than
  respawned. Vary each level: leaves (sway + rotate), embers (rise + `'lighter'`), snow (slow fall +
  horizontal drift), ash (fall + flicker alpha).
* **Trails.** Store the last 8-10 player positions in a ring buffer and draw them back-to-front at
  decreasing alpha and scale; or for a smoother ribbon, draw a quadratic path through them with
  `'lighter'` at alpha 0.12. Trigger trails only above ~70% of top speed, so speed reads as a
  visual state change.
* **Landing dust** should emit horizontally from the feet with a small upward component, scaled by
  impact speed. Emitting it radially is the single most common tell of a first-pass particle system.

### 3.8 Animated water and lava, fog, god rays

**Water / lava surface.** Sum two sine waves of different wavelength and speed so the surface never
visibly repeats:

```js
function surfaceY(x, t, y0) {
  return y0 + 2.5 * Math.sin(x * (2 * Math.PI / 96)  + t * 2.2)
            + 1.5 * Math.sin(x * (2 * Math.PI / 37)  - t * 3.1);
}
// draw: moveTo/lineTo along the surface at 8px steps, close to the bottom, fill with a gradient
```

Then: a 2 px lighter line along the surface itself; a vertical gradient body (more transparent at
the top); for **water**, a second, slower wave drawn at alpha 0.25 with a small x-offset for a
refraction read, plus a `'lighter'` caustic band; for **lava**, a `'lighter'` glow strip 12 px above
the surface, a slow `'multiply'` crust pattern scrolling at a different rate, and embers emitted
upward at 1-3 per second per 96 px of surface. Lava should also tint everything within ~3 tiles with
a cached orange radial `'lighter'` blob -- reflected light on nearby geometry is what makes an
emissive surface look emissive.

**Fog.** Two or three very large, very soft blobs (cached radial gradients, 512 px) scrolling at
0.05-0.12 parallax at alpha 0.04-0.06, plus one thin horizontal band at the horizon. Keep total fog
alpha under ~0.12 or gameplay legibility suffers.

**God rays.** 6-10 long thin parallelograms fanning from the sun position, filled with a linear
gradient from alpha 0.05 to 0, drawn with `globalCompositeOperation = 'lighter'`
(additive, per https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/globalCompositeOperation),
each slowly oscillating its width by a few percent on its own sine phase. Draw them **behind the
tile layer** so they read as atmosphere rather than as an overlay, and additionally draw 2-3 in front
at alpha 0.02 for the dusty-air feel. Cache the fan into a single offscreen canvas and rotate that
canvas rather than rebuilding paths each frame.

### 3.9 Camera: dead zone, look-ahead, damping, platform snapping

Itay Keren's *Scroll Back: The Theory and Practice of Cameras in Side-Scrollers* (GDC 2015;
https://www.gdcvault.com/play/1022243/Scroll-Back-The-Theory-and ; full article at
https://www.gamedeveloper.com/design/scroll-back-the-theory-and-practice-of-cameras-in-side-scrollers )
is the complete taxonomy. The techniques relevant here, quoted from that article:

* **Camera-window**: "Push camera position as the player hits the window edge" -- i.e. a dead zone;
  it "minimizes unnecessary camera motion"
  (https://www.gamedeveloper.com/design/scroll-back-the-theory-and-practice-of-cameras-in-side-scrollers).
* **Lerp-smoothing**: "Continuously reduce the distance between camera and active player using Linear
  Interpolation", with `lerp(a, b, t) = a + t * (b - a)`; it "works well for moderate-speed
  characters but may lag behind extremely fast movement"
  (https://www.gamedeveloper.com/design/scroll-back-the-theory-and-practice-of-cameras-in-side-scrollers).
* **Physics-smoothing**: treat the camera as a physics object with acceleration and deceleration;
  "Better handles rapid direction changes"
  (https://www.gamedeveloper.com/design/scroll-back-the-theory-and-practice-of-cameras-in-side-scrollers).
* **Projected-focus**: "Camera follows the projected (extrapolated) position of the player" --
  look-ahead
  (https://www.gamedeveloper.com/design/scroll-back-the-theory-and-practice-of-cameras-in-side-scrollers).
* **Dual-forward-focus**: "Player direction changes switch camera focus to enable wide forward view",
  keeping separate anchors per direction to avoid thrashing on frequent turns; snapping speed should
  scale with player speed, as Cave Story does with "base snap speed plus current velocity"
  (https://www.gamedeveloper.com/design/scroll-back-the-theory-and-practice-of-cameras-in-side-scrollers).
* **Platform-snapping**: "Camera snaps to the player only as it lands on a platform", which
  "eliminates jarring vertical camera motion during jumps"
  (https://www.gamedeveloper.com/design/scroll-back-the-theory-and-practice-of-cameras-in-side-scrollers).
* **Edge-snapping**: "Set a hard edge for camera positioning" so you never see past the level border
  (https://www.gamedeveloper.com/design/scroll-back-the-theory-and-practice-of-cameras-in-side-scrollers).
* **Region-based anchors**: "Different regions (even within levels) set different anchors for
  position and focus"
  (https://www.gamedeveloper.com/design/scroll-back-the-theory-and-practice-of-cameras-in-side-scrollers)
  -- the right tool for "this room is a vertical shaft, that one is a horizontal corridor".
* **Cue-focus**: "Focus is influenced by game world cues (e.g. attractors)" -- pull the camera toward
  a boss, a switch, or the next checkpoint with a weighted average
  (https://www.gamedeveloper.com/design/scroll-back-the-theory-and-practice-of-cameras-in-side-scrollers).

For vertical handling the article lists three shipped approaches -- a tall camera-window (Shinobi),
a narrow window matched to jump height (Rastan Saga), or "a narrow, centered window plus
platform-snapping for stability while maintaining forward visibility" (Sonic) -- and stresses that
"camera design must align with core mechanics; no universal solution exists across all platformer
types"
(https://www.gamedeveloper.com/design/scroll-back-the-theory-and-practice-of-cameras-in-side-scrollers).

**Recommended composite for this game:**

```js
// 1. dead-zone target
const tx = clampToWindow(cam.x, player.x, CAM_DEADZONE.w);
// 2. look-ahead (projected focus), asymmetric and clamped
const lead = clamp(player.vx * CAM_LOOKAHEAD, -3 * TILE, 3 * TILE);
// 3. vertical: platform-snapping -- follow only when grounded, or when outside a tall window
const wantY = player.grounded ? player.y : clampToWindow(cam.y, player.y, 4 * TILE);
// 4. frame-rate-independent exponential damping (NOT a raw lerp factor)
const a  = 1 - Math.exp(-CAM_K * dt);
const ay = 1 - Math.exp(-(player.grounded ? 14 : 5) * dt);   // snappier on landing
cam.x += (tx + lead - cam.x) * a;
cam.y += (wantY - cam.y) * ay;
// 5. edge-snapping, then shake, applied to the view transform only
cam.x = clamp(cam.x, viewW / 2, level.w - viewW / 2);
```

The `1 - exp(-k*dt)` form is the important detail: a bare `cam += (t - cam) * 0.1` is
frame-rate-dependent, so it behaves differently on a 120 Hz phone than on a 60 Hz one. Apply shake
**after** clamping, as a render-only offset, so shake can legitimately peek past the level edge
without the camera logic fighting it.

---

## 4. Web Audio synthesis with no asset files

### 4.1 Graph and the mobile unlock rule

"If an `AudioContext` is created before the document receives a user gesture, it will be created in
the 'suspended' state, and you will need to call `resume()` after the user gesture", and the
recommended pattern is either resuming on a click or creating the context only on interaction
(https://developer.chrome.com/blog/autoplay/). Detection: "Check `AudioContext.state` after creation.
If playback is permitted, it immediately becomes `running`; otherwise it remains `suspended`. Listen
to the `statechange` event for asynchronous detection" (https://developer.chrome.com/blog/autoplay/).

MDN's autoplay guide confirms that starting a source node "outside the context of handling a user
input event is subject to autoplay rules", and that autoplay is allowed only if the audio is muted,
the user has interacted with the site, the site is allowlisted, or the autoplay Permissions Policy
grants it (https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay). Firefox gates Web
Audio behind sticky activation by default via `media.autoplay.block-webaudio`, default `true`
(https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay).

```js
let actx = null, buses = null;
function unlockAudio() {                      // call from the FIRST pointerdown/keydown
  if (!actx) {
    actx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    const master = actx.createGain(); master.gain.value = 0.8;
    const comp = actx.createDynamicsCompressor();
    comp.threshold.value = -10; comp.knee.value = 12; comp.ratio.value = 6;
    comp.attack.value = 0.003; comp.release.value = 0.12;
    const sfx = actx.createGain(); sfx.gain.value = 0.9;
    const music = actx.createGain(); music.gain.value = 0.55;
    sfx.connect(comp); music.connect(comp); comp.connect(master); master.connect(actx.destination);
    buses = { master, sfx, music };
    // iOS belt-and-braces: play one silent sample
    const b = actx.createBuffer(1, 1, actx.sampleRate);
    const s = actx.createBufferSource(); s.buffer = b; s.connect(actx.destination); s.start(0);
  }
  if (actx.state === 'suspended') actx.resume();
}
addEventListener('pointerdown', unlockAudio, { once: false });
addEventListener('keydown', unlockAudio, { once: false });
document.addEventListener('visibilitychange', () => {
  if (!actx) return;
  document.hidden ? actx.suspend() : actx.resume();     // saves battery, avoids scheduler drift
});
```

The compressor is not optional on mobile: phone speakers clip hard, and a limiter-ish compressor on
the master is what stops a death explosion plus music from turning into a crackle. Also **suspend on
`visibilitychange`**: a suspended context's `currentTime` stops advancing, which prevents the
lookahead scheduler from waking up to a thousand overdue notes.

`latencyHint: 'interactive'` asks the platform for the smallest reliable buffer, which matters
because a 40 ms audio delay on a jump reads as unresponsive controls.

### 4.2 One-shot voice helper

Oscillators and buffer sources are single-use: create, schedule, `stop()`, let them be collected.
Do **not** try to pool them.

```js
function env(node, t, { a = 0.004, d = 0.12, peak = 0.3, sustain = 0, s = 0 }) {
  const g = node.gain;
  g.setValueAtTime(0.0001, t);
  g.exponentialRampToValueAtTime(peak, t + a);
  if (s > 0) { g.setValueAtTime(peak, t + a + s); }
  g.exponentialRampToValueAtTime(0.0001, t + a + s + d);
}
function tone({ type = 'square', f0, f1, dur = 0.12, peak = 0.3, bus = 'sfx', detune = 0, when = 0 }) {
  if (!actx) return;
  const t = actx.currentTime + when;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.detune.value = detune;
  o.frequency.setValueAtTime(f0, t);
  if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  env(g, t, { peak, d: dur });
  o.connect(g); g.connect(buses[bus]);
  o.start(t); o.stop(t + dur + 0.05);
}
function noise({ dur = 0.12, peak = 0.3, type = 'lowpass', freq = 1200, Q = 1, f1 = null, bus = 'sfx', when = 0 }) {
  const t = actx.currentTime + when;
  const n = Math.ceil(actx.sampleRate * dur);
  const buf = actx.createBuffer(1, n, actx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const src = actx.createBufferSource(); src.buffer = buf;
  const flt = actx.createBiquadFilter(); flt.type = type; flt.frequency.setValueAtTime(freq, t);
  if (f1) flt.frequency.exponentialRampToValueAtTime(f1, t + dur);
  flt.Q.value = Q;
  const g = actx.createGain(); env(g, t, { peak, d: dur, a: 0.002 });
  src.connect(flt); flt.connect(g); g.connect(buses[bus]);
  src.start(t); src.stop(t + dur + 0.02);
}
```

Cache one 1-second white-noise `AudioBuffer` at startup and slice it with `start(t, offset, dur)`
instead of generating noise per shot -- filling a Float32Array per spike hit is a measurable cost on
a low-end phone.

### 4.3 Waveform vocabulary

Documented mapping between waveform and role: square for "classic 8-bit arcade jump & laser sounds",
sine for "smooth chimes and coin pickup tones", sawtooth for "aggressive hit sounds and explosion
feedback", with the general technique being "oscillators, noise generators, and frequency sweeps to
produce classic chiptune sounds"; "frequency ramps give tones an upward sweep while gain ramps create
quick fade-out" (https://serverless.tools/retro-sound-generator/). The standard preset set that
covers a platformer's needs is sfxr's: jsfxr exposes "pickupCoin, laserShoot, explosion, powerUp,
hitHurt, jump, blipSelect, synth, tone, click, and random"
(https://github.com/chr15m/jsfxr/blob/master/README.md). If you would rather not hand-tune, jsfxr
lets you design at https://sfxr.me/ , hit "serialize", and paste the JSON into code
(https://github.com/chr15m/jsfxr/blob/master/README.md) -- but the oscillator recipes below have no
dependency and no asset bytes.

### 4.4 Recipes (drop-in)

```js
const SFX = {
  jump() {                                   // square up-sweep + soft body
    tone({ type: 'square',   f0: 320, f1: 560, dur: 0.10, peak: 0.22 });
    tone({ type: 'triangle', f0: 480, f1: 840, dur: 0.09, peak: 0.10, detune: 8 });
  },
  land(impact = 1) {                         // thud + filtered noise
    tone({ type: 'sine', f0: 150, f1: 62, dur: 0.09, peak: 0.24 * impact });
    noise({ dur: 0.07, peak: 0.14 * impact, type: 'lowpass', freq: 900, f1: 320 });
  },
  coin(combo = 0) {                          // two-note blip, the Mario convention
    const s = Math.pow(2, Math.min(combo, 8) / 12);     // +1 semitone per combo step
    tone({ type: 'square', f0: 987.77 * s, f1: 987.77 * s, dur: 0.055, peak: 0.20 });
    tone({ type: 'square', f0: 1318.5 * s, f1: 1318.5 * s, dur: 0.11,  peak: 0.20, when: 0.055 });
  },
  spike() {                                  // crunch + short descending zap
    noise({ dur: 0.08, peak: 0.26, type: 'bandpass', freq: 2600, Q: 1.2 });
    tone({ type: 'square', f0: 900, f1: 190, dur: 0.06, peak: 0.16 });
  },
  spring() {                                 // rising "boing" with an overshoot
    const t = actx.currentTime;
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(1150, t + 0.13);
    o.frequency.exponentialRampToValueAtTime(880,  t + 0.20);
    env(g, t, { peak: 0.28, d: 0.22, a: 0.004 });
    o.connect(g); g.connect(buses.sfx); o.start(t); o.stop(t + 0.3);
  },
  switchOn() {                               // two clean clicks
    tone({ type: 'square', f0: 1200, f1: 1200, dur: 0.028, peak: 0.18 });
    tone({ type: 'square', f0: 1600, f1: 1600, dur: 0.035, peak: 0.18, when: 0.05 });
  },
  death() {                                  // saw fall + vibrato + noise tail
    const t = actx.currentTime;
    const o = actx.createOscillator(), g = actx.createGain();
    const lfo = actx.createOscillator(), lg = actx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(460, t);
    o.frequency.exponentialRampToValueAtTime(58, t + 0.55);
    lfo.frequency.value = 12; lg.gain.value = 30;        // +/- 30 cents-ish wobble
    lfo.connect(lg); lg.connect(o.detune);
    env(g, t, { peak: 0.30, d: 0.58, a: 0.006 });
    o.connect(g); g.connect(buses.sfx);
    o.start(t); lfo.start(t); o.stop(t + 0.65); lfo.stop(t + 0.65);
    noise({ dur: 0.35, peak: 0.16, type: 'lowpass', freq: 1800, f1: 200, when: 0.02 });
  },
  // --- Tetris-style block layer, if the gauntlet includes one ---
  lock() {
    tone({ type: 'triangle', f0: 180, f1: 118, dur: 0.055, peak: 0.22 });
    noise({ dur: 0.035, peak: 0.10, type: 'highpass', freq: 3000 });
  },
  clear(lines = 1) {                         // rising arpeggio, octave up on a tetris
    const base = [523.25, 659.25, 783.99, 1046.5];     // C5 E5 G5 C6
    const mult = lines >= 4 ? 2 : 1;
    base.forEach((f, i) => tone({
      type: 'square', f0: f * mult, f1: f * mult, dur: 0.13, peak: 0.18, when: i * 0.055,
    }));
    if (lines >= 4) noise({ dur: 0.25, peak: 0.10, type: 'highpass', freq: 4000, when: 0.05 });
  },
};
```

**Anti-fatigue rules.** (a) Randomise pitch by +/- 2-4% on every repeated sound (`jump`, `land`,
`coin`) or the ear starts hearing a machine. (b) Rate-limit each sound to one instance per 40-60 ms
and cap simultaneous voices around 8, ducking the `sfx` bus by ~3 dB when more than 4 fire in a
frame. (c) Mix so `death` is the loudest event in the game and everything else sits at least 6 dB
below it.

### 4.5 Looping chiptune with a lookahead scheduler

Never schedule music from `setInterval` or `requestAnimationFrame` alone: "the actual callback of
timer events in JavaScript (through `window.setTimeout()` or `window.setInterval`) can easily be
skewed by tens of milliseconds or more by layout, rendering, garbage collection, and
XMLHTTPRequest and other callbacks" (https://web.dev/articles/audio-scheduling). The pattern from
Chris Wilson's *A Tale of Two Clocks* is a coarse JS timer that schedules precisely into Web Audio's
own clock: "A good place to start is probably 100ms of 'lookahead' time, with intervals set to 25ms",
implemented as "a `setTimeout` interval of 25ms, but a much more resilient overlap: each call will
schedule for the next 100ms" (https://web.dev/articles/audio-scheduling).

The loop and the note advance, verbatim from the article
(https://web.dev/articles/audio-scheduling):

```js
while (nextNoteTime < audioContext.currentTime + scheduleAheadTime ) {
  scheduleNote( current16thNote, nextNoteTime );
  nextNote();
}

function nextNote() {
  var secondsPerBeat = 60.0 / tempo;
  nextNoteTime += 0.25 * secondsPerBeat;
  current16thNote++;
  if (current16thNote == 16) {
    current16thNote = 0;
  }
}
```

The article notes this "decouples tempo changes from pre-scheduled audio events by calculating the
next note time dynamically rather than sequencing everything in advance"
(https://web.dev/articles/audio-scheduling) -- which is exactly what you need to speed the music up
during a timed section, or to pitch-bend it down on death.

Applied to a three-voice chiptune track:

```js
const TRACK = {
  bpm: 132, steps: 64,                       // 4 bars of 16th notes
  lead: [76,0,79,0,81,0,79,0, 76,0,72,0,74,0,76,0, /* ... MIDI notes, 0 = rest */],
  bass: [40,0,40,0,47,0,40,0, 38,0,38,0,45,0,38,0, /* ... */],
  hats: [1,0,1,0,1,0,1,1,     1,0,1,0,1,0,1,1,     /* ... */],
};
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

let step = 0, nextTime = 0, timer = null;
const LOOKAHEAD = 0.100, TICK = 25;

function scheduleStep(i, t) {
  const n = TRACK.lead[i % TRACK.lead.length];
  if (n) tone({ type: 'square', f0: mtof(n), dur: 0.11, peak: 0.10, bus: 'music', when: t - actx.currentTime });
  const b = TRACK.bass[i % TRACK.bass.length];
  if (b) tone({ type: 'triangle', f0: mtof(b), dur: 0.16, peak: 0.16, bus: 'music', when: t - actx.currentTime });
  if (TRACK.hats[i % TRACK.hats.length])
    noise({ dur: 0.022, peak: 0.05, type: 'highpass', freq: 6500, bus: 'music', when: t - actx.currentTime });
}
function scheduler() {
  const spb = 60 / TRACK.bpm;
  while (nextTime < actx.currentTime + LOOKAHEAD) {
    scheduleStep(step, nextTime);
    nextTime += 0.25 * spb;
    step = (step + 1) % TRACK.steps;
  }
  timer = setTimeout(scheduler, TICK);
}
function startMusic() { nextTime = actx.currentTime + 0.05; step = 0; scheduler(); }
function stopMusic()  { clearTimeout(timer); timer = null; }
```

Notes that matter in practice:

* **Use `actx.currentTime` as the only clock** for music. Never derive note times from
  `performance.now()`.
* **`setTimeout` is throttled in background tabs**, so on `visibilitychange` suspend the context and
  reset `nextTime = actx.currentTime + 0.05` on resume. Otherwise the `while` loop tries to schedule
  every missed step at once.
* **Per-level variation for free:** transpose the whole track by a constant number of semitones, swap
  the lead waveform (`square` -> `pulse`-ish via two detuned squares), and change the BPM. Three
  levers give ten levels distinct identities from one 4-bar pattern.
* **Duck the music** by 4-6 dB for 300 ms under a death or a level-complete sting with
  `buses.music.gain.setTargetAtTime(...)`, and apply a lowpass sweep on death (4.6 of section 3.6).
* Give the player a **Music** and an **SFX** slider that write to `buses.music.gain` and
  `buses.sfx.gain`, and persist them in the save (section 5).

---

## 5. Level-select and progression UX for a 10-level gauntlet

### 5.1 What to show, and the death counter question

Celeste's answer is to make failure a badge rather than a punishment: loading screens tell players
"Be proud of your death count! The more you die, the more you're learning", deaths are "presented as
building blocks representing developing skill rather than failures", and "among Celeste's
communities, each player's death count is shared as a badge of honor"
(https://medium.com/@nelltov/celeste-a-master-class-in-level-design-and-player-motivation-8a4c4842869d).
Mechanically, Celeste's chapter-select screen carries a "fewest deaths" tracker, and the end-of-level
screen reports "deaths, strawberries and time"
(https://medium.com/@nelltov/celeste-a-master-class-in-level-design-and-player-motivation-8a4c4842869d).
The structural lesson from the same source is that self-selected difficulty is what makes this work:
"within each level or section of a level, the player has some control over the amount they want to
challenge themselves, with each level having optional strawberries to collect"
(https://medium.com/@nelltov/celeste-a-master-class-in-level-design-and-player-motivation-8a4c4842869d).

Concretely, for ten levels:

**Level card (grid of 10, 2 rows of 5 in landscape, 5 rows of 2 in portrait):**

```
+---------------------------+
|  03   THE SPIKE GARDEN    |   <- number + name
|  [====== thumbnail =====]  |   <- 96x54 baked minimap, generated at build time
|  BEST 00:24.18   * * o     |   <- best time + 3 coin pips
|  GOLD  |  DEATHS 41        |   <- medal earned + total deaths
+---------------------------+
```

* **Per level:** best time (to 1/100 s), fewest deaths in a single clear, total deaths, total
  attempts, medal, coins found, and a `deathless` badge.
* **Global header:** total deaths (large, celebrated, never red or apologetic), total time, levels
  cleared `n/10`, medals `n/30`.
* **State per card:** locked / unlocked / cleared / cleared-deathless / skipped. Locked cards should
  still show the name and thumbnail -- anticipation is free motivation.

### 5.2 Medals and timers

Four tiers on time, which gives a 10-level game 30-40 hours of self-directed replay for almost no
content cost:

| Tier | Threshold | Purpose |
|---|---|---|
| Bronze | 2.0x author time | "you finished it" -- nearly automatic |
| Silver | 1.4x author time | requires knowing the route |
| Gold | 1.1x author time | requires clean execution |
| Author | designer's own best | the real target, shown only after Gold |

Plus two orthogonal badges so players who hate timers still have goals: **Deathless** (clear with
zero deaths) and **All coins**. Celeste's own model of optional collectibles that the player chooses
to chase is the reference
(https://medium.com/@nelltov/celeste-a-master-class-in-level-design-and-player-motivation-8a4c4842869d);
its Golden Strawberries are explicitly deathless-run challenges
(https://celestegame.fandom.com/wiki/Golden_Strawberries_Guide).

**Timer rules.** Start on the first input after the level fades in, not on load. Stop on the goal
touch. On death, reset the timer but keep the attempt count. Show the running timer small and
top-right, and show a ghost "best" delta in green/red only after the first clear -- showing a delta
before the player has a baseline just adds pressure.

### 5.3 Attempts, deaths, and the skip policy

Track both **attempts** (times the level was entered or restarted) and **deaths**: the ratio tells
you which levels are unfair. Ship a debug key that dumps `deaths / attempts` per level and per
checkpoint -- that histogram, not intuition, is what tells you level 7 is broken.

**Recommended skip policy:**

* The skip option **does not exist** until the player has died **20 times on that level**. Before
  that the pause menu shows only Retry / Level Select.
* When it appears, name it honestly ("Skip this trial") and state the cost: the level is marked
  **skipped**, shows a hollow medal, and does not count toward the "cleared without skips"
  completion flag.
* A skipped level stays **replayable and reclaimable** -- clearing it later removes the skip mark.
  This is what keeps a skip from feeling like a permanent scar.
* Skipping never gates content: level `n+1` unlocks either way, and the ending is reachable with
  skips. The completion screen simply lists which trials were skipped.
* Ship a separate, always-available **Assist mode** (extra coyote time, halved spike hitboxes,
  slower hazards, infinite skips) rather than making the skip button the only concession. Flag saves
  that used it, but do not withhold the ending; Celeste's Assist Mode is the widely-imitated model
  here, and the design goal per the motivation analysis is that the player controls their own
  difficulty
  (https://medium.com/@nelltov/celeste-a-master-class-in-level-design-and-player-motivation-8a4c4842869d).

### 5.4 localStorage save format

The dominant advice: "Use localStorage for small saves under 1 MB, IndexedDB for larger data,
include a version number for migration, handle storage errors gracefully, and offer a file export
option so players can back up their progress manually"
(https://bugnet.io/blog/game-save-best-practices-web).

**Limits.** "localStorage has a 5-10 MB limit per origin depending on the browser", "Safari on iOS
enforces a 5MB localStorage quota per origin", and -- the trap -- "Strings are stored as UTF-16, so
each character is 2 bytes; a '5MB' budget is really 2.5 million characters"
(https://bugnet.io/blog/fix-html5-game-localstorage-quota-exceeded-on-safari-ios). A 10-level save
is ~1 KB, so you are nowhere near the limit; you will only hit it if you start storing replay ghosts,
in which case move those to IndexedDB, which "offers 50MB+ on iOS Safari and survives Private
Browsing in most cases"
(https://bugnet.io/blog/how-to-fix-web-game-save-lost-when-localstorage-quota-exceeded).

**Versioning.** "Include a version number in every save. When your save format changes, use the
version to migrate old saves forward, with explicit migration functions between versions. Skipping
the version field is the most common cause of 'I lost my save' complaints in browser games. If you
ship one thing from this post, ship the version field"
(https://bugnet.io/blog/game-save-best-practices-web).

**Shape.** "Deeply nested objects are harder to validate, harder to migrate between versions, and
harder to debug when saves go wrong. Two levels of nesting (a top-level object with nested objects
or arrays) is the sweet spot for most games"
(https://bugnet.io/blog/game-save-best-practices-web).

**Errors.** "Always wrap LocalStorage writes in a try-catch block. Writes can fail for three
reasons: the storage quota is exceeded (the browser throws a `QuotaExceededError`), the user is in
private browsing mode, or a security policy blocks storage", and the target behaviour is that
"Corrupt or unparseable data does not brick the game -- it is reported and recoverable"
(https://bugnet.io/blog/game-save-best-practices-web).

```json
{
  "v": 1,
  "game": "rage-trials",
  "updated": 1758326400000,
  "totals": { "deaths": 0, "attempts": 0, "playMs": 0, "skips": 0, "cleared": 0 },
  "flags": { "assistUsed": false, "noSkipClear": false, "seenIntro": false },
  "settings": {
    "sfx": 0.9, "music": 0.55, "haptics": true, "shake": 1.0,
    "resScale": 1.0, "layout": "auto", "leftHanded": false, "assist": false,
    "jumpZone": { "x": 0.5, "y": 0.55, "w": 0.5, "h": 0.45 }
  },
  "levels": {
    "3": {
      "cleared": true, "skipped": false, "deathless": false,
      "bestMs": 24180, "bestDeaths": 4,
      "deaths": 41, "attempts": 46,
      "medal": "gold", "coins": [true, true, false],
      "firstClearAt": 1758300000000
    }
  }
}
```

```js
const KEY = 'rage-trials.save';
const CURRENT_V = 1;
const MIGRATIONS = {
  // 0: (s) => { ...; s.v = 1; return s; }        // one function per version step
};
function load() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch { /* private mode / blocked */ }
  if (!raw) return fresh();
  let s;
  try { s = JSON.parse(raw); } catch { backupCorrupt(raw); return fresh(); }
  if (typeof s !== 'object' || s === null) return fresh();
  while (s.v < CURRENT_V && MIGRATIONS[s.v]) s = MIGRATIONS[s.v](s);
  if (s.v !== CURRENT_V) { backupCorrupt(raw); return fresh(); }   // from the future: don't guess
  return withDefaults(s);
}
let dirty = false, flushTimer = null;
function save(s) {                            // coalesce: never write inside the game loop
  dirty = true;
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null; if (!dirty) return; dirty = false;
    s.updated = Date.now();
    try { localStorage.setItem(KEY, JSON.stringify(s)); }
    catch (e) { toast(e.name === 'QuotaExceededError' ? 'Storage full - progress not saved'
                                                     : 'Progress could not be saved'); }
  }, 400);
}
addEventListener('pagehide', () => { if (dirty) { dirty = false; try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} } });
```

`backupCorrupt` should copy the unparseable string to `rage-trials.save.broken` before overwriting;
it costs nothing and turns "I lost everything" into a recoverable support case.

**Export / import.** Offer "a file export option so players can back up their progress manually"
(https://bugnet.io/blog/game-save-best-practices-web). A base64 of the JSON in a textarea, with
copy-to-clipboard and paste-to-restore, is enough and avoids download-blocking sandboxes entirely.
Write to the `updated` timestamp on every save so import can warn before overwriting a newer save.

**Write timing.** Write on level complete, on death-count change (coalesced by 400 ms as above), on
settings change, and on `pagehide` -- **not** `beforeunload`, which is unreliable on mobile Safari.
Never call `setItem` inside the fixed step: `localStorage` is synchronous and will drop frames.

---

## 6. Source index

Controller feel and jump math
- GDC Vault, Pittman, *Building A Better Jump*: https://gdcvault.com/play/1023559/Math-for-Game-Programmers-Building
- Talk video: https://www.youtube.com/watch?v=hG9SzQxaCm8
- Slides (PDF): http://www.mathforgameprogrammers.com/gdc2016/GDC2016_Pittman_Kyle_BuildingABetterJump.pdf
- Slide transcription (velocity Verlet pseudocode, space-based form): https://slidetodoc.com/building-a-better-jump-j-kyle-pittman-pirate/
- GDQuest kinematic jump formulas: https://www.gdquest.com/library/kinematic_jump_formulas/
- Jump arc calculator (apex-time and fall-multiplier bands): https://tools.puida.com/creative/gamedesign/jump-arc-calculator/
- Discrete-timestep jump correction: https://github.com/slippylabs/jump-tuner.slippylabs.com
- Maddy Thorson, *Celeste & TowerFall Physics*: https://www.maddymakesgames.com/articles/celeste_and_towerfall_physics/index.html and https://maddythorson.medium.com/celeste-and-towerfall-physics-d24bd2ae0fc5
- Celeste `Player.cs` source: https://raw.githubusercontent.com/NoelFB/Celeste/master/Source/Player/Player.cs and https://github.com/NoelFB/Celeste/blob/master/Source/Player/Player.cs
- Celeste movement/physics summary: https://deepwiki.com/NoelFB/Celeste/2.3-player-movement-and-physics
- Celeste corner-correction behaviour: https://celeste.ink/wiki/Tech and https://forum.godotengine.org/t/corner-correction-like-in-celeste/15784
- Corner correction implementation notes: https://amano.games/devlog/how-to-correct-a-corner
- GMTK *Platformer Toolkit*: https://gmtk.itch.io/platformer-toolkit and comments thread https://gmtk.itch.io/platformer-toolkit/comments?after=71
- Coyote time / buffer windows: https://www.gamejuice.co.uk/articles/coyote-time-input-buffering
- Dawnosaur reference controller: https://github.com/DawnosaurDev/platformer-movement/blob/main/Scripts/PlayerMovement.cs
- Celeste/TowerFall engine ports: https://github.com/bennyfrancis/Celestefall , https://github.com/passiomatic/platformer-physics

Touch controls
- Dadish controls: https://toucharcade.com/2020/01/16/dadish-release-date/ , https://toucharcade.com/games/dadish , https://toucharcade.com/2024/04/26/toucharcade-game-of-the-week-dadish-3d/ , https://dadish.io/
- Super Cat Tales: https://toucharcade.com/2016/11/25/super-cat-tales-review/ , https://www.pocketgamer.com/super-cat-tales/review/ , https://toucharcade.com/2023/05/26/toucharcade-game-of-the-week-super-cat-tales-paws/
- Leo's Fortune: https://www.imore.com/leos-fortune-review , https://www.androidcentral.com/leos-fortune-android-review , https://toucharcade.com/2014/04/28/leos-fortune-review/
- Rayman Jungle Run: https://www.pocketgamer.com/rayman-jungle-run/hands-on-with-rayman-jungle-run-on-ios-and-android/ , https://toucharcade.com/2012/09/19/rayman-jungle-run-review-a-run-away-hit/ , https://www.destructoid.com/reviews/review-rayman-jungle-run/
- Pointer Events (pointerId, capture, multi-touch): https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events
- `touch-action`: https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action
- Hand-rolled HTML5 touch controls: https://www.aaronbell.com/mobile-touch-controls-from-scratch/
- Touch target sizes: https://www.w3.org/WAI/GL/mobile-a11y-tf/wiki/M2 , https://www.uxpin.com/studio/blog/responsive-design-touch-devices-key-considerations/
- Game button sizing / spacing / pressed states: https://inairspace.com/blogs/learn-with-inair/godot-touch-controls-for-mobile-a-complete-practical-guide-1
- Thumb zones: https://parachutedesign.ca/blog/thumb-zone-ux/
- Viewport units: https://csstoolkit.net/blog/css-dvh-svh-lvh-guide/ , https://ishadeed.com/article/new-viewport-units/ , https://www.testmuai.com/learning-hub/viewport-unit-variants-browser-support/
- Orientation lock: https://developer.mozilla.org/en-US/docs/Web/API/ScreenOrientation/lock , https://developer.mozilla.org/en-US/docs/Web/API/Screen_Orientation_API
- Vibration: https://developer.mozilla.org/en-US/docs/Web/API/Navigator/vibrate

Canvas polish
- MDN canvas optimisation: https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas
- High-DPI canvas: https://web.dev/articles/canvas-hidipi
- DPR capping / mobile canvas perf: https://docs.bswen.com/blog/2026-02-21-canvas-performance-optimization/
- Pixel-art canvas scaling: https://7tonshark.com/posts/pixel-art-canvas-resize/
- `globalCompositeOperation`: https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/globalCompositeOperation
- OffscreenCanvas: https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas
- Autotiling bitmask / 47-tile blob: https://jaconir.online/blogs/bitmask-autotile-guide , https://blobsmith.itch.io/blobsmith-lite/devlog/1627776/why-a-blob-autotile-is-47-tiles-and-not-256-we-asked-godot-all-256-times , https://excaliburjs.com/blog/Dual%20Tilemap%20Autotiling%20Technique/ , https://www.redblobgames.com/articles/autotile/claude/
- Parallax: https://justinjerzak.wordpress.com/2014/05/14/javascript-parallax-scroll-canvas-tutorial/ , https://jslegenddev.substack.com/p/how-to-implement-infinite-parallax
- *Juice it or lose it*: https://www.gdcvault.com/play/1016487/juice-it-or-lose , https://www.youtube.com/watch?v=Fy0aCDmgnxg , https://roblog.co.uk/2024/03/juicy-games/
- Hit-stop: https://www.ssbwiki.com/Hitlag , https://sonichurricane.com/?p=1043 , https://critpoints.net/2017/05/17/hitstophitfreezehitlaghitpausehitshit/
- *Juicing Your Cameras With Math*: https://gdcvault.com/play/1023146/Math-for-Game-Programmers-Juicing , https://www.youtube.com/watch?v=tu-Qe66AvtY , http://www.mathforgameprogrammers.com/gdc2016/GDC2016_Eiserloh_Squirrel_JuicingYourCameras.pdf , https://archive.org/stream/GDC2016Eiserloh/GDC2016-Eiserloh_djvu.txt , https://github.com/IronWarrior/UnityCameraShake
- *Scroll Back* cameras: https://www.gamedeveloper.com/design/scroll-back-the-theory-and-practice-of-cameras-in-side-scrollers , https://www.gdcvault.com/play/1022243/Scroll-Back-The-Theory-and

Audio
- *A Tale of Two Clocks* / lookahead scheduling: https://web.dev/articles/audio-scheduling
- Chrome autoplay policy (AudioContext suspended + resume): https://developer.chrome.com/blog/autoplay/
- MDN autoplay guide: https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay
- Waveform-to-role mapping, frequency/gain ramps: https://serverless.tools/retro-sound-generator/
- jsfxr presets and serialisation: https://github.com/chr15m/jsfxr/blob/master/README.md , https://sfxr.me/

Progression and saves
- Celeste death counter / motivation: https://medium.com/@nelltov/celeste-a-master-class-in-level-design-and-player-motivation-8a4c4842869d
- Celeste golden strawberries (deathless runs): https://celestegame.fandom.com/wiki/Golden_Strawberries_Guide
- Save best practices (versioning, nesting, errors, export): https://bugnet.io/blog/game-save-best-practices-web
- iOS Safari localStorage quota: https://bugnet.io/blog/fix-html5-game-localstorage-quota-exceeded-on-safari-ios
- Quota-exceeded recovery / IndexedDB: https://bugnet.io/blog/how-to-fix-web-game-save-lost-when-localstorage-quota-exceeded
