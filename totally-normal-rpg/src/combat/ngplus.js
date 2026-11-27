// ngplus.js - cycle-1 ("corrupted run") modifiers (DESIGN 4.7). Pure.
import { CYCLE } from "./stats.js";
import { variant } from "./items.js";

export function isNg(cycle) { return (cycle | 0) >= 1; }

// per-enemy extra abilities unlocked in cycle >= 1
export const ABILITIES = {
  rat: ["pounce", "bleed"],
  goldenRat: [],
  ratKing: ["burrow", "cheeseBomb"],
  villager: ["torch"],
  fydor: ["fissure"],
  myles: ["riposte"],
  royalGuard: ["blink"],
  king: ["clones", "lightsOut"],
  shadowGuard: [],
  cat: ["doubleHiss"],
  rookie: [],
};

export function modifiers(cycle) {
  const ng = isNg(cycle);
  return {
    ng,
    recMul: ng ? CYCLE.recMul : 1,
    hpMul: ng ? CYCLE.hpMul : 1,
    dmgMul: ng ? CYCLE.dmgMul : 1,
    eyes: ng ? "red" : "normal",
  };
}

export function hasAbility(kind, ability, cycle) {
  if (!isNg(cycle)) return false;
  const a = ABILITIES[kind];
  return !!a && a.indexOf(ability) >= 0;
}

// the item a drop/claim gives in this cycle ("horrible drops")
export function dropId(baseId, cycle) { return variant(baseId, cycle); }

// cycle-1 villager/guard aggro barks get "wrong words"
export const NG_BARKS = {
  villager: ["Get off my land. My land. MY LAND.", "Get off my land! Again!", "Get off... we did this already."],
  villagerMorph: ["...brother? No. Not again.", "...brother?"],
};
