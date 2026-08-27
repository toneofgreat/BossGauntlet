// src/platform/services/names.js — default display names. Spec 06 §5.4.1 wrote these
// two word lists for the ghost wanderers; the ghosts are retired (spec 06 §5.4, amended
// 2026-08-27) and the lists moved here with the file, because the job survived the
// ghosts: a real player who has never set a name still needs one to appear under.
//
// Generated locally, never fetched. A name from here is a placeholder the player owns
// and can change, not a claim about who anyone is.

export const PREFIXES = ["Xx", "Epic", "Cool", "Pro", "Noob", "Sir", "Turbo", "Mega", "Lil",
  "Big", "Sneaky", "Happy", "Dark", "Neon", "Super", "Ultra", "Mini", "Captain", "Lazy", "Spicy",
  "Frosty", "Golden", "Shadow", "Bacon"];

export const SUFFIXES = ["Gamer", "Builder", "Oofer", "Dude", "Ninja", "Master", "Blox",
  "Jumper", "Slayer", "King", "Queen", "Pants", "Hair", "Legend", "Boi", "Wizard", "Knight",
  "Runner", "Champ", "Lord", "Pickle", "Potato", "Cat", "Bee"];

// Tuning constants — spec 06 §6 pins NAME_DIGIT_CHANCE to this module.
const NAME_DIGIT_CHANCE = 0.6; // probability a name carries a numeric suffix
const DIGIT_MIN = 1;
const DIGIT_MAX = 999;
const MAX_TRIES = 20; // §5.4.1 "regenerate (max 20 tries)"

// The 2007-era tag: a name that opens "Xx" closes "xX". §5.4.1 applies this AFTER the
// digits, so XxProNoob becomes XxProNoob42xX, not XxProNoobxX42.
const XX_OPEN = "Xx";
const XX_CLOSE = "xX";

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function assemble() {
  let name = pick(PREFIXES) + pick(SUFFIXES);
  if (Math.random() < NAME_DIGIT_CHANCE) name += String(randInt(DIGIT_MIN, DIGIT_MAX));
  if (name.startsWith(XX_OPEN)) name += XX_CLOSE;
  return name;
}

// `taken` is the caller's live Set of names already handed out; this adds to it, so a
// caller keeps one Set for the whole crowd (spec 06 §5.4.1).
//
// §5.4.1 caps the retry loop at 20 and does NOT define what happens if all 20 collide,
// so this returns the 20th name — a duplicate — rather than looping forever or
// inventing an out-of-spec disambiguator. 24x24 stems x ~600 digit variants against a
// room of at most 20 (spec 13 §6 ROOM_MAX) makes that outcome vanishingly unlikely.
//
// It is not impossible, though, and it matters more than it did: two ghosts sharing a
// name was cosmetic, two PLAYERS sharing one is confusing. The relay does not dedupe
// either — names are display text, and spec 13 §5 keys every remote player on the
// connection id, never on the name. Reported as a gap.
export function randomUsername(taken) {
  const seen = taken instanceof Set ? taken : new Set();
  let name = assemble();
  for (let tries = 1; tries < MAX_TRIES && seen.has(name); tries++) name = assemble();
  seen.add(name);
  return name;
}
