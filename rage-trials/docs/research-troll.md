# Research: Troll Platformers, Luck Levels and Obby Tycoons

Implementation notes for levels 8 (ultimate obby tycoon), 9 (ultimate troll) and 10 (luck + skill + tycoon + trolls) of a 2D side-scrolling canvas platformer with 32px tiles.

Every factual claim below carries its source URL. Anything marked **[derived]** is arithmetic or a design proposal built on top of the cited facts, not a claim about an existing game.

---

## 0. The one sentence that governs everything

> "the difference between a bad troll setup and a good one is the difference between having a literal can of garbage dumped on your head versus a really well-planned surprise party" — Defender1031, Mario Maker troll designer (https://egmnow.com/these-super-mario-maker-level-designers-have-elevated-trolling-into-an-artform/)

Troll levels are pranks "except the prankee is in on the joke", and they are designed to be social rather than played alone (https://kaizomariomaker.fandom.com/wiki/Troll_Level). The test for every trap we ship: *does the player laugh and immediately press retry, or do they close the tab?*

Level Devil is the current gold standard for this and its humour is purely structural — "The platformer is as funny as they come without a word of dialogue" — because "you suddenly realize how much game design is centered around expectations until they get messed with" (https://www.gamespot.com/articles/level-devil-is-a-giant-hilarious-middle-finger-to-you/1100-6530177/).

---

## 1. Catalogue of trolls, ordered mild → evil

Each entry: **what it is** / **telegraph** / **why it stays funny** / **impl note** for a 32px tile grid.

Design convention used throughout: a tile is 32px, the player is ~24×30px (just under a tile wide so it slips through 1-tile gaps), and the camera scrolls left-to-right. **[derived]**

### Tier A — Mild (the player laughs on the first death, loses < 2 seconds)

**1. The fake floor (collapsing ground tile)**
Ground that looks identical to real ground and falls away into a pit the moment you stand on it. This is the founding troll of the genre: Syobon Action ships "normal-looking ground tiles that fall away into pits" (https://en.wikipedia.org/wiki/Syobon_Action), and Level Devil's Level 1 exists purely to teach the rule that "the obvious floor is often a lie, as floors can collapse or open into pits when you commit" (https://causalzap.com/en/blogs/level-devil-levels-1-16/).
*Telegraph:* none visually — but the first instance must be placed above a shallow ledge or a checkpoint, not a death pit.
*Why funny:* it re-codes the single assumption every platformer player has. It is the joke the whole level is built on.
*Impl:* tile flag `FAKE`. On `onPlayerLand`, start a 0-frame or N-frame timer, then swap tile to air and spawn a falling debris sprite. Store the original state so respawn restores it.

**2. The crumbling platform (shake, then fall)**
Same as above but with a warning. "Crumbling platforms appear solid at first but once the player steps on top of one it will begin to shake, sag, descend, and after a few seconds disappear entirely" and "visual cues such as cracks or sound can warn the player, though the safe window is still very short" (https://tvtropes.org/pmwiki/pmwiki.php/Main/TemporaryPlatform). Spelunky 2's loose platforms shake before falling (https://spelunky.fandom.com/wiki/Falling_Platform_(HD)).
*Telegraph:* 8–12 frames of 1px shake + a crack sprite + a click SFX.
*Why funny:* it is the honest cousin of #1, and its honesty is what makes #1 land later. Falling/breakaway platforms "punish hesitation" (https://tvtropes.org/pmwiki/pmwiki.php/Main/TemporaryPlatform).
*Impl:* three-state tile — `SOLID → SHAKING(t) → GONE`, respawn after 2s if the player didn't die, so a retry isn't blocked.

**3. The hole that opens in front of you**
The floor is fine; a 2-tile gap punches open one tile ahead as you run. Level Devil: "Holes appear without warning, and some platforms wait for you to trust them" (https://en.namu.wiki/w/Level%20Devil).
*Telegraph:* the second time you use it, give a 4-frame seam animation. First time, nothing.
*Why funny:* it turns *running confidently* into the mistake, which inverts the previous ten seconds of play.
*Impl:* an invisible `TriggerRegion` that removes tiles from the tilemap and pushes a "tiles removed" entry onto the level's reset list.

**4. Pop-out ground spikes**
Spikes fire up out of flat ground when you step near. Level Devil Level 2: "ground spikes pop when you approach certain tiles" (https://causalzap.com/en/blogs/level-devil-levels-1-16/). Trap Adventure 2 does the same: "Spikes can be out in the open or appear from under the bricks" (https://soranews24.com/2018/02/07/the-newest-game-to-drive-you-up-the-wall-is-out-introducing-trap-adventure-2-%E3%80%90video%E3%80%91/).
*Telegraph:* a 6–8 frame rise animation so a running player can still jump it if they react. That reaction window is the entire difference between a prank and a cheap shot.
*Why funny:* the ground itself becomes the enemy, and the fix (jump) is something the player already knows how to do.
*Impl:* `SpikeTrap { armed, riseFrames: 7, hurtboxActiveAfter: 5 }` — hurtbox turns on *after* the visual, never before.

**5. The block that sprouts spikes when you hit it**
Syobon Action has "blocks that sprout spikes when touched" (https://en.wikipedia.org/wiki/Syobon_Action).
*Telegraph:* none. But place it where the player bonks from below, so the spike damages on the way back down and there is a frame of "oh no" first.
*Why funny:* it punishes the reflex to hit every block, which is a reflex the level itself taught by putting three harmless coin blocks before it.
*Impl:* `QuestionBlock { payload: 'SPIKE' }` — reuse the exact same sprite as the coin block.

**6. The coin block that runs away**
Syobon Action's first level has "a coin block at the start of a level that rises up and out of reach" the moment you go for it (https://en.wikipedia.org/wiki/Syobon_Action).
*Telegraph:* it moves, so it telegraphs itself while escaping.
*Why funny:* it is completely harmless. It is a pure joke that costs zero progress and sets the tone in the first three seconds.
*Impl:* nearly free — an entity with `onPlayerNear: velocity.y = -2`.

**7. Coin bait over a pit**
Coins placed so that collecting them carries you into a hole, or a coin block "rigged at the edge of a pit to cause the character to fall" (https://en.wikipedia.org/wiki/Syobon_Action). Level Devil Level 4 is the same idea: "Coins lure you into trap triggers or moving hazards" (https://causalzap.com/en/blogs/level-devil-levels-1-16/). Mario Maker trolls use "1-Ups, Yoshi, Fire Flowers, Super Mushrooms, Super Stars and Pink Coins ... to lure players into falling into a trap" (https://supermariomaker2.fandom.com/wiki/Trolling_Techniques).
*Telegraph:* the coin is the telegraph — greed is opt-in.
*Why funny:* the player chose it. Every death the player *chose* is funny.
*Impl:* nothing new; just coin placement plus a bonk-block above the landing arc.

**8. Coins that explode**
Level Devil has coins that explode on pickup (https://poki.com/en/g/level-devil).
*Telegraph:* make exactly one coin in the level a slightly different shade, and make the exploding coin the one that *isn't*.
*Why funny:* it retires the collectible as a "safe" object class, which makes the next 40 coins tense for free.
*Impl:* `Coin { fuse: true }` → on collect, 20-frame blink then a 2-tile radius blast.

**9. The wall that pops out mid-run**
"A wall pops out and blocks you mid-run" — Level Devil Level 3 (https://causalzap.com/en/blogs/level-devil-levels-1-16/).
*Telegraph:* none on first use. Never place it where the bonk causes a death; the joke is the stop, not the kill.
*Why funny:* it is a pratfall, not a punishment. Comedy of the faceplant.
*Impl:* a solid tile column that slides in over 5 frames; give the player a small knockback so the stop reads.

**10. Springs that launch you into spikes**
Level Devil Level 7: "Springs launch you into spike timing traps" (https://causalzap.com/en/blogs/level-devil-levels-1-16/).
*Telegraph:* strongly — the spikes must be visible at the top of the arc before you touch the spring, so the correct play (a *short* hop onto the spring, or hitting it at a different x) is discoverable.
*Why funny:* the spring is the game's own reward object weaponised.
*Impl:* see §5 for spring maths; make launch velocity depend on entry x so there is a skill answer.

### Tier B — Medium (costs a few seconds, needs one death to learn)

**11. The invisible bonk block ("kaizo block")**
The single most classic troll. "Those are invisible until you jump up into them (falling down or sideways through them does not trigger them). They're usually placed right before a gap, ruining your jump" (https://fasterthanli.me/articles/celebrating-mario-maker). Same description from the Mario Maker wiki: invisible blocks "aren't activated until hit from underneath" and are "placed in the middle of a wide gap to ensure players fall to an untimely death" (https://supermariomaker2.fandom.com/wiki/Trolling_Techniques). Unfair Mario is built almost entirely from these (https://www.unfair-mario.com/).
*Telegraph:* after it triggers it becomes a permanent visible block — so the retry is honest.
*Why funny:* the second attempt turns the troll into a platform. The player uses the thing that killed them.
*Impl:* tile flag `HIDDEN_SOLID` — collides only when `player.velocity.y < 0` and the player's head overlaps. Once hit, set `revealed = true` and persist it for the rest of the session (not just the life) — that is what converts rage into progress.

**12. The lying arrow / false signal**
Arrows that point at a death. "Arrows are a common bait, attempting to lead players in a pipe, door or a path" (https://supermariomaker2.fandom.com/wiki/Trolling_Techniques). The refined version is a signal the game can't honour at all: "'Z' is often drawn onto levels using tracks to signal a spin jump, but in troll levels, it's often used in game styles that do not allow spin jumping" (https://supermariomaker2.fandom.com/wiki/Trolling_Techniques, https://fasterthanli.me/articles/celebrating-mario-maker).
*Telegraph:* the arrow itself, which is the joke.
*Why funny:* it weaponises the level's own UI language. Use sparingly — once per level.
*Impl:* decorative tiles. Cheap. Highest laugh-per-byte ratio in the catalogue.

**13. Enemy dropped directly on your head**
"enemies that spawn almost on top of the character or dangerously close to them" (https://en.wikipedia.org/wiki/Syobon_Action). Mario Maker: "A very common design is to have an enemy come from out of nowhere and land on Mario" (https://kaizomariomaker.fandom.com/wiki/Troll_Level).
*Telegraph:* a shadow on the ground 12 frames before impact. With the shadow it's a dodge; without it, it's a coin flip.
*Why funny:* absurd suddenness. Keep the enemy comically oversized.
*Impl:* `Dropper { spawnY: camera.top - 64, shadowLeadFrames: 12 }`.

**14. Deadly background scenery**
Syobon Action has "deadly background scenery" — decoration that kills (https://en.wikipedia.org/wiki/Syobon_Action). Syobon's most infamous instance is a killer cloud.
*Telegraph:* the cloud must move before it kills — one drift, one death.
*Why funny:* it retires the idea of a "safe layer". Very cheap, very memorable, but strictly one per game.
*Impl:* an entity drawn on the background layer with a hurtbox that only activates after `onPlayerWithin(6 tiles)`.

**15. The poison power-up**
A pickup that looks like a buff and hurts you. Poison Mushrooms debuted in Super Mario Bros.: The Lost Levels and "will defeat Small Mario or Luigi, revert Super or Fire Mario into Small Mario"; crucially "In its debut game, it blends in with regular Mushrooms, making it hard to tell which is which", and Nintendo later *reversed* that in Super Mario All-Stars where "poison mushroom hazards were made easier to distinguish" (https://www.mariowiki.com/Poison_Mushroom).
*Telegraph:* Nintendo's own correction is the lesson. Give the poison version one honest tell (a skull, a purple tint, a different idle animation) that is only visible if you *look*.
*Why funny:* it rewards paranoid players and punishes greedy ones, and both groups think the game is talking to them.
*Impl:* `Pickup { kind: 'poison', tell: 'tint' }`.

**16. The platform that falls once you land**
"platforms move after you land on them" (https://leveldevilfull.com/).
*Telegraph:* the movement itself.
*Why funny:* it converts a rest beat into a ride. Especially good if it carries you somewhere *useful* the second time.
*Impl:* `Platform { trigger: 'onLand', path: [...], delay: 10 }`.

**17. Slippery floor / momentum trap**
Level Devil 14: "Fake tiles punish greedy jumps" and "Slippery movement pushes you further than expected" (https://causalzap.com/en/blogs/level-devil-levels-1-16/).
*Telegraph:* ice texture. Always. Never make friction invisible — invisible physics changes are the one thing players correctly call cheating.
*Why funny:* it makes the *player's own skill* the hazard. Good players overshoot harder.
*Impl:* per-tile `friction` value; ice = 0.02 vs normal 0.22 **[derived]**.

**18. The size-change trap**
Level Devil Level 9: "Buttons change size, altering jump spacing and collision" (https://causalzap.com/en/blogs/level-devil-levels-1-16/). Its funniest deployment is "your character expanding in size (threatening to die by spikes on the roof)" (https://www.gamespot.com/articles/level-devil-is-a-giant-hilarious-middle-finger-to-you/1100-6530177/).
*Telegraph:* a growth animation with squash/stretch.
*Why funny:* the player's own body becomes the puzzle piece. Big = can't fit through the gap; small = can't reach the ledge.
*Impl:* scale the AABB, not just the sprite, and re-resolve penetration immediately or the player will pop into walls.

**19. The saw that hides and peeks**
Level Devil 11 is a "Spinning saw chase" (https://causalzap.com/en/blogs/level-devil-levels-1-16/), and the game's best gag version is "cheeky sawblades that chase you, disappear into the ground, and then peek out up ahead" (https://www.gamespot.com/articles/level-devil-is-a-giant-hilarious-middle-finger-to-you/1100-6530177/).
*Telegraph:* the chase itself, plus a rumble/SFX when it's underground.
*Why funny:* it has *personality*. The peek is a character beat, not a hazard.
*Impl:* a state machine `CHASE → SUBMERGE → TRAVEL(offscreen, faster) → PEEK(ahead) → CHASE`.

**20. The falling ceiling / crusher**
Trap Adventure 2: "the ceiling falls down and smashes the player" (https://soranews24.com/2018/02/07/the-newest-game-to-drive-you-up-the-wall-is-out-introducing-trap-adventure-2-%E3%80%90video%E3%80%91/); Level Devil: "the ceiling falls" (https://en.namu.wiki/w/Level%20Devil).
*Telegraph:* dust particles from the ceiling seam, 15 frames.
*Why funny:* claustrophobic panic with a clear escape (run left or right), so almost everyone survives the second attempt.
*Impl:* a kinematic solid that moves down and *pushes* the player — if it reaches the floor with the player inside, kill.

**21. Falling objects from impossible directions**
I Wanna Be The Guy's signature: its Delicious Fruit comes "downward-, upward-, sideways-falling, targeted and homing", including "large cherries that fall upwards", and one screen "requires jumping *into* a cluster of three apples to make them fall sideways" (https://allthetropes.org/wiki/I_Wanna_Be_the_Guy, https://tropedia.fandom.com/wiki/I_Wanna_Be_the_Guy). The game's FAQ line "Apples do not fall up" is itself the joke (https://allthetropes.org/wiki/I_Wanna_Be_the_Guy).
*Telegraph:* the object wobbles in the direction it is about to travel for 10 frames.
*Why funny:* pure physics heresy, and the wobble makes it beatable on sight.
*Impl:* `FallingObject { dir: vec2, trigger: 'proximity' | 'crossLine' }`. Reuse one sprite for all six directions.

**22. The oversized falling gag object**
IWBTG's Moon "attempts to flatten The Kid several times throughout the game", appearing "increasingly larger" before it drops, and Dracula later throws it as a weapon (https://allthetropes.org/wiki/I_Wanna_Be_the_Guy).
*Telegraph:* it grows in the background across several screens. That is the telegraph *and* the gag.
*Why funny:* long-form setup. The audience sees it coming for 30 seconds and still can't believe it.
*Impl:* a background sprite whose scale is a function of the camera's x; it becomes a real entity at one scripted x.

### Tier C — Spicy (costs real progress, needs a checkpoint nearby)

**23. Reversed controls**
Level Devil 5: "Controls may reverse or behave inconsistently" (https://causalzap.com/en/blogs/level-devil-levels-1-16/), and later levels add tricks "where controls suddenly flip left and right" (https://leveldevilfull.com/). Community consensus is that reversal is "great for puzzle design" but "requires players to master the controls, which can make certain levels very tricky" and succeeds only when "players have adequate time to learn and adapt" (https://www.giantbomb.com/inverted-controls/3015-5663/).
*Telegraph:* a full-screen flip or mirror of the HUD; an audible "reverse" sting; an icon in the corner for the whole duration.
*Why funny:* the first two steps go the wrong way and everyone laughs at themselves.
*Impl:* an `inputMap` multiplier, not a physics hack. Reverse for a bounded region (8–14 tiles), never for a whole level, and never during a precision jump.

**24. Gravity flip**
Level Devil 13: "Gravity flips to ceiling/floor with space" (https://causalzap.com/en/blogs/level-devil-levels-1-16/). The *fair* version of this mechanic is VVVVVV, where the player cannot jump at all and instead "flips gravity and the character shoots up to the ceiling", with one entire game built on riffing on that single verb, including "tripwires which will automatically flip gravity when you cross it" (https://en.wikipedia.org/wiki/VVVVVV, https://www.hardcoregaming101.net/vvvvvv/).
*Telegraph:* a flip zone should be a visibly striped region; an *automatic* flip should be a tripwire you can see.
*Why funny:* it doubles the level geometry for free and the first ceiling-walk always gets a reaction.
*Impl:* `gravitySign: ±1`; flip the sprite; **flip the input for jump-hold too**. Make ceiling spikes visible before the flip or it is unfair.

**25. Teleporting walls and warp mazes**
Level Devil 8 has "Moving warps teleport you unpredictably" and 15 has "Touching a wall teleports you to the opposite side" (https://causalzap.com/en/blogs/level-devil-levels-1-16/).
*Telegraph:* mark warp walls with a distinct shimmer once the first one fires.
*Why funny:* disorientation is funny when the room is small. It is miserable when the room is big.
*Impl:* pair each warp with a destination id; preserve velocity through the warp (this is what makes it feel good rather than random).

**26. Trick doors**
Level Devil 10: "Doors act like platforms or traps depending on timing" (https://causalzap.com/en/blogs/level-devil-levels-1-16/). Mario Maker's version: doors that "could be death doors or take players back to the beginning, or take players to a death door with spike traps or enemies waiting" (https://supermariomaker2.fandom.com/wiki/Trolling_Techniques).
*Telegraph:* none on the individual door, but the *set* is the telegraph — a row of three doors reads as a choice.
*Why funny:* a pick-a-path is a joke everyone understands, and a wrong pick costs 3 seconds if you place them right after a checkpoint.
*Impl:* see §4 — this is also our luck primitive.

**27. Spawn blocking (the object that wasn't there a second ago)**
Mario Maker's "spawn blocking" is "done by overlapping any item/enemy with a dotted line block that is turned on, so when the player first enters the room, the object will not appear, but when an ON/OFF switch is activated, the object will spawn" (https://supermariomaker2.fandom.com/wiki/Trolling_Techniques).
*Telegraph:* the ON/OFF switch flip is the telegraph — the player caused it.
*Why funny:* the player pressed the button, so it's their fault, which is the funniest kind of trap.
*Impl:* entities carry a `spawnPhase: 'ON' | 'OFF'`; the global switch state decides whether they exist. This is the single most reusable troll primitive we have because it composes with everything in §5.

**28. "Twice Twice" — the familiar room, altered**
Kaizo wiki: "The 'Twice Twice' is a troll where the player is taken to a section that looks like a previous section but is altered with new trolls" (https://kaizomariomaker.fandom.com/wiki/Troll_Level). Mario Maker levels also use "similar-looking level layouts with subtle differences, disorienting returning players" (https://fasterthanli.me/articles/celebrating-mario-maker).
*Telegraph:* a tint shift or a single changed background element, so replay viewers spot it before the player does.
*Why funny:* it punishes exactly the memorisation the level trained, which is the highest form of the craft. And it costs us almost nothing — duplicate the tilemap chunk and edit three tiles.
*Impl:* level chunks as reusable data; a `variant` overlay that patches specific tiles.

**29. The trap checkpoint**
Two variants, both documented. (a) The unreachable flag: "Checkpoint Flags are often placed in a way that appears obtainable, but is actually impossible to collect ... by placing Hidden Blocks directly behind the checkpoint flag to make Mario pass through it" (https://supermariomaker2.fandom.com/wiki/Trolling_Techniques, https://kaizomariomaker.fandom.com/wiki/Troll_Level). (b) The checkpoint that is itself a trap door.
*Telegraph:* for us — always give a *real* checkpoint within 5 tiles of a fake one.
*Why funny:* it only works once per game and only if the real one is right there.
*Impl:* `Checkpoint { real: bool }`; the fake one plays the jingle and then falls over.

**30. CP1 — dragged back to the first checkpoint**
"CP1 is when a player takes a false path in a troll level, and is eventually unknowingly forced to touch the first checkpoint again", meaning "they have to redo the whole level" (https://fasterthanli.me/articles/celebrating-mario-maker, https://supermariomaker2.fandom.com/wiki/Trolling_Techniques). Designers dress it up with "long, drawn-out sequences where the player is dragged through the screen by moving blocks, mocking them through writings made of coins" (https://fasterthanli.me/articles/celebrating-mario-maker).
*Do not ship the real version.* Ship the *gag* version: a 3-second conveyor ride back with a coin-text message, landing you at the checkpoint you were already on. All of the theatre, none of the lost progress. **[derived]**

**31. The evil save point**
IWBTG has "a save point that will attempt to kill you" and on Impossible difficulty "it's the only save point" (https://allthetropes.org/wiki/I_Wanna_Be_the_Guy, https://tvtropes.org/pmwiki/pmwiki.php/VideoGame/IWannaBeTheGuy).
*Telegraph:* it must still function as a save point after it attacks.
*Why funny:* betrayal by the safety object. The player keeps the save, so it is pure theatre.
*Impl:* `Checkpoint { onActivate: shootOnce() }` — the shot is dodgeable and the checkpoint registers first.

**32. Useless collectibles that force a guess**
"A common troll is placing unnecessary Pink Coins in the level to force the player to guess whether they are needed or not" (https://kaizomariomaker.fandom.com/wiki/Troll_Level).
*Telegraph:* a HUD counter that reads `? / ?`.
*Why funny:* the anxiety is the content, and nobody actually dies.
*Impl:* two collectible classes with identical sprites; only one counts toward the door.

**33. The fake exit / fake goal**
Level Devil 16: "The game baits you with a 'final door' that often isn't real; invisible warp triggers near the end" (https://causalzap.com/en/blogs/level-devil-levels-1-16/). Mario Maker: "The end-of-level axe or flagpole is often obfuscated in some way, sometimes humorously revealed when the player is no longer able to reach it" (https://kaizomariomaker.fandom.com/wiki/Troll_Level).
*Telegraph:* the real goal must be visible from where the fake goal betrays you.
*Why funny:* maximum tension release timing. Land it as the level's punchline.
*Impl:* `Goal { real: false, onTouch: slideAway() }`.

**34. The goal that attacks you**
Syobon Action's flagpole "kills the character in two different ways, either by falling over or shooting a laser beam" (https://en.wikipedia.org/wiki/Syobon_Action).
*Telegraph:* none — this is a one-per-game finisher.
*Why funny:* it is the last thing the player expects to be a hazard, and the death is so absurd nobody is angry. Put the checkpoint 2 tiles before it.
*Impl:* `Goal` with a scripted attack; on the retry, the goal is inert (the joke is spent).

**35. The exit is behind you**
Mario Maker doors that "take players back to the beginning" (https://supermariomaker2.fandom.com/wiki/Trolling_Techniques), and Level Devil's broader lesson that "Everything you learned to navigate one level is wrong and useless at the next" (https://zotuf.com/level-devil-walkthrough/).
*Telegraph:* let the camera drift left for half a second after the fake goal.
*Why funny:* in a left-to-right game, "go left" is a genuinely novel instruction.
*Impl:* allow the camera to unlock and scroll left in one specific region.

### Tier D — Evil (use once, or as the level's climax, or not at all)

**36. The fake pipe jail (soft-lock bait)**
Mario Maker: "an arrow will point down on pipes to attract players, only to find the pipe doesn't warp Mario to a subworld, and attempting to leave the fake pipe will jail Mario with Invisible blocks" (https://supermariomaker2.fandom.com/wiki/Trolling_Techniques).
*The fix that keeps it funny:* good troll designers build "evil anti-softlocks" that "intentionally provide temporary invincibility so players can finally perish and restart" (https://fasterthanli.me/articles/celebrating-mario-maker). **A softlock must always resolve into a death.** Ours resolves in 2 seconds with a crusher.

**37. The cascading trap (a trap on the reaction to a trap)**
Level Devil's real innovation: "The game sets traps for you, but then pretty much knows how you'll react to those traps on subsequent tries, and then sets traps based on THAT, and sometimes traps based on those traps" (https://www.gamespot.com/articles/level-devil-is-a-giant-hilarious-middle-finger-to-you/1100-6530177/).
*Impl:* we can do this literally — track `deathCount` for a room and swap the trap set at deaths 1, 2 and 3. Three layers is the sweet spot; four is cruel. **[derived]**

**38. Trap Adventure 2's thesis**
"As the player runs and jumps into everything, a never-ending series of spikes, flames and other booby traps appear out of nowhere to kill the player, and once all lives are gone, it forces the player to start the game over again at the beginning with no checkpoints" (https://en.wikipedia.org/wiki/Trap_Adventure_2). The traps themselves are good: "a floor may collapse, a block may attack from above" and "spikes bounce down to the bottom platform, and the ceiling falls down and smashes the player" (https://soranews24.com/2018/02/07/the-newest-game-to-drive-you-up-the-wall-is-out-introducing-trap-adventure-2-%E3%80%90video%E3%80%91/).
**Steal the traps, reject the no-checkpoints rule.** Syobon Action by contrast gives "infinite lives"; when the counter reaches zero "the number becomes negative and continues to decrease" rather than triggering a game over (https://en.wikipedia.org/wiki/Syobon_Action). That negative-lives counter is the correct joke: a death counter that goes down forever and never stops you.

**39. Randomised damage / unknowable hazards — DO NOT SHIP**
The distinction the whole community draws: modern kaizo is "first and foremost fair", while "unfair prank levels have crystallized into what is commonly called a Troll Level", and the well-made ones are "carefully designed levels made with a lot of planning and psychology in them" as opposed to levels that rely on "spam or hidden items" (https://kaizomariomaker.fandom.com/wiki/Troll_Level). The named bad category is "hot garbage (random hidden blocks, enemy spam, instant deaths)" (https://egmnow.com/these-super-mario-maker-level-designers-have-elevated-trolling-into-an-artform/). Note that IWBTG deliberately lives on the other side of this line — its level design is "as unpredictable as possible so that players will die as much as possible" (https://tropedia.fandom.com/wiki/I_Wanna_Be_the_Guy) — and it can afford that because it has nothing else to sell. We do.

---

## 2. Design rules for fair troll levels

### 2.1 Instant respawn is the load-bearing wall

Super Meat Boy's brutality works because respawn is "near-instantaneous (under half a second)" and "the game never punishes you with a loading screen for dying", which produces "elimination of downtime which keeps the player engaged, encourages experimentation since there's no real punishment for dying, and reinforces learning through immediate feedback loops" (https://gamevoyages.com/why-is-super-meat-boy-so-difficult/, https://www.mandible.net/2012/10/31/death-from-dungeon-crawl-to-meat-boy/). Instant retry is explicitly what lets you "partition very difficult sections into tiny, tiny pieces" (https://game-design-snacks.fandom.com/wiki/Quick_restarts_keep_the_player_involved.).

**Rule:** death → respawn in ≤ 300 ms, no fade, no transition, camera already in place. Keep the death effect (particles, sound) but do not block input during it. **[derived]**

One counterpoint worth designing around: a critic notes Super Meat Boy "plays at such a high speed with such a fast respawn from mistakes that players don't have enough time to perceive and reflect on the mistakes they make" (https://critical-gaming.squarespace.com/blog/2011/1/6/super-meat-boy-pt3.html). **Mitigation for a troll game: on death, freeze for ~6 frames and flash the thing that killed you.** That 100 ms is the difference between "what happened" and "oh, *that*". **[derived]**

### 2.2 The death counter is a trophy, not a penalty

Celeste tracks deaths per level and its loading-screen postcards say: "Be proud of your Death Count! The more you die, the more you're learning. Keep going!" — and in its communities "each player's death count is shared as a badge of honor" (https://blog.playstation.com/2019/01/05/editors-choice-why-celeste-is-one-of-the-best-games-of-2018/, https://playcritically.com/2025/06/30/celeste-review/). Super Meat Boy goes further: "After completing any level, the game plays a simultaneous replay of every single one of your attempts from that session, with all your ghost copies running at once" (https://www.mandible.net/2012/10/31/death-from-dungeon-crawl-to-meat-boy/) — "a playful acknowledgment of their struggle" (https://gamevoyages.com/why-is-super-meat-boy-so-difficult/).

**Ship:** a big persistent death counter in the HUD, a per-troll "first blood" toast ("Trap 14/39 discovered"), and a end-of-level ghost replay of all deaths at once. The ghost replay is cheap in a canvas game — record `[x, y, frame]` per attempt and draw N translucent sprites. **[derived]**

### 2.3 The level teaches you — death is the tutorial

Level Devil "turns death into a tutorial — every time you get tricked, you gain information about how the level operates" (https://www.geeksvsgeeks.com/2025/03/level-devil-review-platformer-that.html). Level 1 exists solely to teach that floors lie (https://causalzap.com/en/blogs/level-devil-levels-1-16/).

**Rule:** every troll must transmit exactly one new fact, and the player must be able to act on that fact within 3 seconds of respawning. If a death teaches nothing, cut the trap.

### 2.4 No RNG deaths — determinism is what makes memorisation a skill

Syobon Action's central mercy: "the levels do not change between plays, allowing the player to memorize their locations and patterns and eventually make progress" (https://en.wikipedia.org/wiki/Syobon_Action). The rage-design literature agrees: "The rules must be clear, and the mechanics must be consistent. Players should never feel cheated by the game" and "Difficulty should come from strategic gameplay, not artificial handicaps. Avoid arbitrary time limits, unavoidable damage" (https://www.wayline.io/blog/the-art-of-rage-quit-design).

**Rule:** seed every random element per *level attempt*, not per frame, and lock the seed until the player clears the room. Then it is a puzzle, not a slot machine. **[derived]** (Level 10's luck systems are the deliberate exception — see §4, which is about *bounding* that exception.)

### 2.5 Each troll used once

This is the corollary of 2.3. Reuse turns a joke into an obstacle. The exception is the deliberate callback: re-use a trap after ≥ 3 other trolls, in a "Twice Twice" room where the *same-looking* setup does something different (https://kaizomariomaker.fandom.com/wiki/Troll_Level).

### 2.6 Escalation and subverting your own patterns

Establish a pattern in 2–3 repetitions, break it on the 4th. This is the documented Mario Maker method: well-designed troll levels "use visible hints (big signs, visible Munchers) to set expectations, then subvert them psychologically rather than through randomness" (https://egmnow.com/these-super-mario-maker-level-designers-have-elevated-trolling-into-an-artform/). One documented example runs the full arc: a level "appears to require Link power-up but can be completed without it using Mushroom power-ups instead" (https://egmnow.com/these-super-mario-maker-level-designers-have-elevated-trolling-into-an-artform/).

**Rhythm for a 3-minute troll level [derived]:**
- 0:00–0:20 — three honest obstacles. Build trust. No deaths.
- 0:20–0:50 — trolls 1–3, all Tier A, all costing < 2 s.
- 0:50–1:40 — Tier B, one Tier C, checkpoints every 8–12 tiles.
- 1:40–2:30 — callbacks: the same-looking rooms, now different (Twice Twice).
- 2:30–3:00 — the cascade (#37) and then the fake goal (#33) → real goal.

### 2.7 Checkpoint density beats trap density

Roblox obby convention is a checkpoint "every 3 to 5 obstacles" and "immediately after any particularly difficult section" (https://kitsblox.com/blog/how-to-make-roblox-obby, https://www.creation.dev/blog/roblox-obby-design-guide). Mario-Maker-style trolls only work because the loss is small.

**Rule:** in the troll level, checkpoint every ~10 tiles of horizontal progress, and always *before* a Tier C or D trap, never after.

### 2.8 Softlocks resolve into death, always

Restated from #36: "evil anti-softlocks" deliberately let the player die so they can restart (https://fasterthanli.me/articles/celebrating-mario-maker). Add a global watchdog: if the player has not moved more than 1 tile in 8 seconds and cannot reach a valid exit, kill them and log it. **[derived]**

### 2.9 Controls must be flawless, because everything else is a lie

"Make sure the controls are tight and intuitive" to prevent frustration from mechanical failure rather than skill gaps (https://www.wayline.io/blog/the-art-of-rage-quit-design). Super Meat Boy is fair because "the movement is crisp, hitboxes are clear and slightly forgiving" (https://gamevoyages.com/why-is-super-meat-boy-so-difficult/).

Concrete forgiveness budget:
- **Coyote time**: a grace window after leaving a ledge during which jump still fires; Celeste uses a 5-frame window and Super Meat Boy a similar duration (https://www.gamejuice.co.uk/articles/coyote-time-input-buffering). Recommended for a tight precision platformer: **coyote 70–100 ms, buffer 70–110 ms** (https://gamineai.com/blog/input-buffering-and-coyote-time-in-2d-a-godot-4-and-unity-friendly-timing-primer).
- **Jump buffer**: "If you press and hold the jump button a short time before landing, you will jump on the exact frame that you land" (https://www.ryantreadwell.com/post/jump-terminology).
- Rule of thumb from the same source: coyote window 5–8 frames, buffer window 6–9 frames, buffer slightly longer than coyote (https://gamineai.com/blog/input-buffering-and-coyote-time-in-2d-a-godot-4-and-unity-friendly-timing-primer).
- The point: "The player never notices coyote time exists—they just feel that the controls are fair" (https://www.gamejuice.co.uk/articles/coyote-time-input-buffering).

**[derived] 32px-tile jump tuning.** For a jump that clears 4 tiles (128px) in `T_up = 0.35 s` at 60fps: `g = 2h/T² = 2·128/0.35² ≈ 2090 px/s²` (≈ 0.58 px/frame²), `v_jump = g·T ≈ 732 px/s` (≈ 12.2 px/frame). Run speed ~200 px/s gives a jump arc of ~140px horizontally at apex — i.e. a comfortable 4-tile gap. Keep the player hitbox 24×30 so a 1-tile (32px) vertical shaft is passable.

### 2.10 Visual language: establish it, then never break it by accident

Obby convention: "Many successful obbies use green for safe, red for kill, and yellow for moving or temporary platforms. Once you establish these associations, never break them" (https://kitsblox.com/blog/how-to-make-roblox-obby). Kill bricks should be coloured "red or lava-textured so players know to avoid them" (https://www.creation.dev/blog/roblox-obby-design-guide).

In a troll level the *deliberate* violation of this palette is a trap (see #15's poison tint). Everything else stays honest. If the palette lies twice, it means nothing and the whole level degrades into noise.

---

## 3. Level 8 — the Obby Tycoon

### 3.1 What the genre is

A Roblox tycoon is an experience where "users get to own a base, usually a business or a company of some kind, and must use 'droppers' to earn cash, which can be spent on upgrades to expand the tycoon" (https://roblox.fandom.com/wiki/Tycoon). The canonical loop is four stages: **"dropper spawns cash parts → conveyor transports them → collector converts to money → buy buttons unlock expansions"** and "This feedback loop, when repeated with upgrades, defines the entire genre" (https://generalistprogrammer.com/tutorials/how-to-make-a-roblox-tycoon-game).

"More buttons will spawn over time, allowing users to buy more and more things. Some of these are more droppers, some of them are upgraders, which increase the dollar value of each brick passing through them, some are base infrastructure or decoration" (https://roblox.fandom.com/wiki/Tycoon). A second common variant skips the physical parts entirely: "cash that is automatically delivered to the player, and the cash simply comes faster more after a user buys more things" (https://roblox.fandom.com/wiki/Tycoon) — **this is the variant to implement in a 2D canvas game**, because rolling physics bricks down a conveyor is a lot of simulation for a number that could just tick. **[derived]**

An *Obby* Tycoon specifically: "Obby Tycoon is a unique tycoon game where you earn money by building obstacle courses and letting NPCs complete them for you. As you earn more money, you can unlock new obbies, upgrade your NPCs, and expand your tycoon faster" with "over 110 different Stages to unlock" (https://www.roblox.com/games/8257407673/Obby-Tycoon, https://tryhardguides.com/obby-tycoon-codes-for-free-cash/). The active/idle hybrid is the key: "Players can also run the courses themselves, and after five completions they get x2 income" (https://deltiasgaming.com/roblox-obby-tycoon-codes/). And the genre-defining twist: "an NPC will complete it, earning the player money, though NPCs will also occasionally fail the obby, bringing a slight RNG aspect into the game" (https://devforum.roblox.com/t/obby-tycoon-feedback-thread/2785373).

**That is the whole level-8 design in one line: the player buys obstacle segments, little NPC runners attempt them, the player earns per successful run, and the player can run the course themselves for a multiplier.**

### 3.2 Buy-button mechanics

- **Affordability colour.** "buttons typically use color-coding where green buttons are affordable and red ones aren't, with players walking into a button to purchase it" (https://devforum.roblox.com/t/tycoon-button-system/1923669).
- **Dependency chain.** "Each button funds the next in a dependency chain" and "future buttons spawn as you touch the previous ones" (https://generalistprogrammer.com/tutorials/how-to-make-a-roblox-tycoon-game, https://devforum.roblox.com/t/tycoon-button-dependency-system/1565731).
- **Purchase feedback.** "A button checks affordability, subtracts the price, and reveals a hidden part (new dropper, wall, upgrade). A `bought` flag prevents double-firing. The pad is destroyed post-purchase as visual confirmation" (https://generalistprogrammer.com/tutorials/how-to-make-a-roblox-tycoon-game).

**[derived] 2D translation:** a buy button is a 2×2-tile pad with a price label. States: `LOCKED` (grey, not drawn until its prerequisite is bought), `UNAFFORDABLE` (red, price shown), `AFFORDABLE` (green, pulsing), `BOUGHT` (pad sinks into the floor, the purchased tiles fade in). Walk over it to buy — no keypress, so it stays a platformer.

### 3.3 Pacing and the price ladder

Documented numbers from the genre:

| Source | Number |
|---|---|
| Upgrade cadence | "each upgrade should cost roughly enough that it takes a couple of minutes to afford at the current income" (https://generalistprogrammer.com/tutorials/how-to-make-a-roblox-tycoon-game) |
| Max wait | "maximum wait time should be 2 minutes before buying something" (https://devforum.roblox.com/t/how-do-i-properly-price-things-in-my-tycoon/2215102) |
| Price-to-income ratio | "1.5:1 cash per minute to price ratio" (https://devforum.roblox.com/t/tips-for-good-pricing-and-earnings-for-tycoon-games/2076918) |
| Typical item price band | "Average item range: 5,000 to 10,000 cash", "the vast majority of items in the tycoon not going over 100,000 cash in cost" (https://devforum.roblox.com/t/tips-for-good-pricing-and-earnings-for-tycoon-games/2076918) |
| Income ceiling | "no more than $100 per second maximum"; "55 cash earned every 1.5-3 seconds after maximum upgrades" (https://devforum.roblox.com/t/tips-for-good-pricing-and-earnings-for-tycoon-games/2076918) |
| Session target | "around an average play time of 15 minutes", aiming for players to "spend at least 15-20 minutes trying to buy stuff" (https://devforum.roblox.com/t/tips-for-good-pricing-and-earnings-for-tycoon-games/2076918) |
| Full-completion pacing | "approximately 53 minutes to complete a full factory, with the rebirth pad becoming affordable at minute 42" (https://github.com/adit-rah/ttt) |
| Tiered pricing | "price upgrades lower at the beginning of the game, and gradually increase the price as players progress" (https://devforum.roblox.com/t/how-do-i-properly-price-things-in-my-tycoon/2215102) |

Reference early-game table from a working tycoon tutorial (https://generalistprogrammer.com/tutorials/how-to-make-a-roblox-tycoon-game):

| Upgrade | Drop Value | Drop Rate | Price |
|---|---|---|---|
| Starter | 5 | 2s | Free |
| Dropper 2 | 15 | 2s | 50 |
| Faster Belt | 15 | 1s | 250 |
| Dropper 3 | 50 | 1s | 1,000 |

The exponential shape comes from the incremental-games tradition: Cookie Clicker increases building costs "by 15% multiplicatively each time another of that building is purchased", with the cumulative cost `Σ(base × 1.15^N)/1.15` (https://cookieclicker.fandom.com/wiki/Building, https://cookieclickercalc.com/buildings). The 1.15 figure "was chosen to produce a specific feel" (https://dinogame.gg/blog/how-cookie-clicker-progression-works/).

### 3.4 Concrete 5–10 minute price ladder for level 8 **[derived]**

The Roblox numbers assume a 15–53 minute session; we want 5–10 minutes, so compress by roughly 3–5×. Target: **a purchase every 25–45 seconds, 14 purchases, ~8 minutes to the goal**, with active play (running the obby yourself) roughly halving that.

Income model: `income/s = Σ(segment.rate) × (1 + 0.5 × selfRuns capped at 2×) × rebirthMult`

| # | Unlock | Price | Adds ¢/s | ¢/s after | Est. wait | Cum. time |
|---|---|---|---|---|---|---|
| 0 | Starter runner (free) | 0 | 2 | 2 | — | 0:00 |
| 1 | Obby Segment A (3 jumps) | 20 | +2 | 4 | 10 s | 0:10 |
| 2 | Runner Speed I | 45 | +2 | 6 | 11 s | 0:21 |
| 3 | Obby Segment B (spikes) | 90 | +3 | 9 | 15 s | 0:36 |
| 4 | Second Runner | 160 | +4 | 13 | 18 s | 0:54 |
| 5 | Obby Segment C (movers) | 280 | +6 | 19 | 22 s | 1:16 |
| 6 | Payout Multiplier ×1.25 | 480 | +5 | 24 | 25 s | 1:41 |
| 7 | Obby Segment D (springs) | 800 | +9 | 33 | 33 s | 2:14 |
| 8 | Third Runner | 1,300 | +12 | 45 | 39 s | 2:53 |
| 9 | Obby Segment E (switches) | 2,100 | +17 | 62 | 47 s | 3:40 |
| 10 | Runner Speed II | 3,400 | +18 | 80 | 55 s | 4:35 |
| 11 | Obby Segment F (fling) | 5,400 | +30 | 110 | 68 s | 5:43 |
| 12 | Payout Multiplier ×1.6 | 8,600 | +44 | 154 | 78 s | 7:01 |
| 13 | **The Gate** (opens the exit) | 13,500 | — | — | 88 s | 8:29 |

Growth rate between steps is ≈ **1.6×**, much steeper than Cookie Clicker's 1.15 because we have 14 steps, not 300 (https://cookieclicker.fandom.com/wiki/Building). Every wait stays inside the documented "2 minutes max" ceiling (https://devforum.roblox.com/t/how-do-i-properly-price-things-in-my-tycoon/2215102), and every price stays inside a "1.5:1 cash-per-minute to price" band (https://devforum.roblox.com/t/tips-for-good-pricing-and-earnings-for-tycoon-games/2076918) within ~2× at the top.

**Active-play multipliers, so it isn't just watching a number [derived]:**
- Running a segment yourself pays **10× the NPC rate for that segment, once per run**.
- Clearing all currently-owned segments in one unbroken run grants **×2 income for 60 s** (this is the Obby Tycoon "five completions → x2 income" idea (https://deltiasgaming.com/roblox-obby-tycoon-codes/) compressed to a single level).
- Dying mid-run does not lose cash — it only loses the streak. Money is never taken away; that is what keeps it a tycoon and not a gamble.

### 3.5 Rebirth

Reference implementation: rebirth cost is `REBIRTH_BASE_COST × (REBIRTH_COST_GROWTH ^ currentRebirths)` with "defaults of 100,000 base cost and 2.5× growth, the second rebirth costs 250,000. Each rebirth grants a permanent multiplier (e.g., `1 + rebirths.Value * 0.5`)" and on rebirth "The base resets to locked; cash zeros; unlocked upgrades clear" (https://generalistprogrammer.com/tutorials/how-to-make-a-roblox-tycoon-game). Elsewhere "each rebirth gives a +100% (base) multiplier, along with essence, that gives you +0.1% multiplier on top" (https://tycoon-but-one-dropper.fandom.com/wiki/Rebirths).

**[derived] For a single 5–10 minute level, rebirth is optional and should be a *choice with visible cost*:** at purchase #9 offer a "PRESTIGE" pad costing 2,500 that resets segments 1–9 but grants ×2.5 permanent income. The optimal line is to take it; the point is that the player computes it. Make the math visible on the pad ("Reset 9 unlocks · Income ×2.5 · Break-even ~40 s"). Do not gate the level exit behind rebirth.

### 3.6 Cross-level notes

- Keep **all cash math server-authoritative** in a multiplayer context: "Keep all cash math and purchases in server Scripts or players will exploit infinite money" (https://generalistprogrammer.com/tutorials/how-to-make-a-roblox-tycoon-game). In a single-player canvas game the equivalent is: keep cash in one module with a single mutation function, and checksum it in the save blob.
- Persist: cash, rebirth count, and the set of unlocked ids (https://generalistprogrammer.com/tutorials/how-to-make-a-roblox-tycoon-game).

---

## 4. Level 10 — luck, bounded

### 4.1 The genre reference

"50/50 Pick A Door Obby!" is the canonical Roblox luck obby: "41 doors to choose from with a 50/50 chance of surviving" (https://www.roblox.com/games/10679961467/50-50-Pick-A-Door-Obby). Note the arithmetic: 0.5^41 ≈ 4.5 × 10⁻¹³. It is only playable because each wrong door costs a retry of that door, not the level. **That is the entire lesson.** **[derived]**

Roblox chance systems generally use "weighted probability tables" with luck multipliers layered on top (https://devforum.roblox.com/t/how-will-i-go-about-making-a-chance-system-that-supports-luck-boosts/2845064, https://kitsblox.com/blog/how-to-make-rng-game-roblox).

### 4.2 Why unbounded luck fails

"a pure random system can frustrate players who go hundreds of rolls without a rare drop" (https://kitsblox.com/blog/how-to-make-rng-game-roblox). "Pure randomness can be cruel, and modern games increasingly soften it so players do not feel endlessly punished" (https://mwm.ai/glossary/pity-system). And from the rage-design side: "Avoid arbitrary time limits, unavoidable damage" (https://www.wayline.io/blog/the-art-of-rage-quit-design).

### 4.3 The four bounding techniques

**(a) Show the odds.** "In many jurisdictions it is now legally required for the item rarities to be public information, and virtually all contemporary gacha games share this information" (https://mwm.ai/glossary/pity-system). **Impl:** paint the probability on the door itself — a 3-door room reads `40%` / `40%` / `20%`, and a bridge tile shows a `½` glyph. Visible odds convert a gamble into a decision.

**(b) Pity / bad-luck protection.** Two documented shapes: "soft pity (drop rates rise as pulls accumulate), and hard pity (guaranteed drop at N pulls)" — Genshin's hard pity is 90 pulls for a 5-star (https://mwm.ai/glossary/pity-system, https://gamedesign.gg/glossary/pity-system/). Pity systems "cap the worst-case run of bad luck while keeping the rush of a rare drop intact" (https://mwm.ai/glossary/pity-system) and "protect players from extreme bad luck and protect publishers from the rage, refund, and regulatory risk of unlucky players" (https://mwm.ai/glossary/pity-system). **Impl [derived]:** every chance element gets `failStreak`. Soft pity: after 2 fails, the good outcome's weight ×2; after 3, ×4. Hard pity: the **4th attempt is always safe**, and the door visibly turns gold so the player knows they're owed it. Max cost of any luck gate: 3 failures ≈ 12 seconds.

**(c) Let skill bypass luck.** This is the single most important rule for level 10. Every chance gate must have a deterministic alternative that is *harder to execute*. A 50/50 bridge has a 5-tile gap you can clear with a perfect spring jump. A chance door has a vent above it reachable by a precise wall-sequence. The luck path is the easy path; the skill path is the fast path. **[derived]** This mirrors the ON/OFF design pattern where players "can lock [a Chomp] inside the red cubes zone to avoid it, but doing so means losing coins—rewarding risk-takers who dodge the enemy and collect coins instead" (https://supermariomaker2.fandom.com/wiki/ON-OFF_Switch_Research_Expedition) — the safe route always costs something other than progress.

**(d) Luck costs time, never progress.** Wrong outcomes must eject you into a 2-second recovery loop that returns you to the same choice with the counter incremented — exactly how the 41-door obby stays finishable (https://www.roblox.com/games/10679961467/50-50-Pick-A-Door-Obby). The reference failure pattern from maze design, which we should *emulate as a loop and not as a punishment*: "If players choose any of the wrong portals (Green or Yellow) in Room 1, they will bounce around between Rooms 2, 3, 4, and 5 until they eventually wind up in Room 1 again, where they can start over" (https://davidmullich.com/2023/01/18/yahaha-and-the-amazing-maze-part-iii/). Make that bounce 2 seconds, not 2 minutes.

### 4.4 Concrete luck elements for level 10 **[derived]**

| Element | Mechanic | Odds shown | Pity | Skill bypass |
|---|---|---|---|---|
| **Chance Doors** | 3 doors, one leads onward, two dump you back | `50/25/25` painted on | 4th attempt: correct door glows | A crumbling ledge above the doors reaches the exit directly |
| **50/50 Bridge** | Alternating tiles, half are fake (#1) | `½` stamped on each pair | after 2 falls the real tiles get a faint seam | 6-tile gap jumpable from a spring |
| **Roulette Platforms** | 5 platforms, 2 are real; reshuffled per attempt (seeded per attempt, §2.4) | `2/5` on the wall | after 3 fails, 3 are real | A moving platform passes every 8 s that skips the whole set |
| **Slot Gate** | Three reels, matching symbols open the gate | payout table on the gate | guaranteed match on spin 4 | A switch puzzle (§5) opens the same gate in ~20 s |
| **Lucky Coin** | Coins that are 20% double-value, 5% bomb | `20% / 5%` in HUD | never two bombs in a row | just don't take them |
| **The Rigged Door** | Troll: a door labelled `99%` that always fails — once | label is the joke | it opens on attempt 2, permanently | — |

The last row is the crossover with level 9: a luck troll is only funny if the game is otherwise scrupulously honest about its odds. One lie, clearly signposted afterwards.

---

## 5. Flinging, launching, and puzzle patterns

### 5.1 The DKC barrel taxonomy — this is the design space

Donkey Kong Country's barrels are the reference implementation of "the game takes over your movement, and how much control you keep varies":

- **Arrow Barrels** "always face a fixed direction, making it clear where the Kongs will be fired before they jump inside, unlike normal Blast Barrels which often turn before firing", and they "launch characters in a single direction indicated by a painted arrow" (https://www.mariowiki.com/Arrow_Barrel, https://www.mariowiki.com/Barrel_Cannon). **The arrow *is* the trajectory preview.** Cheapest possible telegraph.
- **Blast Barrels** "automatically launch you in a certain pre-programmed direction" without requiring player activation (https://www.mariowiki.com/Barrel_Cannon).
- **Rotatable Barrels** "can be rotated and aimed before firing, though there is a hidden time limit"; "players can control and aim using the control pad, but must do so quickly as these barrels are timed to ignite at a certain time". Critically, "Later games like Donkey Kong Land 2, Land III, and DK: Jungle Climber removed the time limit, allowing Kongs to stay in the barrel as long as needed" (https://donkeykong.fandom.com/wiki/Rotatable_Barrel). **Nintendo removed the hidden timer. Take the hint: never put a hidden timer on an aiming mechanic.**
- **Spin Barrels** "spin around" and "lack visible indicators", meaning "spinning variants provide no advance directional warning, making timing critical" (https://www.mariowiki.com/Barrel_Cannon). This is the rhythm version — the barrel's rotation *is* the metronome.
- Consequence either way: "Since cannons sometimes rotate, this action can sometimes save players from falling, or it can launch them directly into a KO" (https://donkeykong.fandom.com/wiki/Rotatable_Barrel).
- Later entries simplified to "four: regular cannons, blast barrels, and skull versions of each, with the skull variants self-destructing after firing" (https://www.mariowiki.com/Barrel_Cannon).

**[derived] Our four launcher types, in teaching order:**
1. `ArrowCannon` — fixed direction, painted arrow, fires on jump press. Teaching device.
2. `SpinCannon` — rotates at a constant rate; fires on jump press. Rhythm skill. Draw a faint arc where it currently points.
3. `AimCannon` — the player rotates it with left/right, **no timer**, fires on jump. Show a dotted trajectory (§5.2).
4. `ChargeCannon` — hold to charge, release to fire; the power meter is a bar on the barrel and the trajectory preview extends as you charge.

### 5.2 Trajectory preview — the actual implementation

Angry Birds' trajectory line was a late polish addition: "Chillingo participated in final game polishing by adding visible trajectory lines" (https://en.wikipedia.org/wiki/Angry_Birds_(video_game)). The design point: the original game drew the arc *after* you fired so you could plan the next shot; Angry Birds Space switched to showing "the trajectory of the current bird" because per-planet gravity made prediction impossible otherwise (https://blog.gemserk.com/2012/07/03/drawing-a-projectile-trajectory-like-angry-birds-using-libgdx/). **Rule: the more your physics differs from intuition, the more you must show the arc live.**

The maths, straight from the reference implementation (https://blog.gemserk.com/2012/07/03/drawing-a-projectile-trajectory-like-angry-birds-using-libgdx/):

```
x(t) = v0.x * t + p0.x
y(t) = 0.5 * g * t*t + v0.y * t + p0.y
```

Sample at fixed time steps (`timeSeparation`) and draw a sprite at each point. For **evenly spaced dots regardless of power**, invert for t at a fixed horizontal spacing:

```
t = (x - p0.x) / v0.x
```

**[derived] Canvas recipe:** 14 dots, radius 2→4px growing along the arc, alpha 1.0→0.3, stop at the first tile collision and draw a small impact ring there. At 32px tiles, `timeSeparation = 0.06 s` gives roughly one dot per half-tile at typical launch speeds.

### 5.3 Springs and bounce pads

- Mario's trampolines reward timing: "Pushing the A Button when the jumping board is all the way up makes Mario jump superhigh", i.e. a timed input converts a normal bounce into a "Super High Jump" (https://www.mariowiki.com/Trampoline).
- Super Mario World's spring platforms reward *position*: "the closer the player is to the end of the platform, the higher they bounce upon jumping" (https://www.mariowiki.com/Spring_platform_(Super_Mario_World)).
- Variant: "a different type of trampoline, called a Jump Panel ... normally does not cause the player to bounce, but pressing the jump button will cause it to launch the player to distant heights" (https://www.mariowiki.com/Trampoline).
- Roblox obby convention for the same object: jump pads "can be paired with trip parts to make a 'fling' mechanism", and "You can make pads that launch players forward, pads that send them flying backward, or pads that give them a massive vertical boost" (https://roblox-obby-creator.fandom.com/wiki/Jump_Pad, https://robloxbouncescript.pages.dev/posts/roblox-bounce-script/). Implementation-wise Roblox does this with `LinearVelocity`, which "gives forces to objects so you can make a bounce pad" (https://devforum.roblox.com/t/how-to-make-a-bounce-pad-for-obbies-using-linearvelocity-and-attachments/2013607).

**[derived] Spring spec:** `Spring { base: 1.6×jumpVel, timedBonus: 2.4×jumpVel, window: 8 frames after compression, angle }`. Draw the compression (3 frames down, 3 frames up) and flash white on the exact bonus frame. Because the bonus window is *visible*, a spring is a skill check and not a lottery. A directional spring gets a painted arrow, same as the Arrow Barrel.

### 5.4 Conveyors and wind

"Conveyor belts are platform game obstacles where standing on them pushes the player in a specific direction, with the ability to flip direction or change speed via switches. Air currents are similar mechanics that use high-powered winds to push players in specific directions, with both airborne and underwater varieties" (https://galaxytrail.tumblr.com/post/25734526468/2d-platform-game-gimmicks-the-what-and-how).

**[derived] Telegraphing:** conveyors get scrolling chevrons whose scroll speed equals the belt speed exactly (so the player can read the number off the animation). Wind gets streaked particles whose length scales with force and a faint gradient on the affected region's bounds. Never apply a directional force in a region the player cannot see the boundary of.

Composition note: a conveyor's direction being flipped by an ON/OFF switch is a documented and very productive puzzle: "Create two conveyor belts and connect an ON/OFF Switch to make the puzzle challenging—when the switch is hit, the conveyor belt changes direction" (https://supermariomaker2.fandom.com/wiki/ON-OFF_Switch_Research_Expedition).

### 5.5 Puzzle patterns that fit a platformer

**ON/OFF switch blocks.** "The ON/OFF switch alternates between two different colors of blocks, blue and red, turning one on and one off each time you hit it" (https://www.mariowiki.com/ON/OFF_Switch). Documented level patterns (all from https://supermariomaker2.fandom.com/wiki/ON-OFF_Switch_Research_Expedition):
- *Enemy control:* trap a hazard inside the red zone, at the cost of the coins on the other route.
- *Timed activation:* hit the switch at the right moment to grab something that only exists in one phase.
- *Sequential navigation:* keep something else (a kicked shell, in Mario) hammering the switch so the blocks cycle while you run.
- *Conveyor flip:* as above.
- *Backtracking lesson:* "players find blocks deactivated upon returning to an area, requiring them to revisit and press the ON/OFF Switch again while learning that the switch affects the entire level."
That last one is the key mental model to teach: **the switch is global, not local.** Teach it in a room where the consequence is trivial, then use it where it matters.

This primitive is also our troll engine (#27 spawn blocking) and half our luck engine — one system, three levels of use.

**Key and door.** The oldest pattern there is; a key is "a staple of game design" for gating progress (https://www.gamedeveloper.com/design/staples-of-game-design-part-ii-the-key). In a platformer the interesting variant is a **carried** key: it changes the player's jump (heavier, or no double-jump), so fetching it is a movement puzzle, not a walk. **[derived]**

**Levers vs. buttons vs. pressure plates.** "Levers are stationary puzzle elements that differ from keys in that they can't be picked up by the player, and buttons can be operated as pressure plates and can be pushed multiple times, unlike levers which are often permanent" (https://seb-brain.itch.io/reaction/devlog/942602/devlog-3-enemies-interaction-puzzles). Pressure plates work as "logic gates that can support multiple door targets and inversion toggles, where plates can activate from both the player and other game elements" (https://seb-brain.itch.io/reaction/devlog/942602/devlog-3-enemies-interaction-puzzles). The classic extension: "pushing a box into a pressure plate to open a door" (https://seb-brain.itch.io/reaction/devlog/942602/devlog-3-enemies-interaction-puzzles).

**Counting puzzles.** "Many puzzles require more complex state beyond simple on/off switches, such as pushing multiple blocks onto pressure plates, requiring variables to count how many conditions have been met" (https://groups.google.com/g/proceduralcontent/c/bFTkuSv2EUE/m/amjXt8EYAwAJ). Model the whole thing as a graph: "edges could represent locked gates and nodes could represent pressure plates that open gates" (https://groups.google.com/g/proceduralcontent/c/bFTkuSv2EUE/m/amjXt8EYAwAJ). **[derived]** A HUD readout `3 / 5 PLATES` is mandatory, otherwise a counting puzzle is indistinguishable from a bug.

**Ordered switch codes hinted by signs.** Escape-room practice: combination locks are popular "because it's easy to include significant numbers in a room among the clues", e.g. "a song with directions in the lyrics that matches a lock allowing up, down, left, and right movements" (https://medium.com/@sean.duggan/creating-a-combination-lock-65437db990c4). The design rule: "Combination locks work well where each digit is found in a different location (documents, room numbers, symbols on walls, etc.), encouraging exploration" (https://medium.com/@sean.duggan/creating-a-combination-lock-65437db990c4). And the fairness caveat: "puzzles need clear communication, and sometimes hints are needed to guide players" (https://itch.io/post/8267394).
**[derived] Platformer version:** four switches in a row; four signs earlier in the level each show a coloured shape and a number of dots. Pressing them out of order resets them with a buzz (no death). Put the sign for switch #3 slightly off the main path so an explorer feels clever — but put a fallback hint on the switch wall so a non-explorer isn't hard-stuck.

**Teleport mazes.** "A warp, also known as a portal or teleporter, ... might be deliberately installed within puzzles ... or be used as a punishment to a player straying from the 'correct' path" (https://en.wikipedia.org/wiki/Warp_(video_games)). The worked example of a wrong-portal loop is in §4.4(d) (https://davidmullich.com/2023/01/18/yahaha-and-the-amazing-maze-part-iii/). Keep the loop to 3 rooms and 2 seconds.

**Mirror mazes.** Ys I "has not one, but two asymmetric teleporting mirror mazes in its Very Definitely Final Dungeon", and Ys IV "had a tower with a mirror maze" (https://tvtropes.org/pmwiki/pmwiki.php/Main/TheMaze). **[derived] Platformer version:** a room that is horizontally mirrored, combined with reversed controls (#23), so mirrored input + mirrored geometry = your muscle memory is *correct* — which is the joke. Make one asymmetric landmark so the player can tell which side they're on.

**Composition rule for puzzles in a fast platformer [derived]:** keep every puzzle solvable in ≤ 20 seconds once understood, and make every wrong answer cost a reset buzz rather than a death. A puzzle that kills you is a trap, and traps belong in level 9.

---

## 6. Assembling the three levels

### Level 8 — Ultimate Obby Tycoon
Straight tycoon loop, zero trolls, generous checkpoints. The player buys 13 unlocks (§3.4), NPC runners generate income, running segments yourself pays 10×. It teaches the economy UI (buy pads, income readout, multiplier) that level 10 will later troll. Closes on The Gate at ~8 minutes, or ~5 if the player plays actively. Target: the player should never wait more than 90 seconds for the next purchase (https://devforum.roblox.com/t/how-do-i-properly-price-things-in-my-tycoon/2215102).

### Level 9 — Ultimate Troll
Zero currency, zero RNG, pure deterministic trap choreography. Run the catalogue in tier order: roughly 8 Tier-A trolls, 8 Tier-B, 4 Tier-C, and exactly 2 Tier-D (the cascade #37 and the fake goal #33). Checkpoint every ~10 tiles; respawn ≤ 300 ms; persistent death counter with a "traps discovered" badge (§2.2). End with the flagpole that attacks (#34) followed by the real exit 3 tiles left of where the player is looking (#35). Ghost-replay of every death on the clear screen.

### Level 10 — Luck + Skill + Tycoon + Trolls
The convergence. The tycoon economy returns, but now:
- Buy pads sometimes lie about their price (once, clearly, with a refund).
- Income comes partly from the Slot Gate (§4.4), which has visible odds and hard pity.
- Every luck gate has a skill bypass, and the skill bypass uses a launcher from §5 (spring, aim cannon, charge cannon).
- The switch puzzle from §5.5 opens the final gate; the ON/OFF state also spawn-blocks (#27) two of the trolls, so the player's own puzzle solution creates the hazards.
- The climax: a "Twice Twice" (#28) replay of level 8's opening room, now full of level 9's traps, with a `99%` door (§4.4) at the end.

---

## Sources

- https://en.wikipedia.org/wiki/Syobon_Action
- https://en.wikipedia.org/wiki/Trap_Adventure_2
- https://soranews24.com/2018/02/07/the-newest-game-to-drive-you-up-the-wall-is-out-introducing-trap-adventure-2-%E3%80%90video%E3%80%91/
- https://tropedia.fandom.com/wiki/I_Wanna_Be_the_Guy
- https://allthetropes.org/wiki/I_Wanna_Be_the_Guy
- https://tvtropes.org/pmwiki/pmwiki.php/VideoGame/IWannaBeTheGuy
- https://www.unfair-mario.com/
- https://causalzap.com/en/blogs/level-devil-levels-1-16/
- https://en.namu.wiki/w/Level%20Devil
- https://leveldevilfull.com/
- https://zotuf.com/level-devil-walkthrough/
- https://poki.com/en/g/level-devil
- https://www.gamespot.com/articles/level-devil-is-a-giant-hilarious-middle-finger-to-you/1100-6530177/
- https://www.geeksvsgeeks.com/2025/03/level-devil-review-platformer-that.html
- https://kaizomariomaker.fandom.com/wiki/Troll_Level
- https://supermariomaker2.fandom.com/wiki/Trolling_Techniques
- https://supermariomaker2.fandom.com/wiki/ON-OFF_Switch_Research_Expedition
- https://fasterthanli.me/articles/celebrating-mario-maker
- https://egmnow.com/these-super-mario-maker-level-designers-have-elevated-trolling-into-an-artform/
- https://www.mariowiki.com/Poison_Mushroom
- https://www.mariowiki.com/ON/OFF_Switch
- https://www.mariowiki.com/Barrel_Cannon
- https://www.mariowiki.com/Arrow_Barrel
- https://donkeykong.fandom.com/wiki/Rotatable_Barrel
- https://www.mariowiki.com/Trampoline
- https://www.mariowiki.com/Spring_platform_(Super_Mario_World)
- https://tvtropes.org/pmwiki/pmwiki.php/Main/TemporaryPlatform
- https://spelunky.fandom.com/wiki/Falling_Platform_(HD)
- https://en.wikipedia.org/wiki/VVVVVV
- https://www.hardcoregaming101.net/vvvvvv/
- https://www.giantbomb.com/inverted-controls/3015-5663/
- https://gamevoyages.com/why-is-super-meat-boy-so-difficult/
- https://www.mandible.net/2012/10/31/death-from-dungeon-crawl-to-meat-boy/
- https://critical-gaming.squarespace.com/blog/2011/1/6/super-meat-boy-pt3.html
- https://game-design-snacks.fandom.com/wiki/Quick_restarts_keep_the_player_involved.
- https://www.wayline.io/blog/the-art-of-rage-quit-design
- https://blog.playstation.com/2019/01/05/editors-choice-why-celeste-is-one-of-the-best-games-of-2018/
- https://playcritically.com/2025/06/30/celeste-review/
- https://www.gamejuice.co.uk/articles/coyote-time-input-buffering
- https://gamineai.com/blog/input-buffering-and-coyote-time-in-2d-a-godot-4-and-unity-friendly-timing-primer
- https://www.ryantreadwell.com/post/jump-terminology
- https://roblox.fandom.com/wiki/Tycoon
- https://generalistprogrammer.com/tutorials/how-to-make-a-roblox-tycoon-game
- https://devforum.roblox.com/t/tips-for-good-pricing-and-earnings-for-tycoon-games/2076918
- https://devforum.roblox.com/t/how-do-i-properly-price-things-in-my-tycoon/2215102
- https://devforum.roblox.com/t/tycoon-button-system/1923669
- https://devforum.roblox.com/t/tycoon-button-dependency-system/1565731
- https://github.com/adit-rah/ttt
- https://tycoon-but-one-dropper.fandom.com/wiki/Rebirths
- https://cookieclicker.fandom.com/wiki/Building
- https://cookieclickercalc.com/buildings
- https://dinogame.gg/blog/how-cookie-clicker-progression-works/
- https://www.roblox.com/games/8257407673/Obby-Tycoon
- https://tryhardguides.com/obby-tycoon-codes-for-free-cash/
- https://deltiasgaming.com/roblox-obby-tycoon-codes/
- https://devforum.roblox.com/t/obby-tycoon-feedback-thread/2785373
- https://www.roblox.com/games/10679961467/50-50-Pick-A-Door-Obby
- https://devforum.roblox.com/t/how-will-i-go-about-making-a-chance-system-that-supports-luck-boosts/2845064
- https://kitsblox.com/blog/how-to-make-rng-game-roblox
- https://mwm.ai/glossary/pity-system
- https://gamedesign.gg/glossary/pity-system/
- https://kitsblox.com/blog/how-to-make-roblox-obby
- https://www.creation.dev/blog/roblox-obby-design-guide
- https://roblox-obby-creator.fandom.com/wiki/Jump_Pad
- https://robloxbouncescript.pages.dev/posts/roblox-bounce-script/
- https://devforum.roblox.com/t/how-to-make-a-bounce-pad-for-obbies-using-linearvelocity-and-attachments/2013607
- https://en.wikipedia.org/wiki/Angry_Birds_(video_game)
- https://blog.gemserk.com/2012/07/03/drawing-a-projectile-trajectory-like-angry-birds-using-libgdx/
- https://galaxytrail.tumblr.com/post/25734526468/2d-platform-game-gimmicks-the-what-and-how
- https://www.gamedeveloper.com/design/staples-of-game-design-part-ii-the-key
- https://seb-brain.itch.io/reaction/devlog/942602/devlog-3-enemies-interaction-puzzles
- https://groups.google.com/g/proceduralcontent/c/bFTkuSv2EUE/m/amjXt8EYAwAJ
- https://medium.com/@sean.duggan/creating-a-combination-lock-65437db990c4
- https://itch.io/post/8267394
- https://en.wikipedia.org/wiki/Warp_(video_games)
- https://davidmullich.com/2023/01/18/yahaha-and-the-amazing-maze-part-iii/
- https://tvtropes.org/pmwiki/pmwiki.php/Main/TheMaze
