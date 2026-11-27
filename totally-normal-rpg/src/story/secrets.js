// secrets.js - the secrets registry (CONTRACT 9.4, DESIGN 10). Pure data + helpers.
// Hints are shown in the secrets list for found secrets and, vaguely, for unfound ones (UI decides).

export const SECRETS = Object.freeze([
  { id: "catBoss",      name: "The Cat Boss Is Real",     hint: "Some say there's a cat as big as a cart. Find his kittens first." },
  { id: "rookieBoss",   name: "Nobody's Heard Of Him",    hint: "A very nervous boss practises where the water is loudest." },
  { id: "kittens",      name: "Three Little Kittens",     hint: "Three kittens hide in high places. Pet them all." },
  { id: "underBridge",  name: "Troll-Free Bridge",        hint: "Every bridge has an underneath." },
  { id: "waterfall",    name: "Behind The Water",         hint: "Waterfalls are curtains." },
  { id: "goldenRat",    name: "Golden Rat",               hint: "Once in a while, a rat comes back shiny." },
  { id: "basement",     name: "Totally Normal Basement",  hint: "Look under the rug." },
  { id: "normalSign",   name: "Please",                   hint: "Read the sign. Then read it again. And again." },
  { id: "allNpcs",      name: "Chatterbox",               hint: "Talk to everyone who will talk back." },
  { id: "fydorLocket",  name: "Fydor's Locket",           hint: "Something glints at the bottom of the village well." },
  { id: "mylesLetter",  name: "Myles's Letter",           hint: "Climb the watchtower at the guard post." },
  { id: "portrait",     name: "The Old Portrait",         hint: "The castle has a room full of old faces." },
  { id: "throneSeat",   name: "Sit Down",                 hint: "The throne looks comfortable. Before things get busy." },
  { id: "kingFlawless", name: "Untouchable",              hint: "Beat the King without being touched." },
  { id: "crown",        name: "Heavy Is The Head",        hint: "Reach 1,000,000 levels." },
  { id: "cactusFlower", name: "Desert Bloom",             hint: "One cactus in the fog is blooming." },
  { id: "totem",        name: "It Whispers",              hint: "Stand still by the forest totem and listen." },
  { id: "voidWhisper",  name: "Don't Look Down",          hint: "Stand at the broken fence by the void for a while." },
  { id: "ngplus",       name: "We Will Meet Again",       hint: "Keep playing after the end." },
  { id: "girlRibbon",   name: "Her Ribbon",               hint: "Someone left a ribbon in the sand." },
  { id: "end_monster",  name: "Monster Ending",           hint: "Take what it offers." },
  { id: "end_world",    name: "World Ending",             hint: "Make sure nobody ever holds it." },
  { id: "end_warrior",  name: "Warrior Ending",           hint: "Warriors don't keep trophies." },
  { id: "end_idiot",    name: "Idiot Ending",             hint: "Wait for the end of the world, then lose to it." },
  { id: "end_winners",  name: "Winners Ending",           hint: "Beat the end of the world." },
  { id: "end_sigma",    name: "Sigma Ending",             hint: "Beat it twice. Without dying." }
]);

export const SECRET_IDS = Object.freeze(SECRETS.map((s) => s.id));
export const SECRET_TOTAL = SECRETS.length;   // 26

const BY_ID = Object.create(null);
for (const s of SECRETS) BY_ID[s.id] = s;

export function secretDef(id) { return BY_ID[id] || null; }

/** count of known secret ids present in a profile.secrets map */
export function countFound(secretsMap) {
  let n = 0;
  if (!secretsMap) return 0;
  for (let i = 0; i < SECRET_IDS.length; i++) if (secretsMap[SECRET_IDS[i]]) n++;
  return n;
}

/** [{ id, name, hint, found }] in registry order */
export function listSecrets(secretsMap) {
  return SECRETS.map((s) => ({ id: s.id, name: s.name, hint: s.hint, found: !!(secretsMap && secretsMap[s.id]) }));
}
