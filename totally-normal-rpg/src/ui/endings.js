// endings.js - ending card data (DESIGN 9.6). Pure data. Every text fits a 390 px viewport.
export const ENDINGS = Object.freeze({
  monster: { title: "MONSTER ENDING", text: "You took the sword. The sword took you. Something always has to be the monster.", theme: "monster" },
  world: { title: "WORLD ENDING", text: "You stepped into the white so that no one would ever hold it. The world let go with you, gently.", theme: "world" },
  warrior: { title: "WARRIOR ENDING", text: "You buried their swords, their staff, her ribbon. Warriors don't keep trophies. The black sword rusts alone.", theme: "warrior" },
  idiot: { title: "IDIOT ENDING", text: "You waited ten minutes for the end of the world, and then you lost to it. Idiot.", theme: "idiot" },
  winners: { title: "WINNERS ENDING", text: "You beat the end of the world. Probably.", theme: "winners" },
  sigma: { title: "SIGMA ENDING", text: "Twice. Without dying. The Hollow will tell its children about you.", theme: "sigma" }
});
export const ENDING_IDS = Object.freeze(Object.keys(ENDINGS));

export const BUTTON_LABELS = Object.freeze({
  winner: "Winner", remember: "Remember the choice", startOver: "Start over", title: "Title"
});

export function endingCard(id) {
  return ENDINGS[id] || { title: String(id || "the end").toUpperCase(), text: "", theme: "idiot" };
}

export const DEATH_HINTS = Object.freeze([
  "Heavy attacks (hold) hit 2.5x harder.",
  "Dodge-roll through attacks: you can't be hit mid-roll.",
  "Jump over the ground shockwave rings.",
  "Red circles on the ground mean move. Now.",
  "Enemy plates: green means you outclass them, red means run.",
  "Better gear multiplies every level you earn.",
  "You regenerate after 5 seconds without getting hit.",
  "Nothing is lost. Totally normal."
]);
