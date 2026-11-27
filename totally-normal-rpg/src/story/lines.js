// lines.js - every NPC / prop line in the game (DESIGN 5.3, 5.4). Pure data: no DOM, no ctx.
// getDialogue(id, c) -> { speaker, lines:[string], choices?:[string], action?, voice } | null
// c (built by dialogue.js): { name, cycle, post, pi, level, talks, guardsBeaten, ratKingBeaten, kingBeaten, kittens,
//   catBeaten, rookieBeaten, locket, letter, signReads, kingNeed, area2Need, guardRec, phase }
// Every line is short enough to wrap cleanly in the 390 px dialogue box (<= ~150 chars).

export const SPEAKERS = Object.freeze({
  bram: "Old Bram", nessa: "Nessa", tobin: "Tobin", ilsa: "Grandma Ilsa", pell: "Pell", odo: "Odo",
  wren: "Wren", fydor: "Fydor", myles: "Myles", rookie: "Rookie", sign: "The sign", hollow: "", girl: ""
});
// short names for prompts ("Talk to Nessa")
export const SHORT = Object.freeze({
  bram: "Bram", nessa: "Nessa", tobin: "Tobin", ilsa: "Ilsa", pell: "Pell", odo: "Odo", wren: "Wren",
  fydor: "Fydor", myles: "Myles", rookie: "Rookie", sign: "the sign"
});
// dialogue blip pitch per speaker (AUDIO voice "blip")
export const PITCH = Object.freeze({
  bram: 0.8, nessa: 1.1, tobin: 1.5, ilsa: 1.0, pell: 1.25, odo: 0.95, wren: 1.15, fydor: 0.6, myles: 0.85,
  rookie: 1.35, sign: 1.0
});
// the 8 talkable NPC keys counted for `allNpcs`
export const TALK_KEYS = Object.freeze(["bram", "nessa", "tobin", "ilsa", "pell", "odo", "wren", "fydor"]);

export const ITEM_NAMES = Object.freeze({
  cheese_sword: "Cheese Sword", bad_cheese_sword: "Moldy Cheese Sword",
  wooden_sword: "Wooden Sword", bad_wooden_sword: "Termite Plank",
  iron_sword: "Iron Sword", bad_iron_sword: "Rust Stick",
  gold_sword: "Gold Sword", bad_gold_sword: "Fool's Gold Sword",
  kings_staff: "King's Staff", bad_kings_staff: "Bent Twig Staff",
  girls_ribbon: "Elsie's Ribbon",
  iron_armor: "Iron Armor", bad_iron_armor: "Rusty Bucket Armor",
  villager_morph: "Villager Morph", bad_villager_morph: "Scarecrow Morph",
  golden_armor: "Golden Armor", bad_golden_armor: "Gold-Painted Bin Lid",
  shovel: "Shovel", fydors_locket: "Fydor's Locket", mylesletter: "Myles's Letter"
});
export function itemName(id) { return ITEM_NAMES[id] || id; }

// graves (CONTRACT 8.2): item each grave accepts (base id; "bad_" variant also accepted) + where it comes from
export const GRAVES = Object.freeze([
  { id: "grave0", name: "The Rat King", item: "cheese_sword", from: "The Rat King drops it." },
  { id: "grave1", name: "The Villagers", item: "wooden_sword", from: "Villagers drop it." },
  { id: "grave2", name: "Fydor & Myles", item: "iron_sword", from: "The guards drop it." },
  { id: "grave3", name: "The Royal Guards", item: "gold_sword", from: "A Royal Guard drops it." },
  { id: "grave4", name: "The King", item: "kings_staff", from: "The King drops it." },
  { id: "grave5", name: "Elsie", item: "girls_ribbon", from: "It was left in the sand." }
]);

function N(c) { return c && c.name ? c.name : "traveller"; }
function pick(arr, i) { return arr[Math.min(arr.length - 1, Math.max(0, i | 0))]; }

const FIGHT = ["Fight", "Not yet"];

// ---------------------------------------------------------------------------------------------------------------
const NPC = {
  bram(c) {
    if (c.cycle >= 1) {
      return { lines: [
        `Morning, ${N(c)}. Rats got into the field again. Again. Again.`,
        "Cross the bridge, give 'em a punch. You know how it goes. You KNOW how it goes.",
        c.talks > 0 ? "We've talked about this. We've talked about this. My chair remembers. Chairs do."
                    : "...Did we do this before? Your face. I've seen your face on this porch a hundred mornings."
      ] };
    }
    if (c.talks === 0) {
      return { lines: [
        `Morning, ${N(c)}. Rats got into the field again.`,
        "Cross the bridge, give 'em a punch. Click or F to swing. Hold it down for a big one.",
        "E talks to folk. Space jumps. Shift if you're in a hurry. Totally normal stuff.",
        "Off you go. And stay round the front of the house, there's a good lad. Or lass. Whatever you are."
      ] };
    }
    if (c.level < 5) return { lines: [
      "Field's just past the bridge. Can't miss it. Rats are the grey ones.",
      "Nessa'll talk your ear off on the way. Let her. She likes it."
    ] };
    if (!c.ratKingBeaten) return { lines: [
      "Big squeaking last night, from the old mill. That'll be the Rat King.",
      "Bottle cap for a crown. Don't laugh at it. He hates that."
    ] };
    if (c.level < c.area2Need) return { lines: [
      `Village gate opens for anyone with ${c.area2NeedText} levels. That's the rule.`,
      "Nobody remembers who made the rule. Nobody asks. That's how you know it's a good rule."
    ] };
    if (c.level < 50000) return { lines: [
      "Heard you've been knocking on doors in the village. With a pitchfork coming back out of 'em.",
      "Hah. Normal. All very normal."
    ] };
    return { lines: [
      `You're getting strong, ${N(c)}. Stronger than anyone's been in a long time.`,
      "...You won't go round the back of the house, will you? Nothing back there. Just the woodpile.",
      "Just the woodpile."
    ] };
  },

  nessa(c) {
    if (c.cycle >= 1) return { lines: [
      "Twenty winters back the first Rat King came up out of the mill cellar. Twenty winters back. Twenty winters back.",
      "Fydor stood on this bridge three days and three nights. He is still standing there. Can't you see him?",
      "You will never beat Fydor. You did. You will never. You did."
    ] };
    if (c.post) return { lines: [
      `The river's running the wrong colour, ${N(c)}. Not grey. Something darker.`,
      "Fydor came down to the bridge this morning. He's never come down. He looked at the Lobby House a long time."
    ] };
    if (c.guardsBeaten) return { lines: [
      "You... beat Fydor?",
      "No. No, I don't believe it. Fence post. Three days. The rats.",
      "...Was he smiling? He'd smile, I think, if somebody finally did it."
    ] };
    if (c.talks === 0) return { lines: [
      "Mind the third plank, it sings. Hello! You'll be wanting the story. Everyone who crosses gets the story.",
      "Twenty winters back the first Rat King came up out of the mill cellar with a thousand rats behind him.",
      "Everybody ran. Fydor didn't. He stood on this bridge three days and three nights with nothing but a fence post.",
      "And on the fourth morning the river ran grey with rats, and Fydor was asleep. Standing up.",
      "They made him guard of the village for life. He has never lost. Not one fight.",
      "You will never beat Fydor."
    ] };
    return { lines: pick([
      ["Fence post. Three days. Asleep standing up.", "You will never beat Fydor."],
      ["The rats are just over there. Small ones first. Work your way up.", "Not to Fydor, though. You will never beat Fydor."],
      ["Still here? The river doesn't cross itself.", "...I mean, you cross it. You know what I mean."]
    ], (c.talks - 1) % 3) };
  },

  tobin(c) {
    if (c.cycle >= 1) return { lines: [
      "Are you gonna fight the rats? You fought the rats. You fought them. You fought them.",
      "Myles caught the rock without turning round. He keeps it in his pocket. He keeps a lot of things.",
      "You'll never beat Myles either. Either. Either."
    ] };
    if (c.post) return { lines: [
      "My dog won't go near the Lobby House now. She just sits by the fence and looks at it.",
      "Dogs know stuff. That's what my mum says. Then she shuts the curtains."
    ] };
    if (c.guardsBeaten) return { lines: [
      "You beat MYLES? Did he still have the rock?",
      "...Can I tell people? I'm going to tell people. I'm telling everyone."
    ] };
    if (c.talks === 0) return { lines: [
      "Are you gonna fight the rats? I fight them. Well. I watch them.",
      "Do you want to know about Myles? Everybody knows about Fydor. Nobody asks about Myles.",
      "Myles is Fydor's little brother. He learned to fight by watching Fydor.",
      "And he watched so long he knows what you'll do before you do it.",
      "A man once threw a rock at the back of his head and Myles caught it without turning round.",
      "Then he put it in his pocket. He still has it!",
      "You'll never beat Myles either."
    ] };
    return { lines: pick([
      ["If you swing big, Myles just... isn't there any more. I've seen it.", "You'll never beat Myles either."],
      ["Rats run away when they're nearly beaten. Chase them! Or don't. They come back anyway."],
      ["Hold the button down for a big hit. My mum says that's cheating. It's not cheating."]
    ], (c.talks - 1) % 3) };
  },

  ilsa(c) {
    if (c.cycle >= 1) return { lines: [
      "Some say there's a cat boss somewhere. Some say. Some say.",
      "You hear bells at night. You hear them now. Listen.",
      "...Sit down, dear. You've been standing up for ever so long."
    ] };
    if (c.post) return { lines: [
      "When I was a girl there was a song in the desert at night. My mother shut the windows.",
      "I never knew why. I think I'm starting to."
    ] };
    if (c.catBeaten) return { lines: [
      "Big Tom! You met him. Did he purr? He used to purr for the King's children.",
      "Three of them, there were. Before. Ah, well. Old women and their befores."
    ] };
    if (c.kittens) return { lines: [
      "You found the little ones? Then he'll be waiting. He always waits for the little ones.",
      "The old barn, west of the square. Bring something sharper than a smile."
    ] };
    return { lines: [
      "Sit with an old woman a moment, dear. My knees don't go further than this bench.",
      "Some say there's a cat boss somewhere. Big as a cart. Nobody's ever seen him.",
      "...You hear bells at night, though.",
      "Little bells. The kind you put on a kitten, so you can find it. Kittens get everywhere. Up high, mostly."
    ] };
  },

  pell(c) {
    if (c.cycle >= 1) return { lines: [
      "Ah! An audience! Again! Pell, bard, by appointment to the same afternoon, over and over.",
      "There's a Rookie Boss. Brand new. Brand new. Brand new every time.",
      "I had a song once. A little girl sang it better. Where did she go?"
    ] };
    if (c.post) return { lines: [
      "I tried to write a song about what's behind the Lobby House.",
      "The words kept coming out as humming. Same tune every time. I don't even know where I learned it."
    ] };
    if (c.rookieBeaten) return { lines: [
      "You found the Rookie! Did he do the cape thing? He always does the cape thing.",
      "I'm writing a ballad. It's mostly about the cape thing."
    ] };
    return { lines: [
      "Ah! An audience! Pell, bard, by appointment to absolutely no one.",
      "Shall I sing of Fydor? Everyone sings of Fydor. Let me tell you of someone new.",
      "There's a Rookie Boss. Brand new. Very nervous. Nobody's ever heard of him.",
      "Which is what he wants, I expect.",
      "They say he practises where the water's loudest, so nobody hears him say \"ow\"."
    ] };
  },

  odo(c) {
    if (c.cycle >= 1) return { lines: [
      "Nothing is for sale. Everything is for EARNING. Everything is for EARNING.",
      "The stock has gone off a bit. Don't sniff it. Don't sniff me either."
    ], action: "shop" };
    if (c.talks === 0) return { lines: [
      "Welcome to the Village Exchange!",
      "Nothing is for sale. Everything is for EARNING.",
      "Reach the level, claim the thing. Very fair. I invented fair."
    ], action: "shop" };
    return { lines: [c.post ? "Business is... quiet. Everyone's looking north. Let's see what you've earned."
                            : "Nothing is for sale. Let's see what you've earned."], action: "shop" };
  },

  wren(c) {
    if (c.cycle >= 1) return { lines: [
      "Hear ye. Hear ye. Hear ye. His Majesty fights in the dark. It has always been dark.",
      `The portal wants ${c.kingNeedText} levels now. Prices go up. Everything goes up, near the end.`
    ] };
    if (c.kingBeaten || c.post) return { lines: [
      "His Majesty is... resting. He said a strange thing before he went quiet.",
      "\"The staff was the lock. Now it's only a stick.\" Then he laughed. He doesn't laugh."
    ] };
    return { lines: [
      "Hear ye! Hear ye! ...Oh. Just you. Hello.",
      "His Majesty fights in the dark. He says the light was never his friend.",
      `The portal in the great hall goes to him. It only lets through those of ${c.kingNeedText} levels or more.`,
      "Bring your own light. Actually, don't. He'll only put it out."
    ] };
  },

  fydor(c) {
    if (c.cycle >= 1) return { lines: [
      "Halt. Halt. You've been here before. I remember your boots.",
      "Twenty winters I've stood here. Twenty winters. It's always the same afternoon.",
      "Will you try? You always try."
    ], choices: FIGHT, action: "fightGuards" };
    if (c.post) return { lines: [
      "You broke the seal.",
      "Don't go behind the house. Whatever you hear. Whatever sings.",
      "...Our sister followed a song once. Elsie. We never found her."
    ], choices: FIGHT, action: "fightGuards" };
    if (c.guardsBeaten) {
      const l = ["They said I'd never lose. I liked that story better than I liked being right."];
      if (c.locket) l.push("That locket at your neck. Where did you... Keep it. She'd have liked you.");
      l.push("Again, then? Myles is itching for it.");
      return { lines: l, choices: FIGHT, action: "fightGuards" };
    }
    if (c.talks === 0) {
      const l = [
        "Halt. You're the one who's been emptying the village.",
        "I've stood on worse ground than this against worse than you. Three days, once.",
        "My brother and I guard this road. Nobody goes up to the castle without going through us."
      ];
      if (c.level < c.guardRec / 2) l.push(`You're not ready. Come back near ${c.guardRecText}. But I won't stop you trying.`);
      l.push("Well? Will you try?");
      return { lines: l, choices: FIGHT, action: "fightGuards" };
    }
    return { lines: [c.level < c.guardRec / 2 ? `Back again. Still not ready. ${c.guardRecText}, I'd say. Will you try anyway?`
                                               : "Back again. Good. The road doesn't guard itself. Will you try?"],
             choices: FIGHT, action: "fightGuards" };
  },

  myles(c) {
    if (c.cycle >= 1) return { lines: [
      "I know what you'll do before you do it. You'll do this. You'll do this again.",
      "I caught a rock once. I caught it again. It keeps coming."
    ], choices: FIGHT, action: "fightGuards" };
    if (c.post) return { lines: [
      "You broke the seal. I felt it in my teeth.",
      "Don't go behind the house. Please. I'm asking, not guarding."
    ], choices: FIGHT, action: "fightGuards" };
    if (c.guardsBeaten) {
      const l = ["Fydor... they beat us. I keep saying it out loud to see if it's true."];
      if (c.letter) l.push("You read my letter. ...I write to her every year. I never know where to send it.");
      else l.push("I still have the rock, by the way. Want to see it? No? Fair.");
      return { lines: l, choices: FIGHT, action: "fightGuards" };
    }
    return { lines: [
      "You're going to swing big and wide. I can tell by your shoulders.",
      "Don't. I'll be somewhere else by the time it lands.",
      "Fydor does the talking. But if you're asking..."
    ], choices: FIGHT, action: "fightGuards" };
  },

  rookie(c) {
    if (c.cycle >= 1) return { lines: [
      "Oh no. Oh no. Someone found me. Someone always finds me.",
      "I'm new at this. I'm always new at this. Why am I always new?",
      "Fight me?!"
    ], choices: ["Fight", "Not now"], action: "fightRookie" };
    return { lines: pick([
      ["Oh! Oh no. Someone found me. Okay. Okay okay okay.",
       "I'm the Rookie Boss. I'm a boss. I'm new at it.",
       "Fight me?! ...Please say yes, I've been practising the entrance."],
      ["You came back! Nobody comes back! I learned a new move. Mostly it's falling over.",
       "Fight me?! I'll try not to trip on the cape this time."],
      ["Third time! That makes you my longest-running nemesis!",
       "I've been training under the waterfall. It's very loud. I've said \"ow\" a lot.",
       "Fight me?!"]
    ], c.talks % 3), choices: ["Fight", "Not now"], action: "fightRookie" };
  },

  sign(c) {
    const head = c.cycle >= 1 ? "TOTALLY A NORMAL RPG?" : "TOTALLY A NORMAL RPG.";
    const r = c.signReads;   // already incremented for this read
    if (r <= 1) return { lines: [head, "Nothing to see behind the house."] };
    if (r === 2) return { lines: [head, "Nothing to see behind the house.", "(The paint is very fresh.)"] };
    if (r === 3) return { lines: [head, "Nothing to see behind the house.", "Really."] };
    if (r === 4) return { lines: [head, "Nothing to see behind the house.", "REALLY."] };
    if (r === 5) return { lines: [head, "Nothing to see behind the house.", c.cycle >= 1 ? "please. please." : "please."] };
    return { lines: [head, c.cycle >= 1 ? "please." : "Nothing to see behind the house. please."] };
  }
};

export function getDialogue(id, c) {
  const f = NPC[id];
  if (!f) return null;
  const d = f(c || {});
  return { speaker: SPEAKERS[id] || id, lines: d.lines, choices: d.choices, action: d.action || null,
           voice: { kind: "blip", pitch: PITCH[id] || 1 } };
}
export const NPC_IDS = Object.freeze(Object.keys(NPC));

// ---------------------------------------------------------------------------------------------------------------
// props and places (shown through ui.dialogue with a "" speaker or a short title)
export const PROPS = Object.freeze({
  wellFirst: [
    "You haul up the bucket. The chain is cold and very long.",
    "Something glints in the water at the bottom: a small silver locket, green with age.",
    "Inside, three children painted in tiny strokes. A big boy, a lean boy, and a little girl with a red ribbon.",
    "Engraved on the back: \"For Elsie. Come home. - F.\""
  ],
  wellAgain: ["Just water now. Cold, and very deep."],
  letter: [
    "A folded letter, read so many times it has gone soft as cloth.",
    "\"Elsie. It's been another year. Fydor still won't say your name, so I say it for both of us.\"",
    "\"We saw it the night you went. A hole cut out of the night, standing in the sand, singing your song back to you.\"",
    "\"The old King sealed the way behind the house with his staff. He says the loop keeps it out.\"",
    "\"Kill rats, get stronger, get a sword. The same story forever, so nobody ever looks behind the house.\"",
    "\"I look. Every night. - Myles\""
  ],
  portrait: [
    "An old portrait of the first King, younger, his staff still new.",
    "Three children sit at his feet: a big boy, a lean boy in a scarf, and a little girl with a red ribbon.",
    "Someone has scratched a tall black shape into the corner of the canvas. Right behind the girl."
  ],
  basement: [
    "An empty cellar. Damp. Cold. It smells like a long time.",
    "On the wall, a chalk drawing: a tall black shape with arms too long, and a small white face.",
    "Underneath, in a child's handwriting: \"IT IS NOT A NORMAL RPG.\""
  ],
  basementPeek: [
    "You lift the trapdoor. Stairs go down into the dark, and a cold breath comes up.",
    "Somewhere below, chalk on stone. A drawing you can't quite see. You decide you've seen enough."
  ],
  throne: ["Comfortable. Too comfortable. You get up before it gets any ideas."],
  throneNg: ["The seat is cold. The crack in the stone runs right under you. You don't stay."],
  cactus: [
    "One cactus is blooming. A single white flower, impossibly soft.",
    "For a moment the wind stops, as if the whole desert is holding its breath for it."
  ],
  totem: [
    "A carved post wrapped in faded ribbon. It is whispering.",
    "\"...behind the house... behind the house... she followed the song...\""
  ],
  chair: ["The rocking chair is still rocking. Nobody is in it.", "The cushion is still warm."],
  kitten: "The kitten purrs.",
  kittenAll: "All three kittens found. Somewhere far off, a little bell rings.",
  bell: "You ring the bell. Up in the rafters, something very large wakes up.",
  bellLocked: "A little bell hangs by the barn door. It doesn't feel like the right time.",
  graveFresh: (g) => [`A plain wooden marker, freshly carved: "${g}".`, "The earth in front of it hasn't been dug. Yet."],
  graveNg: (g) => [`"${g}". The carving is deeper than you remember.`, "The earth in front of it is waiting."],
  graveDone: (g) => [`"${g}". The earth is soft and freshly turned.`],
  graveNoShovel: "You'll need something to dig with. A shovel leans against the fence.",
  graveNeed: (g, item, alt, from) => `${g} needs the ${item}${alt ? " (or " + alt + ")" : ""}. ${from}`,
  graveBuried: (g, item) => `You bury the ${item} for ${g}.`,
  shovel: "You pick up the shovel. The handle is worn smooth by somebody's hands.",
  voidStay: "Stay?",
  whatNow: "What now?",
  voidHum: "(Somewhere below, very far away, someone is humming.)",
  totemWhisper: "...behind the house...",
  guardsWinFirst: [["Myles", "Fydor... they beat us."], ["Fydor", "Then they're ready. Gods help them."]],
  guardsWinAgain: [["Myles", "Again. They beat us again."], ["Fydor", "Stop counting, brother."]],
  guardsWinNg: [["Myles", "Fydor... they beat us. Again. Again."], ["Fydor", "Then they're ready. They're always ready."]],
  hollow: { meet: "we will meet again.", here: "you came back.", take: "hold me.", choice: "what now?" }
});

// zone tips (toast once per run; only with "show hints" on)
export const TIPS = Object.freeze({
  tobin: "Tip: Tobin by the fence knows a story about Myles.",
  ratField: "Tip: hold attack for a heavy hit. Q or right-click to dodge-roll.",
  ratKing: "Tip: jump over the shockwave rings.",
  village: "Tip: villagers block from the front. Hit them from the side.",
  guardPost: "Tip: Myles reads big swings. Jump Fydor's slam.",
  castle: "Tip: Royal Guards leap at you. Leave the red circle.",
  kingDark: "Tip: listen. He whispers where he is about to appear."
});
