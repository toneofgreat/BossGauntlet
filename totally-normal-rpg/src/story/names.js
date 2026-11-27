// names.js - player name filter (CONTRACT 9.3, DESIGN 1.1). Pure: no DOM, no network.
// Same behaviour as the UI's src/ui/names.js contract; UI may import this file directly.
//   validateName(raw) -> { ok:true, name, special } | { ok:false, reason, hint }
//   onlineNameFor(name) -> leaderboard display name (<= 16 chars, passes platypus checkName)
import { checkName, isRude, cleanName as baseClean, nameHint as baseHint } from "../../../platypus/src/names.js";

export const NAME_MIN = 3, NAME_MAX = 24, ONLINE_MAX = 16;
export const SPECIAL_NAME = "mygranniesamotherfucker";   // "the worst words you can use" - allowed exactly
export const MILD_NAME = "idiot";
export const SPECIAL_ONLINE = "MyGrannie";
export const RUDE_HINT = 'That word is too bad. The worst you can say is "idiot".';

export function cleanName(raw) { return baseClean(raw); }

export function nameHint(reason) {
  if (reason === "rude") return RUDE_HINT;
  if (reason === "short" || reason === "long") return "3 to 24 letters";
  return baseHint(reason) || "";
}

// insults at least as bad as "idiot" that the shared platypus list lets through. SUB: refused anywhere (also spaced
// out / leetspeak). TOK: refused as a whole word or camelCase part (so "Hello", "Shelly", "Closer" stay fine).
const LEET = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "9": "g" };
const SUB = ["moron", "stupid", "stoopid", "stupd", "retard", "bastard", "dumbass", "dumass", "imbecile", "dimwit", "nitwit", "halfwit"];
const TOK = ["hell", "damn", "dammit", "damnit", "dumb", "dummy", "loser", "losers", "crap", "crappy", "piss", "pissed",
  "jerk", "jerks", "fool", "fools", "noob", "idiots", "moronic", "stupidhead", "dork", "twit", "doofus"];
function leet(str) { let o = ""; for (const ch of str) o += LEET[ch] || ch; return o; }
export function isInsult(name) {
  const flat = leet(String(name).toLowerCase()).replace(/[^a-z]/g, "");
  for (const w of SUB) if (flat.includes(w)) return true;
  const parts = leet(String(name).replace(/([a-z])([A-Z])/g, "$1 $2")).toLowerCase().split(/[^a-z]+/);
  for (const p of parts) if (p && TOK.includes(p)) return true;
  // all-lowercase run-together names: "hellohell" style is fine, but "iamdumb" / "bigloser" end in a word
  for (const w of TOK) if (w.length >= 4 && flat.length > w.length && flat.endsWith(w) && !/(s|c|sh|o)hell$|closer$/.test(flat)) return true;
  return false;
}

function fail(reason) { return { ok: false, reason, hint: nameHint(reason) }; }

export function validateName(raw) {
  const name = cleanName(raw);
  const lower = name.toLowerCase();
  if (lower === MILD_NAME || lower === SPECIAL_NAME) return { ok: true, name, special: lower !== MILD_NAME };
  if (name.length < NAME_MIN) return fail("short");
  if (name.length > NAME_MAX) return fail("long");
  if (!/^[A-Za-z0-9 _-]+$/.test(name)) return fail("chars");
  if (name.replace(/[^A-Za-z]/g, "").length < 2) return fail("letters");
  if (isRude(name) || isInsult(name)) return fail("rude");
  // names of 3-16 chars must also pass the shared platypus rule set exactly
  if (name.length <= ONLINE_MAX) {
    const c = checkName(name);
    if (!c.ok) return fail(c.reason);
  }
  return { ok: true, name, special: false };
}

export function isSpecialName(name) { return cleanName(name).toLowerCase() === SPECIAL_NAME; }

export function onlineNameFor(name) {
  const n = cleanName(name);
  if (n.toLowerCase() === SPECIAL_NAME) return SPECIAL_ONLINE;
  if (checkName(n).ok) return n;
  const cut = n.slice(0, ONLINE_MAX).trim();
  if (checkName(cut).ok) return cut;
  return SPECIAL_ONLINE;
}

/** a retry candidate after a "taken" claim: name + 2 digits, kept <= 16 chars */
export function onlineRetryName(base, rnd) {
  rnd = rnd || Math.random;
  const digits = String(10 + ((rnd() * 90) | 0));
  const stem = cleanName(base).slice(0, ONLINE_MAX - 2).trim();
  const cand = stem + digits;
  return checkName(cand).ok ? cand : SPECIAL_ONLINE + digits;
}
