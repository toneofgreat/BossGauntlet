# PLATYPUS — levels 6 to 11 (owner's brief, binding)

Continues STORY.md (levels 1-5, shipped). Same rules: everything procedural, as REAL and polished as the
performance budget in CONTRACT.md allows (Intel UHD 620, 60 fps, < 150 draw calls, < 250k triangles,
one 1024 shadow map, no post-processing, no per-frame allocations), keyboard + mouse + touch, a child
must always know what to do next. The owner asked for a LOT of realism, great sound effects, and
THE BEST MUSIC EVER: an adaptive score with intense combat music and chill music (see "Music").

Tone: an adventure story with real stakes. Fighting is stylised and bloodless: enemies are knocked out /
drop and fade or turn into platypuses; no gore, no gratuitous cruelty. Deaths in the story are handled
with restraint, as in level 5.

Recap of where level 5 ended: your friend Pip leapt through the zoo glass and fell still; you were put to
sleep; Wizard Wobble said there is still hope; you saw Pip alive in a cell over lava under a timer reading
8 DAYS; Wobble taught Tail Slap and Hold. The countdown to Pip runs through these levels (5 DAYS, 3 DAYS).

## Main screen
Now eleven level circles (wraps on phones, still small circles). Level N+1 unlocks by beating level N;
after every level the game returns to the main screen. Colours: 1 grey, 2-4 blue, 5 white (owner's
choice, unchanged); 6-8 green, 9-10 red, 11 gold (our choice — owner did not specify).
progress.js keeps LIVE_RELEASED so unfinished levels stay locked on platyfy.com; a save from the
5-level version must load correctly.

## Level 6 — another dream
You are in another dream with Wizard Wobble (dream space: surreal, beautiful, e.g. the cushion world
at night under stars, or islands of cushions floating in a nebula). He teaches you:
1. How to fight to kill: finishing combos with sting, pulse and tail slap against dream-soldier dummies
   (they dissolve into mist).
2. POTIONS: brewing/collecting and throwing potions; the key one turns a DEAD HUMAN into a LIVING
   PLATYPUS (a fallen dream-soldier, splash of potion, a wonderful transformation, a new platypus sits up
   and follows you). Practise until you have a small group.
Ends as the dream fades. -> main screen.

## Level 7 — the circus
You wake up in a CIRCUS (cage wagon, big top, ring, lights, performers' area, night). You must ESCAPE:
sneak and fight past the GUARDS (stealth with vision cones and patrols, distractions, or knock-outs),
reach a HELICOPTER and STEER it (a real, learnable flight model: lift, tilt, wind, obstacles — big top
masts, wires, searchlights). It is meant to be hard: the player may have to replay the level over and
over to learn; restarts must be fast and fair (checkpoints: caught -> back to the last checkpoint).
Then fly out over the land and into a JUNGLE (crash-landing or rough landing at the end). -> main screen.

## Level 8 — the scream
1. Playable/interactive FLASHBACKS of your time with Pip (short, dreamy, re-using the zoo: playing,
   tricks, sleeping side by side).
2. You wake in the jungle; guards have found you and are taking you away.
3. You uncontrollably make a NOISE so loud it kills all the guards (a huge shockwave: sound drops out,
   ring of force flattens grass and leaves, birds burst from the trees). You do not know how you did it.
4. You escape into the jungle (a showpiece environment: dense layered vegetation, giant trees, vines,
   river, mist, shafts of light, insects/birds, night-and-day mood).
5. You hear a strange noise in the jungle and investigate (follow the sound: audio-led tracking with a
   subtle visual aid). It was a platypus. It leads you to a whole hidden tribe: a bunch of platypuses
   (the owner's word: "platypie"). -> main screen.

## Level 9 — the tribe
You get introduced to the tribe (camp/village by a river: burrows, fires, totems, elders, young ones),
get food, go HUNTING/raiding against other platypus tribes with your new friends (group skirmishes),
and craft ARMOR (gather materials, make and wear it — visible on your platypus). You sleep and have a
dream that says **5 DAYS**, showing Pip in the cell. -> main screen.

## Level 10 — the military base
You go into a MILITARY base with your tribe friends. It is dangerous: soldiers have GUNS, you can die
easily and have to restart (fast, fair checkpoints), and you lose a bunch of your friends (shown with
restraint, it should hurt). Then you get WEAPONS, SUITS and GLASSES (visible gear on the platypus,
new ranged/melee abilities, a HUD change with the glasses), fight more soldiers to escape, and return
to the campsite. -> main screen.

## Level 11 — the Platypus King
1. A dream that says **3 DAYS...** then a voice: **"Wait, don't go! Your power is within you."**
   It fades to black; this time you do NOT see Wizard Wobble.
2. You wake to fight the army again (the tribe camp is attacked / you take the fight to them), and you
   build a PLATYPUS ARMY from the men you defeat, using the potion from level 6 (each fallen soldier
   becomes a platypus that fights for you; the army visibly grows).
3. BOSS: the PLATYPUS KING (huge, crowned, armored; multi-phase, readable attacks, a real boss fight
   with its own music).
4. When beaten he drops down and leaves a potion labelled **LIVING POTION**, and a paper that says
   **NEVER APPROACH THE FARLANDS** — but you cannot read, so you do not care (show the paper as
   scribbles from the platypus's point of view, with the real text briefly visible to the player), and
   you decide to go and look for your friend.
5. You set off ... and get SHOT (sudden, cut to black).
6. A dream: Wizard Wobble teaches you how to do the insanely loud noise on purpose (the SCREAM becomes
   a controllable ability with charge and cooldown; practise it).
7. Fade to black. TO BE CONTINUED. -> main screen. End for now.

## Music (owner: "the best music ever", intense and chill)
A real adaptive score, synthesised in WebAudio, composed with care — memorable themes, proper harmony,
bass, drums, counter-melody, builds and drops, clean mix through the master limiter:
- leitmotifs: the platypus theme, Pip's theme (tender; reused sadly), Wobble's motif, the King's theme;
- states that crossfade on the beat: chill/explore, stealth/tension, combat (intense, driving), boss
  (bigger, phases), flight (soaring), dream (ethereal), victory and defeat stingers, flashback (music box);
- intensity 0..1 layers within each state, driven by gameplay.
Also give levels 1-5 fitting music through the same system if it is cheap to hook up without risk.
