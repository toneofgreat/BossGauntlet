// src/games/battles/scripts/swords.js — Battles. Spec 26. Pure data.
//
// Nine swords, unlocked by a KILL THRESHOLD (not spent — reach the count and it is yours,
// for free, forever). Each carries its stats, an optional active ability or passive buff,
// a lobby blurb, a colour scheme for its (deliberately over-detailed) model, and a
// multi-page "past" you can only read once you own it. Base HP is 100; the starter does 1.

export const HP_MAX = 100;
export const ABILITY_CD_S = 30;
export const BASE_WALK = 16;   // the platform default; passives scale from here
export const BASE_JUMP = 50;

// ability: "spikes" | "meteor" | "dummies" | null   (the mobile ⚡ button)
// passive: { speed?:mult, jump?:+power, poison?:true } | null
export const SWORDS = Object.freeze([
  Object.freeze({
    id: "basic", name: "Recruit's Blade", emoji: "🗡️", cost: 0, damage: 1,
    ability: null, passive: null,
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
    id: "golden", name: "Golden Saber", emoji: "⚜️", cost: 5, damage: 5,
    ability: null, passive: null,
    blurb: "5 damage. Five kills and the vaults open it for you.",
    colors: { blade: "#ffd23a", edge: "#fff3b0", hilt: "#7a5310", guard: "#e0b23a", gem: "#fff59e" },
    lore: [
      "The Golden Saber is the first prize the arena ever gives back. Five kills, and the "
      + "quartermaster nods you toward the gilded rack without a word about payment.",
      "It is heavier than it looks and worth less gold than it pretends — the shine is a "
      + "thin leaf over good steel. But five damage is five damage, and there is a reason "
      + "veterans smile when a rookie finally earns theirs.",
    ],
  }),
  Object.freeze({
    id: "spiked", name: "Spiked Maul", emoji: "🔨", cost: 25, damage: 5,
    ability: "spikes", passive: null,
    blurb: "5 damage. ⚡ launches a ring of spikes — 10 damage each. 30s cooldown.",
    colors: { blade: "#7d8694", edge: "#c7cdd9", hilt: "#2a2f3a", guard: "#565d70", gem: "#ff5a1f" },
    lore: [
      "Not really a sword at all — a maul studded with black iron thorns, torn from the "
      + "gate of a fortress that no longer exists. Twenty-five kills buys the right to lift it.",
      "Slam it and the ground answers: a ring of spikes erupts outward, each one hungry for "
      + "ten points of anyone standing too close. Thirty seconds to reset. Time it for the "
      + "crowd, not the duel.",
    ],
  }),
  Object.freeze({
    id: "gravity", name: "Gravity Edge", emoji: "🌑", cost: 75, damage: 5,
    ability: null, passive: { jump: 25 },
    blurb: "5 damage, and +25 jump power — leap over the whole arena.",
    colors: { blade: "#2a1a4a", edge: "#a05cff", hilt: "#0a0616", guard: "#6b3fa0", gem: "#c9a0ff" },
    lore: [
      "The Gravity Edge was cut from a fallen star's core, and it never quite agreed to weigh "
      + "what it should. Hold it, and the ground loosens its grip on you.",
      "Seventy-five kills. In return, you jump like the arena forgot to hold you down — over "
      + "walls, over heads, over the whole brawl. Some fighters never swing it once. They just "
      + "fly, and let everyone else tire themselves out below.",
    ],
  }),
  Object.freeze({
    id: "speedy", name: "Swiftsteel", emoji: "💨", cost: 100, damage: 5,
    ability: null, passive: { speed: 1.5 },
    blurb: "5 damage, and 1.5x move speed — be everywhere at once.",
    colors: { blade: "#35a3e0", edge: "#bff2fa", hilt: "#123a4a", guard: "#59d6e6", gem: "#eafcff" },
    lore: [
      "Swiftsteel is barely there — a sliver of blue-white metal so thin it hums when you "
      + "run. A hundred kills, and the smiths trust you not to slice your own hand off with it.",
      "It does not make you strong. It makes you FAST — half again as fast as anyone chasing "
      + "you, and half again as fast as anyone running away. The arena becomes small when you "
      + "carry Swiftsteel. That is the whole point.",
    ],
  }),
  Object.freeze({
    id: "fusion", name: "Fusion Blade", emoji: "⚡", cost: 175, damage: 5,
    ability: null, passive: { speed: 1.5, jump: 25 },
    blurb: "5 damage, 1.5x speed AND +25 jump. Gravity and Swift, forged into one.",
    colors: { blade: "#3ddc84", edge: "#eaffef", hilt: "#0f2a18", guard: "#a05cff", gem: "#7af0ff" },
    lore: [
      "When a fighter earns both the Gravity Edge and Swiftsteel, the forge offers a bargain "
      + "the old masters called foolish: melt them together. Most refuse. The bold don't.",
      "The Fusion Blade is that gamble made metal — the leap of the star-core and the speed of "
      + "the blue sliver, humming in one green edge. A hundred and seventy-five kills of proof. "
      + "You move like weather. You fall like a decision.",
    ],
  }),
  Object.freeze({
    id: "venom", name: "Venomfang", emoji: "🐍", cost: 300, damage: 3,
    ability: null, passive: { poison: true },
    blurb: "3 damage — then poison bites for 3 more, three times, once a second.",
    colors: { blade: "#3a7d2c", edge: "#8be04a", hilt: "#1a0e0e", guard: "#2f8f4a", gem: "#c8ff6b" },
    lore: [
      "Venomfang draws less blood than any blade past the starter — three points, and a "
      + "sneer from anyone who counts only the first number. They stop sneering a second later.",
      "The cut is only the delivery. What it leaves behind — a green rot that gnaws three "
      + "more, and three more, and three more — is the actual weapon. Three hundred kills to "
      + "hold it, because you have to learn patience before the arena lets you be this cruel.",
    ],
  }),
  Object.freeze({
    id: "dummy", name: "Trainer's Cleaver", emoji: "🎯", cost: 750, damage: 5,
    ability: "dummies", passive: null,
    blurb: "5 damage. ⚡ conjures straw dummies to cut down — practice that pays.",
    colors: { blade: "#b98a4e", edge: "#e8d6b0", hilt: "#4a2f18", guard: "#8c6a3f", gem: "#ffd23a" },
    lore: [
      "The Trainer's Cleaver belonged to the arena's oldest instructor, who taught that a "
      + "kill is a kill whether it screams or spills straw. Seven hundred and fifty of them "
      + "earn you the right to think the same.",
      "Swing the ability and the sand sprouts training dummies — stitched, silent, and "
      + "waiting. Cut them down. They count. The masters grumble that it is not honourable. "
      + "The masters, notably, all trained on dummies first.",
    ],
  }),
  Object.freeze({
    id: "meteor", name: "Meteorbrand", emoji: "☄️", cost: 1500, damage: 5,
    ability: "meteor", passive: null,
    blurb: "5 damage. ⚡ hurls a small meteor — miss and it's nothing, HIT and it's a one-shot. 30s.",
    colors: { blade: "#ff5a1f", edge: "#ffd23a", hilt: "#2a0e04", guard: "#c0392b", gem: "#fff59e" },
    lore: [
      "One thousand five hundred kills. Almost no one earns the Meteorbrand, and the ones who "
      + "do are never quite the same afterward — a person changes, grinding that long toward a "
      + "single blade.",
      "It calls down a meteor no bigger than a fist. Small, fast, and merciless: it does "
      + "nothing at all if you miss, and ends anyone it touches in a single strike. The arena "
      + "goes quiet when a Meteorbrand raises. Everyone knows what the next second might hold.",
    ],
  }),
]);

const BY_ID = new Map(SWORDS.map((s) => [s.id, s]));
export function swordById(id) { return BY_ID.get(id) || SWORDS[0]; }
export function ownedSwords(kills) { return SWORDS.filter((s) => kills >= s.cost); }
export function isOwned(id, kills) { const s = BY_ID.get(id); return !!s && kills >= s.cost; }

// The first-join tips — up to five pages, skippable, page arrows with a click.
export const INTRO_PAGES = Object.freeze([
  Object.freeze({
    title: "Welcome to Battles",
    body: "This is the lobby. Down the hall stands a rack of nine swords. Walk into the free "
      + "Recruit's Blade to drop into the arena and start fighting. Every foe you defeat is a "
      + "KILL — the only currency here.",
  }),
  Object.freeze({
    title: "Kills unlock swords",
    body: "You never SPEND kills. Reach a sword's number and it unlocks for good, for free — "
      + "5 for the Golden Saber, 25 for the Spiked Maul, all the way to 1,500 for the "
      + "Meteorbrand. Walk into a sword you've earned to read its story and carry it in.",
  }),
  Object.freeze({
    title: "Fighting",
    body: "Your sword sits at the bottom of the screen — tap ⚔️ to swing at whoever is in front "
      + "of you. Everyone has 100 HP. Some swords add a ⚡ ability button: a ring of spikes, a "
      + "conjured meteor, a crowd of dummies. Tap it when it's ready.",
  }),
  Object.freeze({
    title: "Dummies & practice",
    body: "The arena keeps a few straw training dummies standing at all times — cut one down "
      + "for a kill even when the arena is quiet. Real opponents are worth the same, and a good "
      + "deal more fun. Fall into the void and you respawn; no harm done.",
  }),
  Object.freeze({
    title: "Read the blades",
    body: "Each sword on the rack shows what it costs and what it does. Own one, and touching it "
      + "opens its past — the forges, the fools and the fighters behind it. Now go earn them. "
      + "Tap Skip any time. Good luck out there.",
  }),
]);
