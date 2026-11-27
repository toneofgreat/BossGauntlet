// drops.js - kill drop rules (DESIGN 4.2 / 4.7). Pure: operates on state.run, returns base item ids to give.
import { ownsAny } from "./items.js";

export const WOOD_CHANCE = 0.2;   // 1 in 5
export const WOOD_PITY = 0;       // 0 = no pity timer: a pure 1 in 5 roll per villager kill, as requested

// Returns an array of BASE item ids (caller maps to the cycle variant and gives them).
// Mutates run.flags (combat.* namespace) and run.villagerNoWood. rng() -> [0,1)
export function rollDrops(kind, run, rng = Math.random) {
  const out = [];
  const f = run.flags || (run.flags = {});
  const owned = run.owned || {};
  switch (kind) {
    case "rat":
      // first Small Rat kill ever (this run)
      if (!f["combat.drop.smelly"] && !ownsAny(owned, "smelly_sword")) { f["combat.drop.smelly"] = true; out.push("smelly_sword"); }
      break;
    case "ratKing":
      if (!f["combat.drop.cheese"]) { f["combat.drop.cheese"] = true; out.push("cheese_sword"); }
      break;
    case "villager":
      if (!f["combat.drop.wooden"] && !ownsAny(owned, "wooden_sword")) {
        run.villagerNoWood = (run.villagerNoWood || 0) + 1;
        if (rng() < WOOD_CHANCE || (WOOD_PITY > 0 && run.villagerNoWood >= WOOD_PITY)) {
          f["combat.drop.wooden"] = true;
          run.villagerNoWood = 0;
          out.push("wooden_sword");
        }
      }
      break;
    case "fydor":
    case "myles":
      // "only one try": the first Guard you ever defeat drops it, exactly once per run
      if (!f["combat.drop.iron"]) { f["combat.drop.iron"] = true; out.push("iron_sword"); }
      break;
    case "royalGuard":
      if (!f["combat.drop.gold"]) { f["combat.drop.gold"] = true; out.push("gold_sword"); }
      break;
    case "king":
      if (!f["combat.drop.staff"]) { f["combat.drop.staff"] = true; out.push("kings_staff"); }
      break;
    case "cat":
      if (!f["combat.drop.cat"]) { f["combat.drop.cat"] = true; out.push("cat_claws", "toms_bell"); }
      break;
    case "rookie":
      if (!f["combat.drop.rookie"]) { f["combat.drop.rookie"] = true; out.push("rookie_badge"); }
      break;
    default: break;
  }
  return out;
}

// where each droppable item comes from (for grave prompts / inventory hints)
export const SOURCES = {
  smelly_sword: "Small Rats (first kill)",
  cheese_sword: "the Rat King (first win)",
  wooden_sword: "Villagers (1 in 5)",
  iron_sword: "the Guards (first defeat)",
  gold_sword: "Royal Guards (first kill)",
  kings_staff: "the King (first win)",
  cat_claws: "a secret cat",
  toms_bell: "a secret cat",
  rookie_badge: "a secret rookie",
};
