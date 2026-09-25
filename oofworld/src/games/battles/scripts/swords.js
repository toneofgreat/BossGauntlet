// src/games/battles/scripts/swords.js — Battles. Spec 26. Pure data.
//
// Ten swords, unlocked by a KILL THRESHOLD (not spent — reach the count and it is yours,
// for free, forever). The costs climb into the thousands on purpose: clearing the whole
// rack is a ~7-hour grind (§9). Each row carries its stats, an optional active ability or
// passive buff, an `ornament` that makes its (over-detailed, slowly-turning) model look
// better than the last, and a multi-page "past" you can only read once you own it.

export const HP_MAX = 100;
export const ABILITY_CD_S = 30;
export const CHEESE_CD_S = 50;    // §10: the Cheese Blade's ⚡ recharges slower than the rest
export const CHEESE_SLOW_S = 10;  // §10: splatted fighters are slow (and yellow) this long
export const BASE_WALK = 16;
export const BASE_JUMP = 50;
// §13: the Time Warp — won by finding all ten lettuces beyond the clock tower.
export const TW_STOP_CD_S = 150;  // its ⚡ TIME STOP recharges slower than anything else
export const TW_STOP_R = 100;     // freeze radius in studs — most of the arena
export const TW_STOP_S = 3;       // frozen fighters stand still this long; the caster keeps moving
export const TW_FLING = 50;       // every Time Warp hit also throws the victim this many studs
export const TW_PORTAL_LIFE_S = 30; // a cut portal pair holds this long
export const TW_PORTAL_CD_S = 45;   // and the gun needs this long before it can cut a new pair

// ability: "spikes" | "meteor" | "dummies" | "bush" | "cheese" | "streak" | null
//   ("cheese" = tap-a-target splat; "streak" = the Killstreak's growing button row)
// passive: { speed?:mult, jump?:+power, poison?:true } | null
// cost: a KILL threshold, or null for the secret blades (unlock: "obby" | "quest" |
//   "lettuce", answered by save flags — see isOwned).
// ornament: a keyword layout.js reads to bolt extra flourishes onto the pedestal model.
// The two secret blades come FIRST so the rack parks them on the LEFT of the ten. The
// Time Warp comes LAST and carries offRack: true — the rack skips it (so the classic
// twelve keep their pads and indexes) and layout.js raises it a bespoke pedestal by the
// clock arch instead.
export const SWORDS = Object.freeze([
  Object.freeze({
    id: "cheese", name: "Cheese Blade", emoji: "🧀", cost: null, unlock: "obby", damage: 3,
    ability: "cheese", passive: null, ornament: "cheese",
    blurb: "3 damage. ⚡ CHEESE: tap a fighter — splat! They run slow and glow yellow for 10s. "
      + "Won only by finishing the one-jump-wrong-and-you're-out Obby of Oof behind this pedestal.",
    colors: { blade: "#ffd23a", edge: "#fff3b0", hilt: "#b98a4e", guard: "#e8a33a", gem: "#fff59e" },
    lore: [
      "No forge made the Cheese Blade. It was left on the rack overnight, wrapped in wax "
      + "paper, with a note that said only: BEAT MY OBBY. Nobody has ever met the donor. "
      + "The obby is one stage long, and it is meaner than every tower ever built stacked "
      + "end to end.",
      "The blade itself is aged sharp — three damage a bite. Its real trick is the splat: "
      + "point it at a fighter and a wheel of molten cheddar takes them full in the face. "
      + "For ten long seconds they wade through fondue, yellow from head to boot, while "
      + "everyone else gets on with the fight.",
      "Fifty seconds between splats, because the donor's note had a second line: CHEESE IS "
      + "A RESPONSIBILITY.",
    ],
  }),
  Object.freeze({
    id: "killstreak", name: "Killstreak", emoji: "🩸", cost: null, unlock: "quest", damage: 1,
    ability: "streak", passive: null, ornament: "killstreak",
    blurb: "1 damage — plus 1 more for EVERY kill you take without dying. The streak wakes "
      + "powers no other blade has. Dug out of a place only one riddle in this arena points to.",
    colors: { blade: "#1a1220", edge: "#ff2a2a", hilt: "#0a0710", guard: "#4a0f14", gem: "#ff5a3a" },
    lore: [
      "The Killstreak is not on the rack because anyone put it there. The rack GREW a "
      + "pedestal for it, overnight, the way a scar grows skin. The plaque was already "
      + "scratched out when the quartermaster found it.",
      "It starts weaker than the Recruit's Blade — one damage, a joke. Then you take a "
      + "kill, and it remembers. And another, and it sharpens. Ten without dying and it "
      + "learns to step through space. Fifty and it hands you fire. A hundred and the "
      + "ground lets go of you. Die once, and it forgets everything — back to one.",
      "Where it came from, the Meteorbrand's last page whispers. That is the only map "
      + "there is.",
    ],
  }),
  Object.freeze({
    id: "basic", name: "Recruit's Blade", emoji: "🗡️", cost: 0, damage: 1,
    ability: null, passive: null, ornament: "plain",
    blurb: "1 damage. Humble — but it never leaves your side, and it's free.",
    colors: { blade: "#c9d2e4", edge: "#eef2fa", hilt: "#5a3a1a", guard: "#8a93a6", gem: "#7ec8ff" },
    lore: [
      "Every fighter starts here. The Recruit's Blade is stamped out by the thousand in the "
      + "under-forges of the lobby, from whatever scrap the last tournament left behind. It "
      + "is light, plain, and honest.",
      "They say a blade remembers its first swing. If that is true, the Recruit's Blade "
      + "remembers a hundred thousand of them — every nervous newcomer who ever stepped onto "
      + "the sand. One damage a hit. Enough, if your feet are quick and your heart is quicker.",
    ],
  }),
  Object.freeze({
    id: "golden", name: "Golden Saber", emoji: "⚜️", cost: 40, damage: 5,
    ability: null, passive: null, ornament: "jewelled",
    blurb: "5 damage. Forty kills and the vaults open it for you.",
    colors: { blade: "#ffd23a", edge: "#fff3b0", hilt: "#7a5310", guard: "#e0b23a", gem: "#fff59e" },
    lore: [
      "The Golden Saber is the first prize the arena ever gives back. Forty kills, and the "
      + "quartermaster nods you toward the gilded rack without a word about payment.",
      "It is heavier than it looks and worth less gold than it pretends — the shine is a "
      + "thin leaf over good steel. But five damage is five damage, and there is a reason "
      + "veterans smile when a rookie finally earns theirs.",
    ],
  }),
  Object.freeze({
    id: "spiked", name: "Spiked Maul", emoji: "🔨", cost: 200, damage: 5,
    ability: "spikes", passive: null, ornament: "spiked",
    blurb: "5 damage. ⚡ erupts a ring of iron spikes — 10 damage each. 30s cooldown.",
    colors: { blade: "#7d8694", edge: "#c7cdd9", hilt: "#2a2f3a", guard: "#565d70", gem: "#ff5a1f" },
    lore: [
      "Not really a sword at all — a maul studded with black iron thorns, torn from the "
      + "gate of a fortress that no longer exists. Two hundred kills buys the right to lift it.",
      "Slam it and the ground answers: a ring of spikes erupts outward, each one hungry for "
      + "ten points of anyone standing too close. Thirty seconds to reset. Time it for the "
      + "crowd, not the duel.",
    ],
  }),
  Object.freeze({
    id: "gravity", name: "Gravity Edge", emoji: "🌑", cost: 500, damage: 5,
    ability: null, passive: { jump: 25 }, ornament: "orbital",
    blurb: "5 damage, and +25 jump power — leap over the whole arena.",
    colors: { blade: "#2a1a4a", edge: "#a05cff", hilt: "#0a0616", guard: "#6b3fa0", gem: "#c9a0ff" },
    lore: [
      "The Gravity Edge was cut from a fallen star's core, and it never quite agreed to weigh "
      + "what it should. Hold it, and the ground loosens its grip on you.",
      "Five hundred kills. In return, you jump like the arena forgot to hold you down — over "
      + "walls, over heads, over the whole brawl. Some fighters never swing it once. They just "
      + "fly, and let everyone else tire themselves out below.",
    ],
  }),
  Object.freeze({
    id: "speedy", name: "Swiftsteel", emoji: "💨", cost: 1000, damage: 5,
    ability: null, passive: { speed: 1.5 }, ornament: "finned",
    blurb: "5 damage, and 1.5x move speed — be everywhere at once.",
    colors: { blade: "#35a3e0", edge: "#bff2fa", hilt: "#123a4a", guard: "#59d6e6", gem: "#eafcff" },
    lore: [
      "Swiftsteel is barely there — a sliver of blue-white metal so thin it hums when you "
      + "run. A thousand kills, and the smiths trust you not to slice your own hand off with it.",
      "It does not make you strong. It makes you FAST — half again as fast as anyone chasing "
      + "you, and half again as fast as anyone running away. The arena becomes small when you "
      + "carry Swiftsteel. That is the whole point.",
    ],
  }),
  Object.freeze({
    id: "fusion", name: "Fusion Blade", emoji: "⚡", cost: 1900, damage: 5,
    ability: null, passive: { speed: 1.5, jump: 25 }, ornament: "winged",
    blurb: "5 damage, 1.5x speed AND +25 jump. Gravity and Swift, forged into one.",
    colors: { blade: "#3ddc84", edge: "#eaffef", hilt: "#0f2a18", guard: "#a05cff", gem: "#7af0ff" },
    lore: [
      "When a fighter earns both the Gravity Edge and Swiftsteel, the forge offers a bargain "
      + "the old masters called foolish: melt them together. Most refuse. The bold don't.",
      "The Fusion Blade is that gamble made metal — the leap of the star-core and the speed of "
      + "the blue sliver, humming in one green edge. Nearly two thousand kills of proof. You "
      + "move like weather. You fall like a decision.",
    ],
  }),
  Object.freeze({
    id: "venom", name: "Venomfang", emoji: "🐍", cost: 3200, damage: 3,
    ability: null, passive: { poison: true }, ornament: "serpent",
    blurb: "3 damage — then poison bites for 3 more, three times, once a second.",
    colors: { blade: "#3a7d2c", edge: "#8be04a", hilt: "#1a0e0e", guard: "#2f8f4a", gem: "#c8ff6b" },
    lore: [
      "Venomfang draws less blood than any blade past the starter — three points, and a "
      + "sneer from anyone who counts only the first number. They stop sneering a second later.",
      "The cut is only the delivery. What it leaves behind — a green rot that gnaws three "
      + "more, and three more, and three more — is the actual weapon. Three thousand kills to "
      + "hold it, because you have to learn patience before the arena lets you be this cruel.",
    ],
  }),
  Object.freeze({
    id: "thorn", name: "Thornheart", emoji: "🌹", cost: 5000, damage: 5,
    ability: "bush", passive: null, ornament: "thorn",
    blurb: "5 damage. ⚡ grows a thorn bush (10 dmg to anyone near it). One every 30s; each wilts after 20s.",
    colors: { blade: "#2f8f4a", edge: "#8be04a", hilt: "#3a2414", guard: "#1f6b34", gem: "#e0245e" },
    lore: [
      "Thornheart is not forged — it is GROWN. The last druid of the arena planted a seed in "
      + "a dead champion's grip, and what came up was this: a living blade, green under the "
      + "steel, veined with sap that never dries. Five thousand kills wake it for a new hand.",
      "Its gift is the garden. Touch the ability and a thorn bush bursts from the sand where "
      + "you stand — a snarl of green and cruel red barbs that tears ten points from anyone "
      + "who wanders in. It wilts back to nothing after twenty seconds, and needs thirty to "
      + "seed again. Fight around your bushes, not away from them; make the whole arena hurt.",
    ],
  }),
  Object.freeze({
    id: "dummy", name: "Trainer's Cleaver", emoji: "🎯", cost: 8000, damage: 5,
    ability: "dummies", passive: null, ornament: "trainer",
    blurb: "5 damage. ⚡ conjures straw dummies to cut down — practice that pays.",
    colors: { blade: "#b98a4e", edge: "#e8d6b0", hilt: "#4a2f18", guard: "#8c6a3f", gem: "#ffd23a" },
    lore: [
      "The Trainer's Cleaver belonged to the arena's oldest instructor, who taught that a "
      + "kill is a kill whether it screams or spills straw. Eight thousand of them earn you "
      + "the right to think the same.",
      "Swing the ability and the sand sprouts training dummies — stitched, silent, and "
      + "waiting. Cut them down. They count. The masters grumble that it is not honourable. "
      + "The masters, notably, all trained on dummies first.",
    ],
  }),
  Object.freeze({
    id: "meteor", name: "Meteorbrand", emoji: "☄️", cost: 12500, damage: 5,
    ability: "meteor", passive: null, ornament: "meteor",
    blurb: "5 damage. ⚡ hurls a burning meteor — miss and it's nothing, HIT and it's a one-shot. 30s.",
    colors: { blade: "#ff5a1f", edge: "#ffd23a", hilt: "#2a0e04", guard: "#c0392b", gem: "#fff59e" },
    lore: [
      "Twelve thousand five hundred kills. Almost no one earns the Meteorbrand, and the ones "
      + "who do are never quite the same afterward — a person changes, grinding that long "
      + "toward a single blade.",
      "It calls down a meteor no bigger than a fist. Small, fast, and merciless: it does "
      + "nothing at all if you miss, and ends anyone it touches in a single strike. The arena "
      + "goes quiet when a Meteorbrand raises. Everyone knows what the next second might hold.",
      // §11: the questline's ONLY written map. Three true hints — the vines on the arena's
      // outer flank, the thing waiting behind them, and the ring the sky keeps.
      "One page more, in older ink. Three whispers follow every Meteorbrand: that the "
      + "arena's outer SIDE wears a green beard no gardener ever planted; that behind the "
      + "green, something with six faces sits and WAITS to be answered; and that the sky "
      + "over the sand keeps a RING no bird has ever flown through. The whisperers are "
      + "gone. The vines are not.",
    ],
  }),
  Object.freeze({
    id: "timewarp", name: "Time Warp", emoji: "⌛", cost: null, unlock: "lettuce", damage: 5,
    ability: "timestop", passive: null, ornament: "timewarp", offRack: true,
    blurb: "5 damage — and every hit FLINGS the victim fifty studs. ⚡ TIME STOP: freeze "
      + "everyone within a hundred studs for three seconds while you alone keep moving. "
      + "Comes with a portal gun. Won by climbing the clock tower and finding all TEN "
      + "lettuces in the realm beyond it.",
    colors: { blade: "#7ec8ff", edge: "#dff4ff", hilt: "#2a1a4a", guard: "#e0b23a", gem: "#a05cff" },
    lore: [
      "The Time Warp was not forged in a year. It was forged in the SAME year, over and "
      + "over, by a smith who kept winding his tower's great clock backwards each night to "
      + "hammer the blade again. The steel remembers every one of those years at once — "
      + "which is why touching it feels like standing in a doorway with all of history "
      + "leaning on the other side.",
      "Every strike unsticks its victim from the present: five points of hurt and then the "
      + "world THROWS them, fifty studs of it, because a body cannot stand in a second it "
      + "has been evicted from. Its deepest trick is crueller — turn the key and time simply "
      + "stops for everyone near you but YOU, three seconds of a world gone still while you "
      + "walk through it like its owner.",
      "The smith hid it past a tower of lava and clockwork, in a realm where he grew "
      + "lettuces — ten of them, his calendar, one for every year the year repeated. Happy "
      + "ones, sad ones, one gone wrong in the dark. Find all ten and the blade accepts "
      + "you, and hands you its little brother: a gun that cuts two holes in the air and "
      + "dares you to step through.",
    ],
  }),
]);

const BY_ID = new Map(SWORDS.map((s) => [s.id, s]));
export function swordById(id) { return BY_ID.get(id) || BY_ID.get("basic"); }
// Ownership answers from the whole SAVE now, not a bare kill count: the ten rack swords
// stay kill thresholds, the secret blades are save flags (`cheese`, `ks`, `tw`) their
// quests set. A rebirth resets `kills` — so the rack RELOCKS — but never the flags.
export function isOwned(id, save) {
  const s = BY_ID.get(id);
  if (!s) return false;
  if (s.cost === null) {
    if (s.unlock === "obby") return !!save.cheese;
    if (s.unlock === "lettuce") return !!save.tw;
    return !!save.ks;
  }
  return (save.kills || 0) >= s.cost;
}
export function ownedSwords(save) { return SWORDS.filter((s) => isOwned(s.id, save)); }

// The first-join tips — up to five pages, skippable, page arrows with a click.
export const INTRO_PAGES = Object.freeze([
  Object.freeze({
    title: "Welcome to Battles",
    body: "This is the lobby. Down the hall stands a rack of twelve swords — ten earned by "
      + "kills, and two on the far LEFT that kills can never buy. Walk into the free Recruit's "
      + "Blade to drop into the arena and start fighting. Every foe you defeat is a KILL — the "
      + "main currency here.",
  }),
  Object.freeze({
    title: "Kills unlock swords",
    body: "You never SPEND kills. Reach a sword's number and it unlocks for good, for free — "
      + "40 for the Golden Saber, 200 for the Spiked Maul, all the way to 12,500 for the "
      + "Meteorbrand. Clearing the whole rack is a long road — hours of it. Own a sword and "
      + "touch it to read its story and carry it in.",
  }),
  Object.freeze({
    title: "Fighting",
    body: "Your sword sits at the bottom of the screen — tap ⚔️ to swing at whoever is in front "
      + "of you. Everyone has 100 HP. Some swords add a ⚡ ability button: a ring of spikes, a "
      + "conjured meteor, a crowd of dummies, a thorn bush that bites. Tap it when it's ready.",
  }),
  Object.freeze({
    title: "Dummies & respawns",
    body: "The arena keeps a few straw training dummies standing at all times — cut one down "
      + "for a kill even when the arena is quiet. Real opponents are worth the same, and a good "
      + "deal more fun. Fall in battle (or into the void) and you're sent back to the lobby to "
      + "pick your next blade.",
  }),
  Object.freeze({
    title: "Read the blades",
    body: "Each sword on the rack shows what it costs and what it does, and turns slowly so you "
      + "can admire it. Own one, and touching it opens its past — the forges, the fools and the "
      + "fighters behind it. The Cheese Blade asks for an obby, not kills; the black pedestal "
      + "asks for something nobody writes down. Two leaderboards by the door keep the score, "
      + "and at the east end a CLOCK ARCH ticks over a pedestal that is here and not here. "
      + "Now go earn them all. Tap Skip any time. Good luck out there.",
  }),
]);
