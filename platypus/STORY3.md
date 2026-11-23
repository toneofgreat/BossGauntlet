# PLATYPUS: levels 12 and 13, online names and leaderboards, Level 4 hard mode (owner's brief, binding)

This continues STORY.md (levels 1–5) and STORY2.md (levels 6–11), which have all shipped. The same rules apply:
- Everything is procedural.
- It must be as REAL and polished as the CONTRACT.md budget allows: UHD 620, 60 fps, < 150 draw calls, < 250k triangles.
- It must work with keyboard, mouse and touch.
- A child must always know what to do next.
- Violence stays bloodless.

The owner asked, with "ultracode", for more realism, more music and sound effects, and better gameplay across the whole game.

## Bugs reported by the owner (fix first, release straight away)
1. **The scream stops working at the end of level 11.** At the end of level 11 (Wobble teaching the scream), letting go of the scream button leaves the scream unusable. The player has to restart the level. The scream must charge, release, cool down and charge again, every time, with button, key and touch, and the lesson must always be finishable.
2. **Double-click zooms in.** Double-clicking or double-tapping in ANY level must not zoom the camera or the page. Kill the double-tap page zoom (touch-action, dblclick preventDefault, viewport), and remove any camera "zoom on dblclick" behaviour.

## Level 12: the volcano
1. You travel to a volcano and do a spell to dream there.
2. You have a dream (in it, you reach Pip and wake Pip up).
3. You wake up yourself.
4. You fight the VOLCANO BOSS. It must be just INSANE: huge, multi-phase, lava, eruptions, its own music.
5. You give Pip the potion (the LIVING POTION from level 11).
6. You use the wind to do another dance with Pip (like the show tricks, a rhythm duet in the wind) and fly all the way back to the jungle.
7. You eat at the jungle camp with Pip, then play with Pip in the morning, at noon and at night (three different light moods with three different games).
8. You go to bed. You wake in the middle of the night and Pip is missing. -> main screen.

## Level 13: the farlands
1. You go into the woods alone and fight the wolves that are holding Pip.
2. You go to sleep together, then play in the morning.
3. At the end of the day, after playing in a restricted area, you find a rock that says **FAR LANDS PORTAL**.
4. You show it to all the platypie. The oldest says you need to be a god to go there and make it out alive.
5. You solve the PUZZLE and enter the portal. Nothing happens and you get knocked back out.
6. The next day Pip has babies, and you care for them.
7. The next day the babies are evil robots with superpowers. You have to run, but where? You have the idea to go back through the portal.
8. You go through and get knocked back out. Everyone was just standing there the whole time and never came in after you. It was the farlands ILLUSION. Only 3 SECONDS had passed, though it seemed like 3 days.
9. You close the portal and start building a platypus HOUSE, with help from the others (a real building mechanic).
10. Once it's finished, everyone gets to sleep somewhere safe and cozy. TO BE CONTINUED (end for now). -> main screen.

Main screen: 13 circles. Colours for 12 and 13 are our choice (suggested: 12 orange/lava, 13 purple).

## Names (owner)
- The player can set and change their name whenever they want (from the main screen).
- Names can't be curse words. Use a strong filter: leetspeak, spacing, repeats, substrings, in several languages. Enforce it on the server too where possible.
- A name can't be one any other player has used, now or in the past. Names are unique forever and case-insensitive, and a name is never freed when someone renames.

## Leaderboards (owner)
- Speedrun top 100 for levels 1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12 and 13. Each shows the player's name and time. Level 4 has no speedrun board.
- Level 4: top 100 MOST COINS.
- The leaderboard screen is on the main screen.
- The run timer counts from level start to level complete. It shows in the HUD during a run, along with a personal best.
- Fair play: basic sanity checks, such as a minimum plausible time per level and a max coins per run. Use a server-side check (Postgres function / RLS) so the anon key can't post absurd scores.

## Level 4 hard mode (owner)
- After beating level 4 FIVE times, HARD MODE unlocks for level 4 (so you can earn more coins).
- Hard mode is way faster. The trick buttons are spread all over the screen in fixed places (they don't move), but the moving lane/indicator at the bottom (the normal thing) moves WAY faster. There are MORE buttons, and more coins are paid.
- Hard-mode coins count on the coins leaderboard; mark hard-mode entries.

## Backend: Supabase (owner chose it)
- The owner has not created the project yet. Build everything against `src/online-config.js`, which exports `SUPABASE_URL` and `SUPABASE_ANON_KEY`, both empty for now.
- Use the plain REST API (PostgREST over fetch, no SDK, no new CDN).
- With no config, the game must work fully offline: names save locally, and boards say "Leaderboards coming soon". It must never error.
- Write `platypus/supabase/schema.sql`, ready for the owner to paste into the Supabase SQL editor. It needs:
  - tables
  - a unique index on lower(name)
  - a names-ever-used table
  - RLS
  - RPC functions for claim_name / rename / submit_time / submit_coins, with validation and a profanity check
  - top-100 views
- Write `platypus/supabase/SETUP.md` with child-simple steps.
