// names.js - the name filter (CONTRACT 9.3, DESIGN 1.1). Pure: no DOM, no network.
// STORY owns the canonical implementation in src/story/names.js; UI re-exports it so there is exactly one filter.
//   validateName(raw) -> { ok:true, name, special } | { ok:false, reason, hint }
//   onlineNameFor(name) -> leaderboard display name (<= 16 chars)
export {
  validateName, onlineNameFor, onlineRetryName, nameHint, cleanName, isSpecialName,
  NAME_MIN, NAME_MAX, ONLINE_MAX, SPECIAL_ONLINE, RUDE_HINT
} from "../story/names.js";

// friendlier wording for the name-entry error line (still fits a 390 px viewport)
export function friendlyNameError(res) {
  if (!res || res.ok) return "";
  switch (res.reason) {
    case "short": return "A little longer, please - 3 to 24 letters.";
    case "long": return "That's a long one. Keep it to 24 characters.";
    case "chars": return "Only letters, numbers, spaces, - and _ please.";
    case "letters": return "Use at least two letters.";
    case "rude": return res.hint || 'That word is too bad. The worst you can say is "idiot".';
    default: return res.hint || "Try another name.";
  }
}
