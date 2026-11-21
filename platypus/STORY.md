# PLATYPUS — levels 2 to 5 (owner's brief, binding)

Level 1 (shipped) is the cushion-world tutorial. This adds four story levels, a level-select main screen,
and saved progress. Everything must look and feel as REAL and as polished as we can make it within the
performance budget in CONTRACT.md (Intel UHD 620, 60 fps, < 150 draw calls, < 250k triangles visible,
one 1024 shadow map, no post-processing passes, no per-frame allocations or texture redraws).
All art, animation and sound is procedural (no external assets). Audience: a child. Text is short, warm
and readable. The player must always know what to do next (objective line, glowing markers, hints).

## Main screen and progress
- The main screen (the dark start screen with the LEVEL 1 circle) becomes the level select: five small
  circles, LEVEL 1 .. LEVEL 5, in a row/arc (wraps nicely on a phone). BUTTON COLOURS (owner's explicit
  request): Level 1 stays GREY exactly as it is today; Levels 2, 3 and 4 are BLUE; Level 5 is WHITE.
  Locked levels show their colour dimmed/desaturated with a small padlock and do nothing but a gentle
  shake. Unlocked levels show the full colour with a soft pulse. Beaten levels keep their colour and get a
  small tick, and can be replayed.
- Level N+1 unlocks when level N is beaten. Progress persists in localStorage (wrap in try/catch; the game
  must work without storage).
- EVERY time a level is beaten the game returns to this main screen, where the newly unlocked circle
  does a satisfying unlock animation (grey -> lit, padlock pops off, chime).
- Level 1's victory now ends with a "Continue" button that returns to the main screen (Level 2 unlocks).

## Level 2 — "The Chaos Realm"
1. Selecting it: fade to black, title card **LEVEL 2 — THE CHAOS REALM**, the text fades away.
2. Waking up: a beautiful first-person view through ONE eye opening — realistic eyelid blink (soft curved
   lids with lashes/fur edge, blur clearing, light adaptation, a few slow blinks, the view sways as the
   head lifts). What you see while waking: your zoo home, and another platypus peering at you.
3. A realistic in-engine cutscene (letterboxed, directed camera cuts and moves): you are a platypus in a
   zoo habitat; a platypus friend comes over and plays with you (nudges, circles, play-bows, splashes).
   Skippable with a hold-to-skip.
4. The zoo habitat (a showpiece, used by levels 2, 3, 4 and 5): a naturalistic enclosure with beautiful
   layered rocks and boulders, a clear pool and stream with a little waterfall, fish swimming in the water,
   reeds/ferns/moss/logs, a sandy bank, a cosy burrow/nest, a thick glass viewing wall with zoo visitors
   on the other side, a keeper door, zoo signage, lamps, sky and trees beyond the walls.
5. Fun quests with the friend (several, varied, each a small real mechanic), e.g. follow-the-friend
   race over the rocks, hide and seek, dive for fish / shiny things in the pool, play ball together.
   Completing them fills a friendship meter until you BECOME FRIENDS (a warm moment; the friend gets a name).
6. You get fed (the keeper brings food: worms/yabbies in a bowl; eating animation and sounds).
7. Cool tricks: you learn and perform tricks (spin, backflip, tail stand, ball balance, water leap...) with
   simple, satisfying inputs; visitors at the glass gather, react, clap and throw/drop coins — you get PAID
   money for tricks people see you do (a coin counter; more watchers and combos = more money).
8. Ending: the camera zooms into a poster on the wall: **PLATYPUS TRICKS — IN 2 DAYS**. Next to it, to the
   left and a little lower, a small poster: **WHY DID THE PLATYPUS CROSS THE ROAD?** — if the player clicks
   it, it falls off the wall (physical swing, flutter, drop) and behind it you can just make out the answer:
   **TO GET TO PLATYFY**. Then the level completes -> main screen.

## Level 3 — another day (unlocks after 2)
Another normal, amazing day with your friend in the habitat: new and different quests from level 2 (new
games, a new trick or two, more feeding, more coins, different time-of-day light: morning -> golden evening).
Practise for the show. At the end of the day the poster is shown again: **1 DAY LEFT**. -> main screen.

## Level 4 — the show (unlocks after 3)
The big PLATYPUS TRICKS show/concert: an amazing arena/stage — spotlights, a packed cheering crowd,
music that follows your performance, hoops, a pool, platforms, confetti. You and your friend perform
amazing tricks (rhythm/timing + trick combos, crowd-excitement meter, money raining). Right after the
concert you are taken back to the habitat you live in (short cutscene). -> main screen.

## Level 5 — the happiest day (unlocks after 4)
1. One more normal day — the happiest day ever with your friend: the best-of fun activities, free play,
   warm light. About ten minutes of fun at most (do not pad; it may end sooner when the quests are done,
   but it must feel generous and joyful).
2. For once, you fall asleep right next to each other. Fade to black.
3. You wake (the eye-blink again, at night, red alarm light): screaming, people running around outside
   the glass. You are taken out of your home and carried away (first-person / over-the-shoulder).
   Your friend jumps THROUGH THE GLASS to save you (slow-motion shatter) ... and dies. Handle this with
   restraint: no blood, no gore — the friend lies still, the sound drops away, sad music. It must land
   emotionally. You are put to sleep (vision closes).
4. In the dark you see Wizard Wobble again for a moment. He says: **"There is still hope. The platypus
   will survive."**
5. The camera zooms upward: a timer reading **8 DAYS** above a jail cell; your friend is inside the cell
   (alive, curled up); there is LAVA underneath the cell. Realistic lava (flowing, glowing, heat haze kept
   cheap), dark rock cavern, chains.
6. Training: the wizard teaches two new moves — **TAIL SLAP** (slap with your tail, hard as wood; practise
   on a dummy) and **HOLD** (pick up, carry and drop/throw things; the test item is a small cushion).
7. After the training, fade to black. **TO BE CONTINUED**. -> main screen. That is the end for now.
