// phases.js - story phases, legal transitions and CONTINUE normalisation (CONTRACT 8.4, DESIGN 4.10). Pure.

export const PHASES = Object.freeze([
  // cycle 0
  "intro", "area1", "area2", "area3", "postKing", "desert", "forest", "forestHouse", "chase", "collapse", "throne",
  // cycle 1
  "ng", "ngPostKing", "hollowDesert", "girl", "hollow2", "choice", "finalBoss", "ended"
]);

const INDEX = Object.create(null);
for (let i = 0; i < PHASES.length; i++) INDEX[PHASES[i]] = i;

export const CYCLE1_START = INDEX.ng;

export function isPhase(p) { return typeof p === "string" && INDEX[p] !== undefined; }
/** index in PHASES, or -1 */
export function phaseIndex(p) { const i = INDEX[p]; return i === undefined ? -1 : i; }

/**
 * Is `from -> to` allowed? Forward moves are allowed (skipping ahead too), plus the special edges of CONTRACT 8.4.
 * Crossing from a cycle-0 phase into a cycle-1 phase is only allowed with opts.viaCycle (startCycle(1)).
 * Same phase -> false (nothing to do; callers treat it as a no-op).
 */
export function isLegalTransition(from, to, opts) {
  if (!isPhase(to)) return false;
  if (!isPhase(from)) return true;                    // unknown/corrupt saved phase: anything repairs it
  if (from === to) return false;
  if (to === "ended") return true;                    // any -> ended
  if (from === "finalBoss" && to === "choice") return true;   // remember
  if (from === "ended" && (to === "choice" || to === "finalBoss" || to === "intro")) return true;
  const a = INDEX[from], b = INDEX[to];
  if (b <= a) return false;                           // no going back otherwise
  if (a < CYCLE1_START && b >= CYCLE1_START) return !!(opts && opts.viaCycle);
  return true;
}

/**
 * CONTINUE rules (DESIGN 4.10). Returns { phase, place } where place is
 *  "lobby"      -> resume at the lobby spawn with `phase`
 *  "throneDoor" -> resume at the throne door, phase throne (the fight restarts)
 *  "choice"     -> restore the choice snapshot, phase choice, player at the black sword
 */
export function normalizeResume(phase) {
  switch (phase) {
    case "intro": case "area1": case "area2": case "area3": case "postKing": case "ng": case "ngPostKing":
      return { phase, place: "lobby" };
    case "desert": case "forest": case "forestHouse": case "chase": case "collapse":
      return { phase: "postKing", place: "lobby" };
    case "throne":
      return { phase: "throne", place: "throneDoor" };
    case "hollowDesert": case "girl": case "hollow2":
      return { phase: "ngPostKing", place: "lobby" };
    case "choice": case "finalBoss": case "ended":
      return { phase: "choice", place: "choice" };
    default:
      return { phase: "intro", place: "lobby" };
  }
}

/** first phase of a cycle */
export function cycleStartPhase(cycle) { return cycle ? "ng" : "intro"; }
