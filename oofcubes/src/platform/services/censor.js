// src/platform/services/censor.js — the word filter. Spec 17 owns this file.
//
// Used by the SERVER (tools/api.js for names, tools/relay.js for chat) because that is
// the only place it can be enforced — a filter that ran only in the browser would be
// bypassed by anyone who opened the console. The client imports it too, but only to say
// "pick another name" before making a request it knows will be refused.
//
// ---------------------------------------------------------------------------------
// The two failure modes, and which one this file prefers
// ---------------------------------------------------------------------------------
//
// A filter can fail by letting something through, or by censoring something innocent.
// The second is the one that makes a game feel broken and unfair, and it has a name: the
// Scunthorpe problem, after the English town whose name contains a slur and which naive
// filters have blocked for decades. "classic", "assassin", "grass", "bass", "Hancock"
// and "shiitake" all break the same way.
//
// So the rule here is: **match whole words, not substrings.** The text is split into
// words first and each word is normalised and compared as a unit. A bad word inside a
// longer innocent word is not a match, because it is not a word.
//
// Obfuscation is handled by NORMALISING rather than by loosening the match: leet digits
// become letters, runs of a repeated letter collapse, and separators inside a word are
// dropped. That catches `f*ck`, `sh1t`, `a$$`, `fuuuuck` and `f.u.c.k` while leaving
// "Scunthorpe" alone, because none of those normalise to an innocent word and Scunthorpe
// does not normalise to a bad one.
//
// This will not catch everything. Somebody determined will get something past it, and no
// word list is a substitute for being able to block or report a player — neither of which
// exists yet (spec 15 §9). It is a floor, not a solution, and it is worth being honest
// about that rather than implying the chat is safe.

// Common English profanity. Deliberately short: every entry is a word that is a problem
// on its own, in a game aimed at children. Slurs are covered by the same mechanism and
// are added here as they come up rather than shipped as a dictionary of abuse.
const WORDS = Object.freeze([
  "anal", "anus", "arse", "arsehole", "ass", "asshole", "bastard", "bitch", "bollocks",
  "boner", "bullshit", "clit", "cock", "coon", "crap", "cum", "cunt", "dick", "dickhead",
  "dildo", "dyke", "fag", "faggot", "fuck", "fucker", "fucking", "goddamn", "handjob",
  "jerkoff", "jizz", "kike", "nigga", "nigger", "penis", "piss", "prick", "pussy",
  "queer", "retard", "retarded", "rimjob", "shit", "shitty", "slut", "spastic", "spic",
  // Deliberate misspellings are words in their own right under a whole-word rule, so
  // they are listed rather than reached for with a looser match.
  "fuk", "fck", "phuck", "biatch", "azz", "arsehat", "shite", "wtf",
  "tits", "titties", "twat", "vagina", "wank", "wanker", "whore",
]);

const BAD = new Set(WORDS);

// Digits and symbols people substitute for letters. `1` is deliberately mapped to `i`
// rather than `l`: `sh1t` is far commoner than any word needing `l`.
const LEET = Object.freeze({
  "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "6": "g", "7": "t", "8": "b", "9": "g",
  "@": "a", "$": "s", "!": "i", "+": "t", "(": "c", "|": "i",
});

// One word, reduced to the letters it is pretending not to be.
export function normalizeWord(word) {
  let out = "";
  for (const ch of String(word).toLowerCase()) {
    const mapped = LEET[ch] !== undefined ? LEET[ch] : ch;
    // Strip accents so "fück" reduces like "fuck".
    const plain = mapped.normalize("NFD").replace(/[̀-ͯ]/g, "");
    if (/[a-z]/.test(plain)) out += plain;
  }
  // Collapse runs: "fuuuuck" -> "fuck". Two letters keep one, because English words with
  // real doubles ("pass", "bollocks") still normalise to themselves under this rule only
  // if the double is kept — so collapse 3+ rather than 2+.
  return out.replace(/([a-z])\1{2,}/g, "$1$1");
}

// Both spellings of a collapsed double, so "pass"/"pas" and "shit"/"shitt" both resolve.
function variants(word) {
  const v = new Set([word, word.replace(/([a-z])\1+/g, "$1")]);
  return [...v];
}

export function isBadWord(word) {
  const raw = String(word);
  // Leet symbols are word characters INSIDE a word (`a$$`) and punctuation at the
  // edges of one (`fuck!`). Trying both forms is simpler than deciding which a symbol
  // is from context, and it is what makes "what the fuck!" mask correctly — the first
  // version read that as one token, normalised the `!` to an `i`, and let it through.
  const forms = new Set([raw, raw.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "")]);
  for (const form of forms) {
    const n = normalizeWord(form);
    if (n && variants(n).some((v) => BAD.has(v))) return true;
  }
  return false;
}

// Split on anything that is not a letter, digit or leet symbol, so "f.u.c.k" and
// "f u c k" arrive here as the pieces they are — then also try the whole run joined,
// which is what catches them.
function words(text) {
  return String(text).split(/[^A-Za-z0-9@$!+(|]+/).filter(Boolean);
}

// Is there anything to censor? Checks each word, and also each run of short pieces
// joined together, which is how spaced-out spelling gets through a word-at-a-time check.
export function hasBadWord(text) {
  const w = words(text);
  for (const one of w) if (isBadWord(one)) return true;
  // Join runs of 1-2 character pieces: "f u c k" -> "fuck". Longer pieces are left alone,
  // because joining real words is exactly how "class" + "ic" becomes a false positive.
  let run = "";
  for (const one of w) {
    if (one.length <= 2) {
      run += one;
      if (run.length >= 3 && isBadWord(run)) return true;
    } else {
      run = "";
    }
  }
  return false;
}

// Replace bad words with asterisks, keeping everything else exactly as typed — including
// spacing and punctuation, so a censored line still reads as the sentence it was.
export function censor(text, mask = "*") {
  const src = String(text);
  let out = "";
  let token = "";
  const flush = () => {
    if (!token) return;
    if (!isBadWord(token)) { out += token; token = ""; return; }
    // Mask the WORD, not its punctuation. A leet symbol at the edge of a token is
    // punctuation (`fuck!`) rather than a letter (`a$$`), and masking the whole token
    // turned "what the fuck!" into "what the *****" — losing the exclamation mark that
    // was never the problem.
    const lead = (token.match(/^[^A-Za-z0-9]+/) || [""])[0];
    const trail = (token.match(/[^A-Za-z0-9]+$/) || [""])[0];
    const core = token.slice(lead.length, token.length - trail.length) || token;
    out += lead + mask.repeat(core.length) + trail;
    token = "";
  };
  for (const ch of src) {
    if (/[A-Za-z0-9@$!+(|]/.test(ch)) token += ch;
    else { flush(); out += ch; }
  }
  flush();
  return out;
}

// Words that are unambiguous enough to look for INSIDE a name. A name is one run of
// characters with no spaces to split on, so "shitlord" and "xXfuckXx" sail past a
// whole-word rule — but substring matching is exactly what causes the Scunthorpe
// problem, so it is confined to these and paired with the allowlist below.
const STRONG = Object.freeze([
  "fuck", "shit", "cunt", "bitch", "asshole", "nigger", "nigga", "faggot", "whore",
  "dildo", "wanker", "bastard", "penis", "vagina", "retard", "slut", "pussy",
]);

// Real words and names that contain one of the above and are not a problem. Short, and
// grows by evidence: somebody being told their name is unacceptable when it is fine is
// the failure this list exists to prevent.
const NAME_ALLOW = Object.freeze([
  "scunthorpe", "penistone", "lightwater", "clbuttic", "cockburn", "shittake",
  "shiitake", "assassin", "classic",
]);

// A name is rejected outright rather than masked: nobody wants to be called ****, and a
// name is chosen once where a chat line is one of thousands.
export function nameIsAllowed(name) {
  const n = normalizeWord(name);
  if (!n) return true;
  if (NAME_ALLOW.includes(n)) return true;
  if (hasBadWord(name)) return false;
  return !STRONG.some((bad) => n.includes(bad));
}
