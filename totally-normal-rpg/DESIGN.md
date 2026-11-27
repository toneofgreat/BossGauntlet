# TOTALLY A NORMAL RPG - Game Design (source of truth)

Browser game for platyfy.com at `/totally-normal-rpg/`. Third-person 3D action RPG that looks and plays like a cosy,
realistic fantasy RPG for an hour, and then is not normal at all. Everything is procedural (geometry, textures,
music, sound). Builders: read this file for WHAT, and `CONTRACT.md` for HOW (APIs, ownership, ids). Where the two
disagree on an id or a signature, CONTRACT.md wins; on content and numbers, this file wins.

Interpretations of the request (decided here, final):
- "costs N levels" for the King portal, zones, morph and armor means a REQUIREMENT. Levels are NEVER spent or
  subtracted. The shop is a claim counter: an item is claimable once your level is >= its requirement.
- "only one try" for the Guards' Iron Sword means the drop happens exactly once in a run (100% on the first Guard you
  ever defeat); further Guard kills give levels only. You may re-fight the Guards as often as you like.
- Fydor and Myles ARE the two Guards (Area 2). Their legends are told in Area 1 so meeting them is a payoff.
- The Cat Boss and the Rookie Boss are real hidden secret bosses.
- "killing yourself" is implemented ONLY as a deliberate, confirmed leap into the void at the lobby edge, framed as a
  self-sacrifice. Non-graphic: no body, no impact, no sound of impact. Fade to white; the world dissolves.
- The "little girl song": the public-domain melody of "This Old Man", sung with ONLY the words
  "i love you, you love me..." and then she trails off humming the rest. No other lyrics. Never name any TV character.
- Main run (cycle 0) target: 60-120 minutes. Corrupted run (cycle 1, "NG+") target: 40-60 minutes.

---------------------------------------------------------------------------------------------------------------------

## 1. Title screen

- Pure black (#000) full screen. ~350 (low quality: 120) soft white particles (dust/ash) drift slowly upward and
  sideways with gentle turbulence, varying size 1-3 px, alpha 0.15-0.8, a few larger out-of-focus bokeh motes.
  They react subtly to the mouse/touch (drift away from the pointer, radius 120 px). Rendered on a 2D canvas (UI owns it),
  NOT the 3D renderer, so it is instant and cheap.
- The name in fine text, centered slightly above middle: `Totally a Normal RPG` in a thin serif
  (font stack: "Cormorant Garamond", "Georgia", serif - system fonts only, no web fonts), letter-spacing 0.35em,
  weight 300, color #e8e8e8, size clamp(20px, 6vw, 44px). Fades in over 4 s. Every ~11 s the word "Normal"
  flickers for 2 frames to a slightly misaligned copy (disabled when Reduce flashing is ON: instead a slow 1 s opacity dip).
  Below it a tiny subtitle `a perfectly ordinary adventure` (#888, 12-13px, italic).
- Buttons (stacked, centered, outlined thin white, 44 px tall min, width min(280px, 80vw)):
  `PLAY` (primary), `SETTINGS`, and when a save exists `CONTINUE` replaces PLAY and a small `new game` text link sits
  under it (asks "Start over? Your secrets and endings are kept." Yes / No).
- Photosensitivity note at the bottom (11-12px, #9a9a9a, max-width 360px, wraps):
  "This game contains jump scares and bright flashes. Turn on Reduce flashing in Settings to soften them."
  with an inline toggle link `Reduce flashing: OFF/ON`.
- Corner: the Secrets leaderboard (see section 13) is visible on the title screen too, collapsed to a small pill.
- `<- platyfy` back link top-left (like other platyfy games), tiny.
- Audio: browsers block sound until a gesture, so the screen shows `click anywhere for sound` (fades after) and the
  title music starts on the first pointerdown/keydown (UI calls `audio.unlock()` then `audio.music("title")`). Title music: see Music section M1 (slow heartbeat bass drum
  that alternates slow / twice-as-fast / slow / twice-as-fast, with low piano).

### 1.1 Name entry (first PLAY only; the name is saved)
- After PLAY: the title text slides up, a single input appears: label `What is your name, traveller?`, placeholder
  `your name`, button `BEGIN`. 3 to 24 characters. Enter key submits.
- Filter (UI implements `validateName(raw)` exactly as specified in CONTRACT 9.3):
  - trim + collapse spaces. Case-insensitive special cases ALLOWED even though the general filter would reject them:
    exactly `idiot` (any case) and exactly `mygranniesamotherfucker` (any case, no spaces). These are "the worst words
    you can use". Nothing else that contains a bad word is allowed: `mygranniesamotherfucker2`, `my grannies a ...`,
    `idiotfuck` etc. are all rejected.
  - Otherwise reuse `checkName` / `isRude` from `../platypus/src/names.js`, but with a 24-char max: names of 17-24
    chars are checked with the same character rule `/^[A-Za-z0-9 _-]+$/`, at least 2 letters, and `isRude(name)===false`.
  - Rejected rude names show `That word is too bad. The worst you can say is "idiot".` (fits 390px, wraps).
    Other hints reuse `nameHint(reason)` with "3 to 24 letters" replacing "3 to 16 letters".
- The in-game name is shown above the player (small, white, 70% alpha) and in dialogue ("Morning, <name>.").
- Online display name for the leaderboard is derived (CONTRACT 9.3): special name -> `MyGrannie`; >16 chars -> first 16
  chars trimmed; if the claim is "taken" append 2 digits (up to 3 tries) keeping <= 16 chars.

### 1.2 Play -> the world
- Clicking BEGIN/PLAY/CONTINUE: title music ducks and stops over 2.5 s; particles accelerate gently upward and thin
  out; screen fades black -> the 3D world fades in over 3 s (from a soft white-green bloom) on a realistic green
  landscape at mid-morning: you are standing outside the front door of the Lobby House, camera starting high and
  close behind the player, swinging in over 2.5 s (letterbox bars slide away). A gentle wind, birds, distant river.
  Area 1 music fades in after 4 s (WORLD's first zoneMusic call after game:start passes `{ delay: 4 }`). First objective appears: `Cross the bridge` with a waypoint marker.
- The 3D world is created during the title screen (progressive build) so Play is instant.

---------------------------------------------------------------------------------------------------------------------

## 2. Look, feel and realism targets ("ultracode the realism")

- Real-world scale (1 unit = 1 m). Player 1.8 m. Third-person camera 4.5 m behind, 1.6 m up, collision-aware.
- Lighting: physically based (MeshStandardMaterial), ACES filmic tone mapping, sRGB output, one directional sun with
  soft PCF shadows (tight frustum ~40 m following the player, 1024/2048 map by quality), hemisphere sky/ground fill,
  analytic sky dome shader (Rayleigh/Mie-ish gradient + sun disc + subtle clouds), exponential height fog tinted to
  the sky horizon. Time of day is fixed per zone (presets, CONTRACT 5.6).
- Terrain: heightfield (gentle rolling hills, carved river, cliffs at the lobby void edge), splat shader blending
  grass / dry grass / dirt path / rock by slope, height and a road mask, with procedural detail normals, macro variation
  noise to kill tiling, and distance blending.
- Vegetation: instanced grass blades (wind sway in the vertex shader, fade with distance, player-push bend), flowers,
  bushes, 3 tree species (oak, pine, birch) with trunk/branches/leaf cards, LOD: full mesh < 60 m, simplified 60-160 m,
  camera-facing impostor billboard beyond, fog hides the rest. Rocks with procedural normals.
- Water: river with a shader (scrolling normal noise, fresnel sky reflection, depth tint, foam at banks/rocks), a waterfall
  (scrolling streaks + spray particles + mist), sound.
- Materials: canvas-generated textures (albedo + normal-from-height + roughness) for wood planks, bark, stone bricks,
  plaster, roof tiles, thatch, cloth, iron, gold, sand, cheese (yes), fur. Shared and cached; mipmapped; anisotropy 4.
- Postfx (one composite pass, quality-scaled): soft bloom, vignette, film grain (subtle), colour grade per preset,
  chromatic aberration only in horror moments, screen flash/fade, red "corruption" tint for cycle 1.
- Characters: procedural humanoids built from smooth primitives (capsules/lathes), skin/cloth materials, procedural
  animation (walk/run cycles, idle breathing, attack swings, hit reactions, death crumple). Faces: simple sculpted
  heads with eye spheres (eyes glow red in cycle 1).
- Performance: Intel UHD 620 @1280x720 45-60 fps; phones 30+ fps. Instancing everywhere, merged static geometry per
  zone, far zones built but hidden (`visible=false`) when not current, auto quality scaling (CONTRACT 5.7).

---------------------------------------------------------------------------------------------------------------------

## 3. Controls

- Desktop: WASD/arrows move, Shift sprint (no stamina; allowed everywhere, bosses are tuned for it), Space jump, Left click or F = attack (punch with fists, slash with swords; hold 0.6 s for a
  heavy attack), Right click (tap) or Q = dodge-roll (0.45 s, i-frames 0.25 s, 0.9 s cooldown), E = interact,
  I or Tab = inventory, Esc = pause/settings. Mouse look: pointer lock on click into the game (optional setting);
  without lock, drag with left/right button to look. Wheel = camera distance (2.5-7 m).
- Phones: left half = floating virtual joystick (appears where the thumb lands), right half drag = look; buttons on the
  right: ATTACK (big; hold = heavy), JUMP, DODGE, and an INTERACT button that only appears (pulsing, with the label,
  e.g. "Talk") when something is interactable. Top-right: menu (inventory/settings). Pointer events only.
- Browser zoom blocked exactly like `adventure-cube/index.html` (dblclick, double-tap, pinch, gesture*, ctrl+wheel,
  ctrl +/-/0), and `touch-action: none` on the game surface; inputs/text fields still work.

---------------------------------------------------------------------------------------------------------------------

## 4. Progression rules (the numbers)

### 4.1 Levels
- You start at level 0. Levels are gained only by kills (and a few secret rewards) and are never lost or spent.
- Base levels per kill (fixed by the request): Small Rat 1, Rat King 3, Villager 10, Guard 50, Royal Guard 500.
  The King gives a FLAT +100,000 per win (not multiplied).
- Levels gained = round(base x MULT), where MULT = swordMult x armorMult x morphMult x crownMult x charmMult.
  Popup over the enemy: `+1,234 LV` (gold text), and a level counter tick-up in the HUD.

### 4.2 Gear and multipliers (cycle 0)
| Item (id) | Slot | How you get it | Level mult | Combat |
|---|---|---|---|---|
| Fists (`fists`) | sword | start | x1 | 10 dmg, 0.40 s, reach 1.9 m (the "punch ability") |
| Smelly Sword (`smelly_sword`) | sword | first Small Rat kill ever | x2 | 14 dmg, 0.50 s, 2.6 m, hits apply a 3 s stink (2 dmg/s), green fumes |
| Cheese Sword (`cheese_sword`) | sword | first Rat King win | x3 | 18 dmg, 0.50 s, 2.7 m, yellow, crumbs on hit |
| Wooden Sword (`wooden_sword`) | sword | Villager kill, 1 in 5 chance, until owned once (pity: guaranteed on the 10th Villager kill without it) | x4 | 22 dmg, 0.50 s, 2.8 m |
| Iron Sword (`iron_sword`) | sword | first Guard defeated ever, 100%, only once | x8 | 30 dmg, 0.55 s, 3.0 m |
| Gold Sword (`gold_sword`) | sword | first Royal Guard kill ever, 100%, only once | x20 | 42 dmg, 0.55 s, 3.1 m |
| King's Staff (`kings_staff`) | sword | first King win | x40 | 55 melee + ranged bolt (heavy attack) 40 dmg, 25 m |
| Cat Claws (`cat_claws`) | sword | Cat Boss (secret) | x8 | 12 dmg x fast 0.25 s, 2.0 m |
| Smelly Armor (`smelly_armor`) | armor | auto at 5 levels | x1.5 | +20 HP, 10% DR |
| Cheese Armor (`cheese_armor`) | armor | auto at 125 levels | x3 | +50 HP, 20% DR |
| Iron Armor (`iron_armor`) | armor | claim at the Village Exchange at 1,000 | x6 | +100 HP, 35% DR |
| Golden Armor (`golden_armor`) | armor | claim at the Village Exchange at 250,000 | x12 | +200 HP, 50% DR |
| Villager Morph (`villager_morph`) | morph | claim at the Village Exchange at 200 | x2 | look like a villager; villagers say "...brother?" before fighting |
| King's Crown (`kings_crown`) | crown | auto at 1,000,000 levels | x2 | +50 HP, golden glow |
| Rookie Badge (`rookie_badge`) | charm | Rookie Boss (secret) | x1.1 | - |
| Tom's Bell (`toms_bell`) | charm | Cat Boss (secret) | x1.25 | jingles when you walk |
| Elsie's Ribbon (`girls_ribbon`) | key item | the girl (cycle 1) | - | buried at a grave |

- The best sword/armor auto-equips when obtained (toast "Equipped Iron Sword"); the player can re-equip anything owned
  in the inventory (e.g. Cat Claws). Armor is visible on the avatar (tinted plates/cloth), swords in the right hand.
- MULT uses the EQUIPPED items (so equipping fists for fun lowers gains; inventory shows the current MULT).

### 4.3 Unlocks and gates (cycle 0; cycle 1 values in 4.7)
| Threshold | Unlock | How |
|---|---|---|
| 5 | Smelly Armor | auto |
| 50 | Area 2 gate opens | auto (gate swings open + banner "AREA 2 UNLOCKED") |
| 125 | Cheese Armor | auto |
| 200 | Villager Morph | claim at Village Exchange |
| 1,000 | Iron Armor | claim at Village Exchange |
| 50,000 | Area 3 (castle road gate) | listed at the Exchange ("Castle Pass", auto-claimed when you reach it) |
| 100,000 | King's portal usable | requirement only (portal in the castle great hall) |
| 250,000 | Golden Armor | claim at Village Exchange |
| 1,000,000 | King's Crown | auto |
Locked gates show `Requires 50 levels (you have 37)`.

### 4.4 Pacing table (cycle 0, simulated with the rules above; Wooden Sword assumed on Villager kill #5)
| Milestone | Farm this | Effective LV/kill at that time | Kills needed (cumulative) | Approx minutes |
|---|---|---|---|---|
| 5 (Smelly Armor) | Small Rats | 1, then 2 (Smelly Sword) | 3 rats | 1.5 (incl. bridge walk) |
| 50 (Area 2) | Rat King | 9 first win, then 14 | 4 Rat King wins | 6 |
| 125 (Cheese Armor) | Villagers | 45 | 2 villagers | 2 |
| 200 (Morph) | Villagers | 90 | 1 villager | 1 |
| 500 (Guards rec.) | Villagers | 180-240 | 2 villagers (Wooden Sword drops ~here) | 2 |
| 1,000 (Iron Armor) | Guards | 1,200 (first guard) | 1 guard | 3 |
| 50,000 (Area 3) | Guards (pairs) | 4,800 each / 9,600 per duo | 11 guards (~6 duo fights) | 14 |
| 55,000 (Royal rec.) | Royal Guards | 48,000 | 1 royal guard | 1.5 |
| 100,000 (King portal) | - (reached with the same kill: Gold Sword x20) | - | 0 | 0 |
| King fight | King | +100,000 flat | 1 win | 5 |
| 250,000 (Golden Armor) | Royal Guards | 240,000 | 1 royal guard | 1.5 |
| 1,000,000 (Crown) | Royal Guards | 480,000 (King's Staff equipped) | 2 royal guards | 3 |
Total ~32 fights, ~40 min combat + walking, dialogue and secrets (~15 min) + post-King story (~15-20 min) = ~70-80 min.
No milestone needs more than ~12 kills of the right enemy (limit is 40). Farming weaker enemies still works but is slow
(intended). Level popups abbreviate >= 1e6 as `1.40M`.

### 4.5 Combat power formula (log-ratio vs recommended level)
```
L   = max(1, playerLevel)            rec = enemy recommended level (>= 1)
r   = log10(L / rec)
OUT = clamp(10^(0.6*r), 0.25, 4)     // your damage multiplier
IN  = clamp(10^(-0.6*r), 0.25, 4)    // enemy damage multiplier on you
damage dealt  = weaponDmg * (heavy ? 2.5 : 1) * (crit ? 1.5 : 1) * OUT        crit chance 10%
damage taken  = enemyHit * IN * (1 - armorDR)
```
At the recommended level both are x1. 10x over-levelled: x3.98 dealt, x0.25 taken. 10x under: x0.25 dealt, x3.98 taken.
Player HP = 100 + armor HP + crown HP. Regenerates 6 HP/s after 5 s without taking damage. Hit i-frames 0.35 s.
Enemy name plates show `Rec. Lv 50` coloured green (you are >= 2x), white (0.5x-2x), red (< 0.5x).

### 4.6 Enemies and bosses (cycle 0)
Telegraphs: every heavy attack shows a red ground decal or a 0.5-0.8 s wind-up pose + sound. "jumpable" = a ground
shockwave ring you avoid by jumping; dodge-roll i-frames also avoid it.
| Enemy | Rec | HP | Attacks | Respawn |
|---|---|---|---|---|
| Small Rat | 1 | 30 | bite 6 (1.2 s), scurry-circle, flee at 20% HP for 1 s | 12 alive in the Rat Field; a dead rat respawns after 4 s at a random field point |
| Golden Rat (secret) | 1 | 60 | none, flees fast; 1-in-40 chance a respawning rat is golden (max 1 at a time) | as rats |
| Rat King | 5 | 520 | P1: tail sweep 12 (jumpable), lunge bite 15, summons 3 small rats every 20 s; P2 (<50%): rolls a giant cheese wheel charge 20, squeak shockwave ring 10 (jumpable), +20% speed | 10 s after defeat, arena gate reopens |
| Villager (x8, one per house) | 50 | 450 | pitchfork poke 14 (1.1 s), wide sweep 18, kick 8 + knockback; raises pitchfork to block frontal hits 25% of the time (hit from the side/back) | 20 s, walks out of his own house |
| Guard Fydor | 500 | 1,400 | halberd cleave 26, overhead slam ring 22 (jumpable), charge 20; slow, heavy | both guards respawn 30 s after both are down |
| Guard Myles | 500 | 1,400 | sword+shield: blocks frontal hits while shield raised (3 s up / 1.5 s down, the shield glints when lowering), 3-hit combo 10 each, shield bash 18 + stun 0.5 s, reads you: dodges your heavy attacks 50% | with Fydor |
| (Guards) | | | Fight as a pair. When one falls the other enrages (+30% speed, +20% dmg) and says a line. | |
| Royal Guard (x6) | 55,000 | 1,500 | spear thrust 22, leaping strike 30 (red circle), shield wall with a partner (front immune), pairs aggro together | 15 s each |
| The King | 100,000 | 6,000 | Dark arena. P1: staff bolt fan (3 x 20), staff swing 25; P2 (<66%): shadow-teleports behind you (audio cue: a whisper panned to where he appears), slam ring 28 (jumpable), summons 2 Shadow Guards (HP 300, 15 dmg); P3 (<33%): the last lights go out, only his eyes, crown and staff glint; spiral bolt barrage 12 each; he taunts | any time via the portal; each win +100,000 |
| Big Tom, the Cat Boss (secret) | 5,000 | 2,500 | pounce 24 from the rafters (shadow on the floor), 3-swipe 9 each, hiss cone (slows you 40% 2 s), knocks a lamp to darken the barn | after the first win he can be re-fought by ringing the bell at the barn door |
| Rookie, the Rookie Boss (secret) | = your level | 900 | everything telegraphed 1.5 s; trips over his own cape (stunned 2 s); P2 (<50%) "I've got this!": combos get faster | re-fightable, says something new each time (3 lines then repeats) |
Rewards: Cat Boss base 1,000 levels (multiplied), Cat Claws + Tom's Bell; Rookie base 100 (multiplied), Rookie Badge.
How fights start (COMBAT `combat.startFight(id)`, all re-fightable unless stated): Rat King - walking through the arena
entrance gap (gate closes behind you); Guards - talk to Fydor at the post, his line ends with the choice `Fight` /
`Not yet` (STORY calls startFight("guards") on Fight); Cat - only after the `kittens` secret is in the profile, Big Tom
waits in the rafters and the fight starts on entering the barn; Rookie - talking to him in his shack (`Fight me?!`
choice). King - entering kingDark. Villagers and Royal Guards aggro by proximity (10 m) like rats (6 m).
Boss music: COMBAT pushes `boss` (Rookie: `bossRookie`) on its boss:start and pops on boss:end; the King uses the
kingDark zone music.

### 4.7 Cycle 1 ("the corrupted run", NG+) modifiers
After the throne fight (section 8.6) the entire game restarts with state.run.cycle = 1:
- Reset: level 0, all gear except nothing (start with fists), flags, kills. Kept: name, settings, secrets, endings,
  playtime, the cycle number.
- Everything has RED EYES (enemies, NPCs, even the ducks), the sky is slightly bruised (preset `*-corrupt`), music uses
  the NG+ variants, the "Totally a Normal RPG" sign now reads "Totally a Normal RPG?".
- Zones cost more: Area 2 at 100, Area 3 at 100,000, King portal 200,000 (x2). Armor/morph/crown thresholds unchanged.
- Enemies: rec x2, HP x1.5, damage x1.4, and each gains an ability:
  Small Rat: pounce leap + gnaw bleed (3 dmg/s 3 s). Rat King: burrows and erupts under you, throws moldy cheese bombs.
  Villager: throws a torch that leaves a fire patch (5 dmg/s). Fydor: ground-crack line (fissure travels toward you).
  Myles: counter-riposte (if you hit his raised shield he parries and strikes 20). Royal Guard: blink strike (teleport 6 m).
  The King: two mirror clones from the start (hitting a clone pops it), lights-out from phase 1.
- Drops are HORRIBLE items (ugly, sticky, smelly, cursed-looking) but stronger (x1.5 the normal multiplier, same damage)
  so pacing stays similar (~45 min):
  Rotten Sock Sword (smelly), Moldy Cheese Sword (cheese), Termite Plank (wooden), Rust Stick (iron), Fool's Gold Sword
  (gold), Bent Twig Staff (king's staff), Wet Cardboard Armor (smelly armor), Sour Milk Armor (cheese armor),
  Rusty Bucket Armor (iron), Gold-Painted Bin Lid (golden), Scarecrow Morph (morph), Paper Crown (crown). Each has a
  harmless funny downside (sock sword attracts flies; bin lid clangs on every step; paper crown blows off in the wind
  once a minute and floats back). Ids: `bad_` + normal id, e.g. `bad_iron_sword` (CONTRACT 8.2).

### 4.8 Death and respawn
- HP 0 anywhere normal (Areas 1-3, King's dark arena, Cat/Rookie): 1.2 s slow-mo crumple, screen desaturates,
  "YOU DIED" (thin serif, not gory) with a hint line; 2.5 s later fade in at the Lobby House spawn (0,0,10) with full
  HP. No level or item loss. Bosses you were fighting reset to full HP. "if you die you go to spawn like normally".
- Scripted sequences override respawn (EVENTS installs a death handler):
  desert/forest walk: respawn at the zone entry; collapse chase: last checkpoint, no fade, 0.6 s; throne fight: the
  throne room door; Hollow II fight: the Hollow Desert arena edge; final giant fight: lose a life (3 lives), out of
  lives = Idiot ending (see 9.4).
- Falling into the void anywhere except the deliberate leap: you are caught (fade to black 0.8 s) and set back on the
  last safe ground with -10% HP. The deliberate leap requires the choice state AND a confirmation (section 9.2).

### 4.10 CONTINUE / resume rules (position is never saved; you always resume at the lobby spawn unless stated)
Saved phase -> resumed as: intro..area3, postKing, ng, ngPostKing -> same phase at lobby spawn; desert, forest,
forestHouse, chase, collapse -> `postKing` at the lobby (lobbyBack portal active, the post-King walk restarts);
throne -> `throne` at the throne door (the fight restarts at full HP); hollowDesert, girl, hollow2 -> `ngPostKing` at
the lobby (ribbon kept if picked up); choice, finalBoss, ended -> `choice` via the choice snapshot at the black sword.
STORY normalises `run.phase` on `game:start` when `newGame` is false (a direct write, not a transition), and every
module re-applies run-dependent world state (open gates, portals, Bram hidden, red eyes, sign "?") on `game:start`.
The 10-minute idle counts game time, which only advances while the tab is visible and the game is not paused.

### 4.9 Save (localStorage)
Key `tnrpg.save.v1`, JSON, versioned (`v: 1`), written on: level milestone, item get, secret, zone change, ending,
every 20 s while playing, and `pagehide`. Shape in CONTRACT 8.5. Corrupt/unknown version -> keep a backup copy at
`tnrpg.save.bak`, start fresh. Secrets and endings live in `profile` and survive "new game".

---------------------------------------------------------------------------------------------------------------------

## 5. Story

### 5.1 Premise (what the player believes)
A sunny valley with a lobby house, a river, rats in the field and a Rat King under the old mill. Further on, a village,
two legendary guards, a castle and a King. A totally normal RPG.

### 5.2 What is actually going on (revealed in pieces)
Long ago something came through behind the Lobby House: the Hollow, a black creature "like a hole someone cut out of
the night". It feeds on endings. The first King sealed the way behind the Lobby House with his own staff and made the
valley a loop: kill rats, get stronger, get a sword, the same story forever - a game that is "totally normal" so that
nobody ever goes looking behind the house. Fydor and Myles, two brothers, saw the Hollow once as children, the night
their little sister Elsie followed a song into the desert and never came back. They became guards so it would never
happen again. When you beat the King, the seal breaks.
The Hollow cannot be killed by someone who is still playing its loop. In the corrupted second run it wears Elsie's
shape to lure you. When it finally loses it offers itself as a sword: whoever holds it becomes the next Hollow.

### 5.3 NPCs (Area 1 and beyond; STORY writes the final lines, these are the beats)
| id | Name | Where | Role / beats |
|---|---|---|---|
| `bram` | Old Bram | lobby porch | Tutorial: "Morning, <name>. Rats got into the field again. Cross the bridge, give 'em a punch." Explains E/attack. Later remarks get nervous. |
| `nessa` | Nessa the bridge-keeper | bridge east end | Tells FYDOR's story (5.4). Ends: "You will never beat Fydor." |
| `tobin` | Tobin (kid) | rat field fence | Tells MYLES's story (5.4). Ends: "You'll never beat Myles either." |
| `ilsa` | Grandma Ilsa | village bench | Rumor: "Some say there's a cat boss somewhere. Big as a cart. Nobody's ever seen him. ...You hear bells at night, though." (hint: kittens) |
| `pell` | Pell the bard | village square | Rumor: "And there's a Rookie Boss. Brand new. Very nervous. Nobody's ever heard of him - which is what he wants, I expect." (hint: waterfall) |
| `odo` | Odo of the Village Exchange | village stall | The shop. "Nothing is for sale. Everything is for EARNING." Lists claims. |
| `wren` | Wren the herald | castle courtyard steps | About the King: "His Majesty fights in the dark. He says the light was never his friend." Points at the portal and its 100,000 requirement. |
| `fydor` / `myles` | the Guards | guard post | Pre-fight lines; post-defeat respect. After the King: "You broke the seal. Don't go behind the house." |
| `sign` | the Totally Normal sign | spawn | "TOTALLY A NORMAL RPG. Nothing to see behind the house." 5th read: "please." (secret) |
| `girl` | the little girl | Hollow Desert (cycle 1) | Crying, singing, jumpscare (section 9). |
| `hollow` | the Hollow | throne / Hollow Desert / final | Speaks in subtitles, all lower-case, distorted voice synth (audio): "we will meet again." |
In cycle 1 every NPC's lines shift (same beats, wrong words: Bram: "Rats got into the field again. Again. Again."),
eyes red.

### 5.4 The two legends (told in Area 1, paid off in Area 2)
- Fydor (Nessa): "Twenty winters back the first Rat King came up out of the mill cellar with a thousand rats behind
  him. Everybody ran. Fydor didn't. He stood on this bridge three days and three nights with nothing but a fence post,
  and on the fourth morning the river ran grey with rats and Fydor was asleep - standing up. They made him guard of the
  village for life. He has never lost. Not one fight. You will never beat Fydor."
- Myles (Tobin): "Myles is Fydor's little brother. He learned to fight by watching Fydor, and he watched so long he
  knows what you'll do before you do it. A man once threw a rock at the back of his head and Myles caught it without
  turning round. Then he put it in his pocket. He still has it! You'll never beat Myles either."
- Payoffs: Myles really dodges heavy attacks and catches thrown things (his flavour). On defeat Myles drops to one knee:
  "Fydor... they beat us." Fydor: "Then they're ready. Gods help them." Their secrets (Fydor's Locket, Myles's Letter)
  tell 5.2 (Elsie, the Hollow).

### 5.5 Quest / objective director (on-screen directions)
Top-centre objective line (`> Cross the bridge`) + a world waypoint marker (diamond + distance in m) clamped to screen
edges when off-screen. Objectives advance on events; optional tips appear as small toasts.
| # | Condition to show | Objective text | Waypoint |
|---|---|---|---|
| 1 | game start | Cross the bridge | bridge far end |
| 2 | crossed bridge | Fight the small rats | rat field centre |
| 3 | first rat kill | Beat rats to level up (Lv 5 for the Rat King) | rat field |
| 4 | level >= 3 | Talk to Tobin by the fence (optional, toast only) | - |
| 5 | level >= 5 | Beat the Rat King at the old mill | rat king arena |
| 6 | first Rat King win | Reach level 50 to open the village gate | rat king arena (farm) |
| 7 | level >= 50 | Enter the village (Area 2) | area 2 gate |
| 8 | in village | Fight the villagers (Lv 50) | nearest live villager house |
| 9 | level >= 200 | Claim the Villager Morph at the Exchange | exchange |
| 10 | level >= 500 | Defeat the guards, Fydor and Myles (Lv 500) | guard post |
| 11 | iron sword | Claim Iron Armor at the Exchange (Lv 1,000) / Reach level 50,000 for the castle | exchange / guard post |
| 12 | level >= 50,000 | Climb to the castle (Area 3) | area 3 gate |
| 13 | in castle | Defeat the Royal Guards (Lv 55,000) | courtyard |
| 14 | level >= 100,000 | Enter the King's portal | portal |
| 15 | first King win | Something opened behind the Lobby House | lobby back portal |
| 16 | desert | Keep walking | (no marker) |
| 17 | forest | Keep walking | (no marker) |
| 18 | forest house | Go outside | house door |
| 19 | chase | RUN | next portal / checkpoint |
| 20 | collapse | RUN TO THE CASTLE | castle |
| 21 | throne | Survive | - |
| 22 | cycle 1 start | Cross the bridge. Again. | bridge |
| 23 | cycle 1 king beaten | The house in the forest | lobby back portal, then the forest house door |
| 24 | hollow desert | Someone is crying | girl |
| 25 | after girl | It is here | Hollow |
| 26 | choice | (no text; the four options are discoverable; a faint toast once: "What now?") | sword |
Setting "show hints" (default ON): OFF hides the world waypoint marker and the optional toast tips (#4); the objective
text always shows. Secrets never get markers.
Phase changes driven by the director (STORY): `intro` -> `area1` on crossing the bridge; `area2` on first entering the
village; `area3` on first entering the castle; `postKing` etc. per CONTRACT 10.2.

---------------------------------------------------------------------------------------------------------------------

## 6. Map (world coordinates, metres; +Y up; the main valley runs along +Z = "south")

### 6.1 Main valley (region `main`, terrain x -220..220, z -120..560)
| Zone id | What | Centre / key points |
|---|---|---|
| `lobby` | Lobby plateau, radius 36 | Lobby House footprint 12 x 10 centred (0,0,0), front door at (0,0,5) facing +Z. PLAYER SPAWN (0,0,10) yaw 0 = facing +Z. Bram on the porch (3,0,6.5). Sign (3.5,0,12). Lobby-back portal (post-King) at (0,0,-12). Kitten #1 on the roof ridge (-4,7.2,-1) (climb the woodpile (-7,0,-4) -> water barrel -> eave). Basement trapdoor under the rug inside (2,0,-2) (secret). |
| `graves` | small fenced graveyard on the plateau | centre (30,0,-6), 6 graves in a row at x = 25..35 step 2, z = -8; a shovel leaning on the fence (32,0,-2) |
| `voidEdge` | the cliff on the west of the plateau | broken fence gap at (-37,0,-4); beyond x < -40 the ground falls away into fog-white void (terrain drops to -400) |
| `path1` | dirt road | (0,0,12) -> (0,0,54) |
| `bridge` | stone-and-timber bridge over the river | river runs along X, banks at z=54 and z=66; bridge deck (0,2.2,60) 4 m wide 18 m long (z 51..69); Nessa at (3,0,70). Under-bridge nook (-1.5,-0.8,60) reachable from the west bank (secret). |
| `waterfall` | cliff waterfall feeding the river | waterfall face at (-72,0..14,60); cave behind it (-78,1,60) -> Rookie's shack `rookieShack` (-88,1,60) |
| `ratField` | meadow with haystacks, fences | centre (0,0,100), 70 x 50; Tobin at (-22,0,78); haystack with kitten #2 (18,0,108) |
| `ratKing` | sunken stone ring by the old mill ruin | ring centre (0,-1.5,148) radius 16; mill ruin (14,0,154); arena entrance gap facing -Z at (0,0,132) |
| `gate2` | wooden palisade gate | (0,0,178) |
| `village` | 8 houses around a square | square centre (0,0,240); houses on a ring r=34 at angles 0,45,...,315 deg (house k at (34 sin a, 0, 240 + 34 cos a)), doors facing the square; villager spawns 3 m in front of each door. Well (0,0,240) (Fydor's Locket at the bottom: interact the bucket). Exchange stall (12,0,226) with Odo. Ilsa bench (-9,0,232), Pell (6,0,250). Kitten #3 on the chimney of house 2 (45 deg). |
| `barn` | Old Barn (Cat Boss) | (-80,0,236), 16 x 24, hayloft rafters at y 6 |
| `guardPost` | walled yard + watchtower | yard centre (0,0,300) 30 x 20; Fydor spawn (-5,0,302), Myles (5,0,302); watchtower (14,0,308) 12 m tall, Myles's Letter in the top room |
| `gate3` | stone gate, castle road | (0,0,332); road climbs to y=18 by z=400 |
| `castle` | castle | outer walls z 400..510, x -45..45; courtyard centre (0,18,425) with 6 Royal Guard posts (x -15/-5/5/15 at z 420 and x -8/8 at z 432); Wren at (-6,18,440); great hall (0,18,465) with the King's portal at (0,18,474); portrait room (-30,18,465) (secret: the old King's portrait shows Fydor, Myles and Elsie as children) |
| `throne` | throne room (north end) | (0,20,495), hall 24 x 30, throne at (0,21,506); door at (0,20,481). Sitting on the throne (E) = secret (cycle 0, before the chase). |

### 6.2 Off-map zones (separate pockets far away, fogged so they look endless; only the current one is visible)
| Zone id | What | Coordinates |
|---|---|---|
| `kingDark` | the pitch-black place: flat obsidian disc r=30, no sky, no fog colour (black) | centre (2000,0,0); player arrives (2000,0,22); King at (2000,0,-10); return portal appears at (2000,0,24) after a win |
| `desert` | foggy desert with cacti, dunes, bleached bones, wind | region centre (0,0,-2000), 800 x 800 m; arrive at (0,0,-1700) facing -Z; `desertBack` portal behind you at (0,0,-1696); `desertExit` portal is placed by EVENTS ~70 m ahead of the player after 60 s; blooming cactus flower (secret) at (95,0,-1950) |
| `forest` | dense conifer forest, a single trail | trail from (-1750,0,0) west to the forest house clearing (-2150,0,0); `forestBack` portal at (-1746,0,0); whispering totem (secret) at (-1900,0,32) |
| `forestHouse` | small cabin, interior + clearing | cabin centre (-2160,0,0), door on the east wall (-2155,0,0) facing +X; interior spawn (-2162,0,0) facing +X |
| `collapse` | the collapsing valley (built by EVENTS as a crumbling replica of the main valley) | start (3000,0,0) (lobby-house silhouette), along +Z to the castle gate replica at (3000,18,600) |
| `hollowDesert` | "a desert again" (cycle 1 only, behind the forest-house door) | arrive (0,0,-3990) facing -Z; the girl sits on a dune at (0,0,-4080); Hollow appears far at (0,0,-4320); fight arena circle r=60 centred (0,0,-4150); `homePortal` (to lobby) at (0,0,-3985) opens after the Hollow II fight |
| `finalArena` | the end of the map: a floating disc of torn landscape above a white void | centre (0,0,8000), r=70; player arrives (0,0,8050); the giant Hollow stands (feet) at (0,0,7930), 60 m tall |

Distance markers: desert walk to the exit portal is ~60 s at walk speed (5 m/s) ~= 300 m equivalent; the desert is a
large looping field (the player can walk any direction; the portal is placed in front of them). Looping: WORLD wraps the
player (teleport to the mirrored position, keeping velocity/yaw, hidden by fog) whenever they get more than 330 m from
the desert centre (0,-2000); EVENTS clamps any portal it places to within 300 m of the centre. Forest and hollowDesert
use invisible boundary colliders instead (forest: 12 m either side of the trail beyond the trees; hollowDesert: r 280).
Gaps between zone bounds (e.g. the road z 36..51 between lobby and bridge) belong to `path1`; any point outside every
zone keeps the previous zone.

### 6.3 Secret locations summary
Under-bridge nook (-1.5,-0.8,60); waterfall cave (-78,1,60); Rookie's shack (-88,1,60); lobby basement (2,-3,-2);
kittens (-4,7.2,-1), (18,0,108), house-2 chimney; Old Barn (-80,0,236); well (0,0,240); watchtower top (14,12,308);
portrait room (-30,18,465); throne (0,21,506); cactus flower (95,0,-1950); totem (-1900,0,32); void edge (-37,0,-4).

---------------------------------------------------------------------------------------------------------------------

## 7. Area set-pieces (cycle 0)

- Area 1: morning, warm sun, birds, river, meadows of wildflowers. Rats are realistic grey-brown (fur shading, pink
  tails), squeaks, scurry. The Rat King: a rat the size of a cow wearing a bottle-cap crown, cheese-rind cape.
- Area 2: early afternoon, thatched/timber houses with smoking chimneys, washing lines, chickens (ambient), dogs bark.
  Villagers are farmers with pitchforks; one per house; they shout "Get off my land!" when they aggro.
  The guard post: stone walls, banners; Fydor (huge, grey beard, halberd) and Myles (lean, shield, scarf).
- Area 3: golden late afternoon, the castle on the hill, flags, torches, royal guards in white-and-gold plate with
  spears. The King's portal: a vertical ring of black glass with a slow inward smoke swirl.
- King's dark arena: nothing visible except: the player's weapon glow (small point light), the King's staff (blue-white
  glow, flickers before an attack), his eyes and crown glint, and dust motes in the staff light. Footstep audio from the
  King is 3D-panned so you can hear where he is. Ambient: almost silence + low drone; king fight music (M6).

---------------------------------------------------------------------------------------------------------------------

## 8. After the King (cycle 0): the unravelling

### 8.1 The seal breaks
First King win: +100,000, King's Staff, then on return to the lobby: the sky darkens a shade, Bram is gone from the porch
(only his chair rocking), a low tone, and a black-violet portal stands behind the Lobby House at (0,0,-12). Objective 15.
Fydor/Myles lines change ("Don't go behind the house.").

### 8.2 The foggy desert (~1 minute)
Through the portal: a bright, bleached, foggy desert (fog 40-90 m), dunes, tall saguaro-style cacti, dry wind, sand
hiss. No music, only wind and footsteps in sand. EVENTS counts seconds of player MOVEMENT (not idle time). At 60 s of
walking, a portal (same black-violet look) fades in ~70 m ahead of the player's facing direction (on the ground, with a
low hum audible from 120 m). The return portal stays behind the arrival point.

### 8.3 The forest (~2 minutes)
A dense, dim, realistic conifer forest, a single path. For ~60 s: silence (only wind in trees, a woodpecker, a far crow).
Then the creepy music starts (M8b: detuned music box + sub drone + slow heartbeat). ~60 s later (at 120 s in the forest,
whatever the player is doing): a slow fade to black (2 s) and the player wakes INSIDE the forest house (no transition
explanation - "then a minute later, you are in a house"). Interior: dusty cabin, a candle, a rocking chair, rain on the
roof. Objective: Go outside.

### 8.4 Outside into the dark -> jumpscare
The door opens to the clearing, now NIGHT (pitch dark, moonless, fog, the candle's light from the doorway). 6 m out from
the door (or 8 s outside), the black creature (the Hollow, first form: a tall, thin, inky silhouette with too-long
arms and a shallow white face-mask shape, eyes like pinholes) is suddenly right in front of the camera: JUMPSCARE
(sound: loud distorted shriek + bass hit; visual: face fills screen, 1-2 frame strobe and camera shake; Reduce flashing:
same sound, no strobe, quick soft push-in). Then it stands 12 m away and starts walking toward you. Objective: RUN.

### 8.5 The chase and the collapsing world
- Chase leg 1 (forest): run back east along the trail (~350 m compressed: EVENTS teleports the forest return portal
  to 120 m ahead on the trail so the chase is ~25 s). The Hollow follows at slightly below sprint speed; if it reaches
  you (2 m) you are caught -> respawn at the leg start (no death screen, 0.6 s black). Trees crash down across the trail
  as obstacles (jump/side-step).
- Chase leg 2 (desert): through the portal -> the desert at night, sandstorm; the desertBack portal is 100 m ahead,
  marked by a red waypoint; cacti fall.
- Through desertBack -> instead of the normal lobby you arrive in the `collapse` zone (the valley, falling apart):
  red-black sky, the ground breaking into floating chunks, the river draining into the void, the bridge snapping,
  village houses tilting and sliding, the castle at the far end. A ~2.5 minute parkour run to the castle:
  sections: (1) lobby plateau cracking - jump the widening cracks; (2) the bridge breaking plank by plank behind you;
  (3) floating rat-field chunks drifting up and down (timed jumps, 3-4 m gaps); (4) village rooftops sliding (run along
  roofs, jump between them); (5) the guard-post wall top balance beam while towers fall; (6) the castle road as
  stairs-in-the-sky rising chunks, last 6 m leap to the castle gate. The Hollow is a huge shadow following in the sky
  and occasionally swiping chunks away. 6 checkpoints (one per section). Falling = back to the section checkpoint.
  The run is generous: coyote time 0.12 s, jump buffer 0.12 s, jump distance ~5.5 m sprinting.
- Through the castle gate replica: you are pulled into the real throne room (`throne`) - "caught in the throne".

### 8.6 The throne boss: Hollow I ("the craziest boss fight")
Throne room torches turn blue, the throne cracks, the Hollow rises from the throne's shadow (6 m tall form).
rec = your level at fight start (so OUT = IN = 1 whatever you farmed; the player may arrive at only ~220k), HP 5,000
(~90 light / ~36 heavy staff hits, 4-6 min), 4 phases, music M10. Raw hits 20-35. Death -> respawn at the throne
door, boss resets to the start of its current phase (phase checkpoints). The throne room door is sealed during the fight.
- P1 (100-75%): long-arm swipes (25, left/right telegraphed), ink puddles that grab (root 1 s).
- P2 (75-50%): the room tilts (camera roll 10-15 deg), it clings to the ceiling and drops (red circle 35), spawns
  6 red-eyed shadow rats.
- P3 (50-25%): lights out except your weapon glow + its pinhole eyes; it fakes footsteps from the wrong direction;
  scream cone (pushback).
- P4 (25-0%): enraged, faster, throws pieces of the throne (dodge), the floor breaks into tiles that drop (stay on lit tiles).
- At 0 HP: it collapses, the boss bar empties, the music resolves into a major chord... the "victory" banner starts
  to type "VICTO-" and freezes. The Hollow's body twitches, then SCURRIES away on all fours across the ceiling and out
  through a crack. Subtitle, slow: "we will meet again." Screen fades to black, the title music plays reversed for 3 s,
  then the TITLE SCREEN appears again but red-tinted with red particles - "Totally a Normal RPG" - and after 4 s the
  game restarts automatically at the lobby, cycle 1 (secret `ngplus`). The player keeps nothing but name/secrets.

---------------------------------------------------------------------------------------------------------------------

## 9. Cycle 1: the girl, the Hollow, the sword, the endings

### 9.1 The way back
Play through again with the 4.7 modifiers. Beating the King (cycle 1) reopens the lobby-back portal. Desert and forest
are now short and quiet (no timers: the desert exit portal is already standing 150 m ahead of the arrival point, at
(0,0,-1850); the forest path ends at the forest house, whose front door (outside, east wall, point
`forestHouseDoorFront` (-2153,0,0)) is the interactable). The house's door (outside, E: "Open the door") opens onto bright daylight sand: "you see a desert again".
-> `hollowDesert`.

### 9.2 The little girl
- Ahead, on a dune at (0,0,-4080), a little girl (about 7, white dress, a red ribbon, her face hidden in her knees) is
  crying softly and singing. AUDIO plays song `girl`: a thin, slightly off-key synthesized child-like voice (formant
  synthesis, vowels "ah/oo/ee") singing the "This Old Man" melody for one line with subtitles
  `i love you, you love me...` then the voice breaks into a hum for the rest of the melody, looping with sobs between.
  The song is 3D-positioned at the girl and gets clearer as you approach. Never any other lyrics, never any character name.
- At 3 m: prompt `Say hi`. On E: she stops singing (silence 1.5 s), turns her head too far - JUMPSCARE (her face becomes
  the Hollow's mask; Reduce flashing rules apply), then she fades into sand that blows away. Her ribbon stays on the sand
  (pickup `girls_ribbon`, secret `girlRibbon`).
- Then: wind stops. Far away at (0,0,-4320) the Hollow stands - bigger, armoured with fused pieces of the King's armour,
  Fydor's halberd and Myles's shield (it is PREPARED this time). It walks toward you; a ring of dark glass rises around
  the arena (r=60).

### 9.3 Hollow II (the prepared monster)
rec = your level x 1.25 at fight start (OUT 0.87, IN 1.14 - harder than Hollow I but never a wall), HP 7,000
(~5-7 min with the Bent Twig Staff), raw hits 25-40, music M12, 4 phases: halberd slam ring (jumpable) + fissure line
(Fydor's), shield wall and counter (Myles's: hitting the raised shield is parried), staff bolt barrages and clones
(the King's), sand-wave and pull. Death -> respawn at the arena edge, boss resets to its current phase start (phase
checkpoints, so it is beatable).
On defeat: it sinks to its knees and MELTS - its body turns to black liquid (shader: glossy, rippling) that pools,
then rises and pulls itself into the shape of a sword standing point-down in the sand, then turns solid (glossy black
blade with a faint red edge). The `homePortal` to the lobby opens behind you. The sword pulses slowly. No objective
text, one toast: "What now?" Phase `choice` begins (EVENTS starts the idle watcher, STORY arms the four endings).

### 9.4 The four choices (all open simultaneously during phase `choice`)
1. TAKE the sword (E at the sword: `Take the sword`, confirm "Are you sure?") -> MONSTER ENDING.
   Sequence: your hand closes on it, ink runs up your arm, the camera pulls out: you ARE the Hollow (avatar swapped to the
   monster form), you walk; around you the valley's colours drain, houses dissolve to ash-particles, the castle falls
   silent, the screen eats itself into black. Ending card.
2. Go back through `homePortal` to the lobby and leap into the void at the broken fence (E at the edge: `Step into the
   void`; confirm dialog: "Stay?" with buttons `Stay` / `Let go`). -> WORLD ENDING. Sequence: the camera holds on the
   horizon as the player steps forward; immediate soft fade to white (no fall shown, no sound of impact); the world
   behind dissolves into white particles drifting up, the sword in the far desert shown crumbling to dust. Gentle piano
   sting. Text: "You made sure nobody would ever hold it." Non-graphic.
3. BURY everyone's items at the graveyard on the lobby plateau: pick up the shovel (E) then E at each of the 6 graves to
   bury the item for that fallen (the item is removed from your inventory - `combat.remove(id)`; if it was equipped you
   fall back to the next best owned item or fists): Rat King <- Cheese Sword (or Moldy Cheese Sword), the Villagers <- Wooden Sword (or
   Termite Plank), Fydor & Myles <- Iron Sword (or Rust Stick), the Royal Guards <- Gold Sword (or Fool's Gold), the King <-
   King's Staff (or Bent Twig Staff), Elsie <- the ribbon. Each grave shows its name and the needed item; if you don't own
   it the prompt says which (and where it drops). All 6 buried -> WARRIOR ENDING. Sequence: you kneel, the wind picks up,
   flowers grow over the graves in a time-lapse, sunrise, the black sword in the far desert rusts and is buried by sand.
4. WAIT 10 minutes doing nothing (no movement/attack/interact/look input at all; anywhere, phase `choice`): the screen
   slowly greys out over the last 30 s, then you are TELEPORTED to `finalArena` -> FINAL BOSS (9.5).
   Any input resets the 10-minute idle counter (shown nowhere; a faint clock tick audio fades in over the last minute).

### 9.5 Final boss: Hollow III, the end of the world
- The Hollow at full size: 60 m tall (it is way bigger than you), standing in the white void beyond the floating disc;
  its arms reach onto the disc. Music M13 (the craziest track). Boss bar `the hollow` with 12 segments (each 500 HP,
  6,000 total). rec = your level x 2 at fight start (OUT 0.66, IN 1.52: hard, "losing is easy"). ONLY the glowing cores
  take damage and cores take x3 (EVENTS applies the x3 in its hittable) -> ~55 light / ~22 heavy staff hits, 6-8 min.
  Raw hits 40-60 (player HP ~350 -> ~8-10 hits per life). Player has 3 LIVES (hearts shown); dying = lose a life, respawn on the disc
  edge after 2 s, boss keeps its HP.
- It does everything to stop you winning:
  stomps (shockwave rings, jump), hand sweeps across the disc (jump or roll), eye beam that tracks you (hide behind
  rock pillars), raining ink shards (red circles), spawns red-eyed rats/villagers/royal guard shadows, JUMPSCARES (face
  slam into camera with shriek, 1 s input disruption), FLASHBANGS (white screen 1.5 s + ringing tinnitus sine 4 kHz and
  muffled audio; Reduce flashing: a soft grey fade, same ringing quieter), controls invert for 4 s ("it reaches into your
  head", UI shows a cracked "WASD" icon), the camera rolls 180 deg for 3 s, a FAKE "YOU WIN" ending card that is then torn
  apart, a fake "connection lost" screen for 2 s, gravity flips briefly (you float up 3 m), the disc tilts, it covers the
  sun, the boss bar fakes "refilling".
- How to hurt it: after each stomp its hand/knee cores glow red for 4 s: hit them. Segments 9-12: climb onto its
  forearm (a long ramp when it slams its arm down) and strike its face core.
- LOSE (all 3 lives gone) -> IDIOT ENDING. WIN -> WINNERS ENDING.
- WINNERS ENDING screen has a big `Winner` button: clicking it fades back into the fight (fresh boss, ONE life only,
  i.e. you must not die). Win the rematch without dying -> SIGMA ENDING. Die in the rematch -> back to the Winners screen
  (with `Winner` again) - you do not get Idiot for losing a rematch.

### 9.6 Endings (cards: full-screen, title in thin serif, 2-3 lines of text, buttons)
| id | Title | Text (fits 390px) | Sting |
|---|---|---|---|
| `monster` | MONSTER ENDING | You took the sword. The sword took you. Something always has to be the monster. | E1 |
| `world` | WORLD ENDING | You stepped into the white so that no one would ever hold it. The world let go with you, gently. | E2 |
| `warrior` | WARRIOR ENDING | You buried their swords, their staff, her ribbon. Warriors don't keep trophies. The black sword rusts alone. | E3 |
| `idiot` | IDIOT ENDING | You waited ten minutes for the end of the world, and then you lost to it. Idiot. | E4 (a sad trombone-ish synth) |
| `winners` | WINNERS ENDING | You beat the end of the world. Probably. | E5 (triumphant) |
| `sigma` | SIGMA ENDING | Twice. Without dying. The Hollow will tell its children about you. | E6 (huge, then a bass drop) |
Buttons on every ending card: `Remember the choice` (reload the phase `choice` checkpoint at the black sword, so every
ending can be collected without replaying 2 hours), `Start over` (new game cycle 0, secrets kept), `Title`.
Winners additionally has `Winner` (primary). The Monster ending's "restart if you want" = `Start over`.
Every ending is a secret (6 of the 26) and is also counted in `profile.endings`.

---------------------------------------------------------------------------------------------------------------------

## 10. Secrets (25) - registry ids, how to get them
| # | id | Name | How |
|---|---|---|---|
| 1 | `catBoss` | The Cat Boss Is Real | Defeat Big Tom in the Old Barn (needs all 3 kittens found first; then his bell rings at the barn) |
| 2 | `rookieBoss` | Nobody's Heard Of Him | Defeat Rookie in his shack behind the waterfall |
| 3 | `kittens` | Three Little Kittens | Pet all 3 kittens (E) |
| 4 | `underBridge` | Troll-Free Bridge | Stand in the nook under the bridge |
| 5 | `waterfall` | Behind The Water | Enter the cave behind the waterfall |
| 6 | `goldenRat` | Golden Rat | Kill a Golden Rat |
| 7 | `basement` | Totally Normal Basement | Find the trapdoor under the lobby rug and go down (an empty room with a chalk drawing of the Hollow) |
| 8 | `normalSign` | Please | Read the sign 5 times |
| 9 | `allNpcs` | Chatterbox | Talk to all 8 talkable NPCs (bram, nessa, tobin, ilsa, pell, odo, wren, fydor) |
| 10 | `fydorLocket` | Fydor's Locket | Pull up the well bucket in the village |
| 11 | `mylesLetter` | Myles's Letter | Read the letter at the top of the watchtower |
| 12 | `portrait` | The Old Portrait | Find the portrait room in the castle |
| 13 | `throneSeat` | Sit Down | Sit on the throne (cycle 0, before the chase) |
| 14 | `kingFlawless` | Untouchable | Beat the King without taking damage |
| 15 | `crown` | Heavy Is The Head | Get the King's Crown (1,000,000 levels) |
| 16 | `cactusFlower` | Desert Bloom | Find the one blooming cactus in the foggy desert |
| 17 | `totem` | It Whispers | Stand at the forest totem for 5 s |
| 18 | `voidWhisper` | Don't Look Down | Stand at the void edge fence gap for 30 s (any time; you hear a faint hum of "This Old Man") |
| 19 | `ngplus` | We Will Meet Again | Reach the corrupted run |
| 20 | `girlRibbon` | Her Ribbon | Pick up the ribbon |
| 21-26 | `end_monster`, `end_world`, `end_warrior`, `end_idiot`, `end_winners`, `end_sigma` | the six endings | see 9.6 |
That is 26 ids; the counter shows `secrets found / 26`. (Target was ~25.)
Finding a secret: soft chime (S-secret), a toast "SECRET FOUND: Golden Rat (7/26)", saved, leaderboard submit.

---------------------------------------------------------------------------------------------------------------------

## 11. Music (all WebAudio-synthesized, original; AUDIO module)
Common tools: sampled-free synthesis - kick (sine sweep 120->40 Hz + click), piano (additive partials with inharmonic
stretch, hammer noise, decay, soft pedal reverb via a generated convolution impulse), strings/pads (detuned saws through
lowpass), choir (formant filters on saw), music box (sine + metallic partials), drones (FM), noise layers (wind, rain).
All tracks loop seamlessly, crossfade 2 s by default, and are scheduled with a lookahead scheduler (no setInterval jitter).
| id | Name | Character |
|---|---|---|
| `title` | M1 Title | D minor, 54 BPM. Bass drum "heartbeat": bar A = two slow thumps (beats 1 and 3: "thump ... thump ..."), bar B = the same thumps TWICE AS FAST (four on the beats, "thump thump thump thump"), repeat A B A B (slow / twice fast / slow / twice fast). Low piano: sparse single low notes and minor seconds in D1-D3 (D, F, A, Bb, C#, a dissonant Eb), long reverb tails, every 4 bars a very soft high tone. Sub-bass drone, distant wind. Realistic, creepy, minimal. |
| `area1` | M2 Meadow | G major pastoral, 84 BPM, plucked lute/guitar arpeggios, flute-like sine melody, light hand drum; cosy. |
| `area2` | M3 Village | D major, 96 BPM, folk dance-ish fiddle-like saw lead, accordion pad, foot-stomp kick. |
| `area3` | M4 Castle | Bb major/G minor, 72 BPM, brass pads, timpani, noble melody. |
| `boss` | M5 Boss (rats/villagers/guards/royal/cat/rookie) | E minor, 140 BPM driving toms + low strings ostinato; a lighter comic variant `bossRookie` (kazoo-ish lead). |
| `king` | M6 The King in the Dark | C minor, 60 BPM, organ drone + choir "ah", heartbeat kick, staff-chime motifs. |
| `desert` | M7 Desert | (no melody) wind layers + a single distant low bell every 20 s. |
| `forestQuiet` / `forestCreep` | M8a/M8b Forest | 8a: silence/ambience only; 8b: detuned music box playing a fragment of the title's piano motif, sub drone, slow heartbeat, occasional reversed piano. |
| `house` | M9a Forest house | rain + creaks, no music. |
| `chase` | M9 Chase / Collapse | 160 BPM, distorted kick + stabbing low strings, rising shepard tone, alarms of choir; intensifies per collapse section (layers). |
| `throne` | M10 Throne Hollow I | 7/8 time, 132 BPM, brutal: kick-snare breakbeat, detuned organ, screaming high strings, the title heartbeat motif in the low end. Fake victory resolve at the end. |
| `*_ng` | NG+ variants | `title_ng`, `area1_ng`, `area2_ng`, `area3_ng`, `boss_ng`, `king_ng`: same tracks transposed down a minor 2nd, slowed 8%, with a detuned layer and reversed reverb swells; melodies sometimes skip a note. |
| `girl` | M11 the girl's song | "This Old Man" melody (public domain), child-like formant voice, one line of words "i love you, you love me..." (sung on the first phrase), then humming the remaining phrases; soft sobs between loops; slightly flat and slowing each loop. Emits lyric cues for subtitles. |
| `hollow2` | M12 Hollow II | the throne track rebuilt with the King's organ, the Guards' war drums and the girl's melody inverted. |
| `final` | M13 Final: the end of the world | the craziest: 174 BPM, everything from the game at once - title heartbeat doubled, broken choir, sirens of strings, glitches (buffer stutter), tempo-drops to half-time during jumpscares, total silence 1 s before flashbangs. |
| stings | E1-E6 + `secret`, `levelUp`, `itemGet`, `unlock`, `bossWin`, `death`, `ngReveal` | short one-shots (1-6 s), duck the music 60%. E1 monster: bass + reversed scream; E2 world: gentle piano + air; E3 warrior: horn + strings major; E4 idiot: sad descending synth "wah wah"; E5 winners: fanfare; E6 sigma: fanfare -> bass drop. |
Zone -> music map: lobby/path/bridge/ratField/waterfall/graves = area1; ratKing arena fight = boss; village/barn/guardPost
= area2; castle/throne(peaceful) = area3; kingDark = king; desert = desert; forest = forestQuiet->forestCreep (event);
forestHouse = house; chase/collapse = chase; title screen = title. Cycle 1 uses `_ng` variants. Bosses push `boss`.

## 12. Sound effects (synthesized; 3D-positioned where marked *)
Player: footsteps per surface (grass, dirt, wood, stone, sand, forest-floor, puddle), jump, land (soft/hard), punch
whoosh, punch hit (meaty), sword swing (by weight), sword hit flesh / metal / wood / shield-block, heavy charge hum,
heavy release, dodge roll cloth, hurt grunt (male/neutral synth "uh"), death, level-up chime (pitch rises with size),
item get, equip clink, armor rustle.
World*: wind (varies by zone), birds, river, waterfall roar, crickets (evening), fire crackle, chimney, chickens, dog
bark, door open/close, creak, gate open (big wood), portal hum + enter whoosh, bell (Tom's), well bucket chain, shovel dig,
rain, thunder-less distant rumble, sand hiss, tree creak/fall, ground crack, rock tumble, building collapse.
Enemies*: rat squeak / bite / death, Rat King roar / squeak shockwave / cheese roll, villager shout / grunt, guard grunts,
halberd whoosh, shield block / bash, royal guard armor clank, King laugh / whisper / staff charge / bolt / teleport, cat
hiss / meow / purr (kittens), Rookie "oof" (comic), Hollow breathing / shriek / footsteps (heavy, wet), liquid melt,
sword solidify ring.
UI: hover tick, click, toast, secret chime, typing, dialogue blip (per speaker pitch), menu open/close, error buzz,
jumpscare hit (loud: capped at a safe master level, never clipping), flashbang tinnitus, heartbeat (low HP < 25%).

## 13. Secrets leaderboard GUI (corner)
- Top-right corner panel (on phones: a collapsible pill `Secrets 7/26` that expands to the list), semi-transparent dark
  glass, thin border, max-width 220 px (phones: 180 px collapsed). Title `MOST SECRETS`. Top 5 rows: rank, name
  (ellipsized), count; "you" row highlighted (and appended as row 6 when not in the top 5). Under it: your own
  `7 / 26 secrets`.
- Data: `platyfy-online.js` (relative import `../../../platyfy-online.js` from src/ui): `getTop("tnrpg-secrets", 5)`,
  refresh on open, every 60 s while visible, and after a submit; `submitScore("tnrpg-secrets", count, { name: onlineName,
  min: 0, max: 26 })` whenever the count increases. Offline: shows cached rows (stale) or `offline` - never blocks play.
- Hidden during dialogue/cinematics/boss intros and on ending cards (except the Title).

## 14. HUD and screens (UI)
HUD: top-left name + level (big number, comma-formatted, abbreviated >= 10M as `12.4M`) + MULT `x96`; HP bar under it;
top-centre objective + waypoint marker; top-right secrets corner; bottom-centre interact prompt (`[E] Talk to Nessa`);
boss bar (top-centre below the objective, with name + phase pips); toasts stack bottom-left (phones: above the
joystick); damage numbers (enemy hits white, crits yellow, player hurt red vignette pulse). Inventory: grid of owned
items with icons (procedural canvas icons), equip buttons, stats (MULT, DR, HP, damage). Shop: list of claims with
requirement, status (Claimed / Claim / Need 1,000). Dialogue box: bottom, speaker name, typewriter text (tap to skip),
choices as buttons. Settings: Reduce flashing (OFF default), volumes (master/music/sfx), mouse sensitivity, invert Y,
pointer lock, quality (Auto/Low/Medium/High), show FPS, show hints. Death screen. Ending cards. Every text block fits a
390 px wide viewport (font sizes clamp, wrapping, no fixed widths > 360 px).

## 15. Accessibility and safety
- Reduce flashing (default OFF): flashbangs -> soft 1.2 s fade to light grey and back; jumpscares keep sound and the
  face but no strobe frames and no rapid colour changes; title "Normal" flicker -> slow dip; no full-screen luminance
  change faster than 3 Hz anywhere. Even when OFF, flashes never exceed 3 flashes per second.
- Jumpscare loudness capped (limiter on the master bus).
- The void leap requires two deliberate actions and is only available in the final choice state; text is gentle; no
  depiction of harm.
