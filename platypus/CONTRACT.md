# PLATYPUS — module contract

A standalone browser game served statically from `platyfy.com/platypus/` (GitHub Pages, no build step,
no server). Plain ES modules. three.js is vendored: `import * as THREE from "../vendor/three.module.js"`
(from files in `src/`). No other dependencies, no CDN, no external assets: every mesh, texture and sound
is generated in code (canvas textures, procedural geometry, WebAudio synthesis).

## The game (what the player sees)

1. Start screen: dark, calm, with one small circle that says **LEVEL 1**. Click/tap it.
2. Screen goes black, the word **TUTORIAL** appears, then the screen fades to white and the white clears
   to reveal the world.
3. World: an endless ground completely covered with big white cushions. Each cushion is about 3x the size
   of the player character. The cushions must look amazing and real: pillowy curves, piped seams, button
   tufts, soft fabric shading, they sink and bounce back when walked on.
4. The player is a very realistic platypus (dense brown fur, leathery duck bill, flat beaver-like tail,
   webbed feet, small eyes, venom spurs on the hind ankles). Beautiful walk cycle (low sprawling
   lateral-sequence gait, body and tail sway) and a satisfying jump (crouch, launch, tuck, land squash).
5. Every footstep on a cushion makes a great soft cushion sound (synthesised).
6. A wizard greets you, talks (speech bubbles + synthesised voice blips) and teaches, in order:
   move -> jump -> ANKLE STING a training dummy (melee, the venom spurs on the hind ankles) ->
   ELECTRO PULSE: send electromagnetic energy through water; each attack hits exactly ONE training dummy
   standing in the water (three dummies, so three attacks).
7. Then a human appears and you fight them with both attacks. Beat the human -> **LEVEL 1 COMPLETE**.
   That is the only level.

## Hard constraints

- Target machine: an 8 GB laptop with Intel UHD 620 integrated graphics. Must hold 60 fps at 1280x720.
  Budget for the WHOLE scene: < 150 draw calls, < 250k triangles, one directional shadow map (1024) at
  most, no post-processing passes, no per-frame canvas-texture redraws, no per-frame geometry rebuilds
  (animate with transforms, bones, or vertex shaders/`onBeforeCompile`). Use InstancedMesh for anything repeated.
- Cap `renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5))`.
- No allocations in per-frame `update` paths (reuse vectors).
- Works with keyboard + mouse AND touch (phone). The integrator owns input; modules never add listeners.
- Units: metres-ish. +Y up. Ground cushion tops are near y = 0. The platypus is about 1.0 long
  (bill tip to tail tip), 0.3 tall at the back, and faces +Z in its local space. Cushions are about
  3.0 x 3.0 in plan and about 0.7 tall at the crown. The human is 1.75 tall, faces +Z locally.
  The wizard is about 1.9 tall with hat, faces +Z locally. Dummies about 1.3 tall.
- Each module file must pass `node --check`. Do NOT launch a browser or puppeteer in the build phase
  (the machine runs out of memory when several run at once); the integration phase does visual testing.
- Modules never touch the DOM except by creating offscreen canvases for textures. Only `main.js`/`ui.js` own the DOM.
- Every module exports exactly the factory below and returns exactly this shape (extra fields are fine).
  All `update` functions take `dt` in seconds (already clamped to <= 0.05 by the caller).

## Modules (all in `platypus/src/`)

### cushions.js
`export function createCushionField(THREE, { renderer })` ->
- `group` : Object3D to add to the scene (instanced cushions + the dark gap floor underneath).
- `update(dt, focusX, focusZ)` : recentre the endless field on the focus point (cushions wrap around on a
  grid, so the field is endless), advance the squish springs.
- `heightAt(x, z)` -> number : top surface height at a world point INCLUDING the current squish (cheap, analytic).
- `press(x, z, force)` : something pushed down here (force 0..1 footstep, up to 3 for a landing); the
  cushion under that point dips and springs back with a soft overshoot. Must be visible.
- `SPACING` : grid pitch (about 3.05).
Looks: each cushion is a rounded-square pillow (superellipse plan, domed crown, pinched corners, a piped
seam around the equator, four or five button tufts that dimple the surface, faint fabric weave and soft
wrinkle normal detail from a generated normal/roughness map). Slight per-instance variation (rotation by
tiny angle, scale +-4%, warm/cool white tint) so the field does not look stamped. Squish is done per
instance in the vertex shader (instanced attribute) so there are no geometry rebuilds. Receives shadows.
Distant cushions fade into white fog (the integrator sets `scene.fog` white).

### platypus.js
`export function createPlatypus(THREE)` ->
- `group` : Object3D, origin on the ground under the body centre, facing +Z.
- `update(dt, s)` where `s = { speed, maxSpeed, grounded, vy, turn, moving, time }` (speed in m/s,
  vy vertical velocity, turn = signed yaw rate rad/s). Drives walk cycle, idle breathing, jump poses.
- `onFootstep = null` : settable callback `(footIndex, localX, localZ, strength)` fired at the moment
  each foot plants during the walk (footIndex 0..3 = FL, FR, HL, HR).
- `jump()` : start the crouch->launch pose. `land(impact)` : landing squash (impact 0..1).
- `sting()` -> duration seconds : ankle-sting attack animation (spins/kicks a hind leg forward-sideways,
  the ankle spur flashes). `stingHitTime` : seconds into the animation when the hit lands.
- `zap()` -> duration seconds : electro pulse animation (bill dips to the water, body bristles, bill
  glows blue). `zapFireTime` : seconds into the animation when the pulse leaves the bill.
- `hurt()` : flinch. `celebrate()` : looping happy pose until `update` sees movement.
- `billTip` : Object3D at the bill tip; `spurL`, `spurR` : Object3D at the hind ankle spurs (for fx).
- `radius` : collision radius (about 0.35).
Looks: anatomically careful platypus. Streamlined flattened body built from a lofted/lathe-like
custom BufferGeometry (not a pile of spheres), broad flat paddle tail with fur, soft dark leathery bill with
nostrils and a frontal shield, tiny bright eyes with a groove behind them, short sprawled legs, front feet
with big webbing past the claws, hind feet with the spur. Fur: shell/fin-less approach that is cheap,
e.g. a generated fur albedo+normal texture with anisotropic streaks, rim lighting via `onBeforeCompile`,
darker brown back, pale cream belly, wet sheen. Casts shadows. Under 30k triangles, under 12 draw calls.
Walk: lateral-sequence sprawling gait, diagonal support, spine lateral undulation, head counter-sway,
tail drag-sway, feet actually lift, reach and plant (stride scaled by speed so feet do not skate),
body bob. Jump: anticipation crouch, launch stretch, mid-air tuck with feet splayed, landing squash and settle.

### audio.js
`export function createAudio()` -> (WebAudio; create the AudioContext lazily in `resume()`)
- `resume()` : call from a user gesture. Safe to call repeatedly.
- `setListenerMuted(bool)`.
- `cushionStep(strength = 0.6, pan = 0)` : THE signature sound. A soft, deep, satisfying cushion
  footfall: low padded thump + airy "pff" of the filling compressing + faint fabric rustle + tiny spring
  creak, randomised every call so it never repeats exactly. `cushionLand(impact)` : bigger "whumpf".
- `jump()`, `sting()`, `stingHit()`, `zapCharge()`, `zapFire()`, `zapHit()`, `dummyHit()`, `humanHit()`,
  `humanSwing()`, `playerHurt()`, `wizardBlip(pitch = 1)` (one syllable of gentle old-wizard gibberish),
  `wizardAppear()`, `uiClick()`, `introBoom()` (the cut to black), `introRise()` (fade to white),
  `objective()` (small success chime), `victory()` (fanfare).
- `startAmbience()` / `stopAmbience()` : very quiet airy pad + a slow gentle generative melody.
All sounds go through a master compressor/limiter; nothing clips; total loudness comfortable.

### wizard.js
`export function createWizard(THREE)` ->
- `group` (origin at feet, faces +Z), `update(dt, time)`, `setTalking(bool)` (jaw/beard/hand gestures),
  `gesture(name)` with `"wave" | "point" | "cast" | "cheer"`, `lookAt(x, z)` (turn head and body smoothly
  toward a world point), `appear()` (puff-in scale animation), `staffTip` : Object3D (glowing orb).
Looks: kindly old wizard, tall pointed crooked hat with a wide brim, long layered robe with a cloth
texture and star embroidery, big flowing white beard, bushy brows, expressive hands, wooden staff with a
softly pulsing crystal. Proper lofted/lathed geometry, not primitives stuck together. Idle sway and
robe/beard secondary motion. Under 20k triangles, under 14 draw calls. Casts shadows.

### actors.js
`export function createDummy(THREE)` ->
- `group` (origin at base), `update(dt, time)`, `hit(dirX, dirZ, strength)` (rocks back on its spring
  post and wobbles), `shock()` (electrocuted: blue flicker + rapid shake for ~0.8 s), `defeat()` (topples
  / pops its straw, then stays down), `reset()`, `alive` (bool), `radius`.
  Looks: classic straw-and-burlap training dummy on a wooden post with a painted target, stitched face.
`export function createHuman(THREE)` ->
- `group` (origin at feet, faces +Z), `update(dt, s)` with `s = { speed, time }` (walk/run cycle blends
  by speed), `windup()` -> seconds until the strike lands, `strike()` (stomp/swat down at the ground in
  front), `hurt(dirX, dirZ)`, `stung()` (hops holding the leg, green venom tint pulse), `shocked()`
  (jitter, hair on end, blue flicker), `defeat()` (falls over backwards onto the cushions and stays),
  `taunt()`, `radius`, `height`.
  Looks: a believable stylised-realistic adult in outdoor clothes (hat, jacket, trousers, boots) holding
  a butterfly net; proportions correct, joints articulated (hips, knees, shoulders, elbows, neck), smooth
  lofted limbs rather than boxes. Under 20k triangles, under 16 draw calls. Casts shadows.

### fx.js
`export function createFx(THREE)` ->
- `group`, `update(dt, time)`.
- `createWater(x, z, length, width, yawRad)` -> `{ mesh, contains(x, z) -> bool, surfaceY }` : a shallow
  water channel/pool lying in the valley between cushions; realistic animated water (vertex-shader
  ripples, fresnel, sky reflection tint, soft edges). `rippleAt(x, z, strength)`.
- `electroPulse(fromVec3, toVec3, onArrive)` : a visible electromagnetic pulse that travels THROUGH the
  water from the bill to the target in about 0.35 s (branching flickering blue-white arcs under and on the
  surface, expanding field rings, a point light flash), then calls `onArrive()`.
- `stingBurst(vec3)` (green venom splash + spark), `hitBurst(vec3, colorHex)`, `cushionPuff(x, y, z, strength)`
  (a few soft white fibres/dust motes puffing up from a footstep; pooled, cheap),
  `ring(x, z, colorHex)` (expanding ground marker used to show targets), `clear()`.
All particles pooled in one or two InstancedMesh/Points; nothing allocated per effect.

### Owned by the integration phase
- `index.html`, `src/main.js` (renderer, scene, lights, white fog, loop, camera, input, physics),
  `src/ui.js` (start circle, black/TUTORIAL/white intro, speech bubble, objective text, health bars,
  touch buttons, victory screen), `src/game.js` (tutorial script and combat rules).

## Gameplay rules (integrator)

- Move: WASD / arrows / left-side touch stick, camera-relative. Jump: Space / touch button.
  Ankle Sting: J or left mouse / touch button. Electro Pulse: K or right mouse / touch button.
- Third-person follow camera, slightly above and behind, smooth; mouse drag / right-side touch drag orbits.
- Platypus walks ON the cushion surface: `y = cushions.heightAt(x, z)`, footsteps call
  `cushions.press`, `audio.cushionStep`, `fx.cushionPuff`.
- Electro Pulse only works when the platypus is standing in water AND a living target is in the same
  water; it hits exactly one target per attack (the nearest), 1.2 s cooldown. Otherwise the wizard hints.
- Ankle Sting: short range (about 1 m) in front/side, 0.6 s cooldown; on the human it also applies venom
  (slowed for 3 s).
- Human fight: human has 100 hp, sting = 12, pulse = 25 (human must be lured into the water). The human
  chases and swats with the net (telegraphed windup, dodge by moving/jumping), player has 5 hearts and
  simply respawns the fight (not the tutorial) at 0 hearts. Fair and beatable by a child.
- Victory: human falls over, wizard cheers, **LEVEL 1 COMPLETE** with a "Play again" button.
- Debug seam for tests: `window.__platy = { state(), skipTo(stepName), win() }`.
