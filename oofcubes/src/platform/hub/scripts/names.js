// src/platform/hub/scripts/names.js — the ghost wanderers' usernames. Spec 06 §5.4.1
// owns this file: the two word lists are exact and the assembly rule below is the one
// the spec spells out, so the Hub's crowd reads like a lobby full of strangers.
//
// ARCHITECTURE §9 (honesty clause): these names belong to nobody. They are generated
// locally from these two lists, never fetched, and the ghosts wearing them are never
// presented as real players.

export const PREFIXES = ["Xx", "Epic", "Cool", "Pro", "Noob", "Sir", "Turbo", "Mega", "Lil",
  "Big", "Sneaky", "Happy", "Dark", "Neon", "Super", "Ultra", "Mini", "Captain", "Lazy", "Spicy",
  "Frosty", "Golden", "Shadow", "Bacon"];

export const SUFFIXES = ["Gamer", "Builder", "Oofer", "Dude", "Ninja", "Master", "Blox",
  "Jumper", "Slayer", "King", "Queen", "Pants", "Hair", "Legend", "Boi", "Wizard", "Knight",
  "Runner", "Champ", "Lord", "Pickle", "Potato", "Cat", "Bee"];

// Tuning constants — spec 06 §6 pins GHOST_DIGIT_CHANCE to this module.
const GHOST_DIGIT_CHANCE = 0.6; // probability a name carries a numeric suffix
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
  if (Math.random() < GHOST_DIGIT_CHANCE) name += String(randInt(DIGIT_MIN, DIGIT_MAX));
  if (name.startsWith(XX_OPEN)) name += XX_CLOSE;
  return name;
}

// `taken` is the caller's live Set of names already handed out; this adds to it, so a
// caller keeps one Set for the whole crowd (spec 06 §5.4.1).
//
// §5.4.1 caps the retry loop at 20 and does NOT define what happens if all 20 collide,
// so this returns the 20th name — a duplicate — rather than looping forever or
// inventing an out-of-spec disambiguator. 24x24 stems x ~600 digit variants against
// the 8 names of §6 makes that outcome vanishingly unlikely; criterion 11's "unique
// username" per ghost holds in practice. Reported as a gap.
export function randomUsername(taken) {
  const seen = taken instanceof Set ? taken : new Set();
  let name = assemble();
  for (let tries = 1; tries < MAX_TRIES && seen.has(name); tries++) name = assemble();
  seen.add(name);
  return name;
}
