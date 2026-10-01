/* ===========================================================================
   folk/g3.js - the cast for chapters 13-18: under the school, the great snake,
   the boy in the book, the music lesson, the wood, and the exam. Data only.
   ========================================================================= */
export default {

/* ---------------------------------------------- THE CHAMBER (chamberfind) --- */
'chamberfind': [
  {
    name: 'ARCHIE FENWICK',
    kind: 'student',
    zone: 'near',
    lines: [
      'I am not going in. I will stand here in the doorway and be company from a distance.',
      'Somebody wrote on that wall in the night. The caretaker has scrubbed it twice.',
      'The floor in there is wet and it has not rained for a week.'
    ],
    more: [
      'Still here. Still not going in.',
      'If you shout, I will fetch somebody. That is the arrangement.',
      'My shoes are dry and I would like to keep them that way.'
    ]
  },
  {
    name: 'MR TULLOCH',
    kind: 'caretaker',
    zone: 'mid',
    look: { skin: 1, hair: 5, hairCol: 5, eyes: 4, wear: 5 },
    lines: [
      'Three hours I scrubbed that wall. By morning it was back. Same words, same hand.',
      'Eight sinks in that room. Count the pipes under them one day. There are seven.',
      'I asked them to shut the room up. They put a notice on the door instead.'
    ],
    more: [
      'Mop. Bucket. Same as yesterday.',
      'The water goes somewhere. Thirty-one years and I have never found where.',
      'If you break anything in there, I never saw you.'
    ]
  },
  {
    name: 'AGNES BRINE',
    kind: 'student',
    zone: 'mid',
    lines: [
      'I keep a list of everybody it has got. Three names so far. I do not want a fourth.',
      'My brother says the writing is a joke. My brother sleeps with his lamp lit now.'
    ],
    more: [
      'Three names. I would very much like to keep it at three.',
      'Do not touch the taps while I am watching. Wait until I have gone.'
    ]
  },
  {
    name: 'GREY SEDGE',
    kind: 'ghost',
    zone: 'far',
    lines: [
      'I was here the last time it opened. I remember the quiet afterwards more than the noise.',
      'A girl died in that room and she is still cross about it. So would I be.',
      'They told us it was only a story. Then they sent the whole school home early.'
    ],
    more: [
      'I float up by the ceiling. The view is no better from here.',
      'Fifty years, and nobody has fixed those taps in any of them.'
    ]
  }
],

/* ------------------------------------------------- THE GREAT SNAKE (snake) --- */
'snake': [
  {
    name: 'BARNABY VOSS',
    kind: 'ghost',
    zone: 'near',
    lines: [
      'I came down this pipe in sixteen ninety and I have not been back up it since.',
      'I shut my eyes when it goes past. It saves time. It saves everything, really.',
      'Nobody has won a staring match down here. Nobody has lived to report on one.'
    ],
    more: [
      'Eyes shut. You will come round to it.',
      'It is a long climb back up, and you are facing the wrong way.'
    ]
  },
  {
    name: 'HOLLY DRAY',
    kind: 'student',
    zone: 'mid',
    lines: [
      'I came down after my brother. I have not found him and I have stopped calling out.',
      'It went past me twice. Both times I looked at the wall and counted to a hundred.'
    ],
    more: [
      'Nine hundred and something. I have lost the thread of it twice.',
      'If you see a boy with a torn sleeve, that is him. Tell him I waited.'
    ]
  },
  {
    name: 'KETTLE',
    kind: 'creature',
    zone: 'far',
    lines: [
      'No light down here. Never needed any. You are the one with the problem.',
      'The big one does not find me. I do not shine and I do not stare.',
      'Take away its looking and it is only something long.'
    ],
    more: [
      'Still dark. Still fine.',
      'Walk softer. The water carries every step you take.'
    ]
  }
],

/* ---------------------------------------------- THE BOY IN THE BOOK (book) --- */
'book': [
  {
    name: 'ADA MARLOW',
    kind: 'ghost',
    zone: 'near',
    lines: [
      'I found that diary in a cupboard and wrote one line in it. It wrote three back.',
      'He was very polite for a whole year. Then he was not polite at all.'
    ],
    more: [
      'He is still writing. I can hear the pen from over here.',
      'Do not tell him your name. He keeps them.'
    ]
  },
  {
    name: 'WALT PARRY',
    kind: 'student',
    zone: 'mid',
    lines: [
      'I picked a tooth up off the floor. It is as long as my arm and I am not putting it down.',
      'He talked to me for an hour. I cannot remember a word of it, and that is the frightening part.'
    ],
    more: [
      'Still holding the tooth. It has gone warm.',
      'He asked about my mother. I said nothing. I think I said nothing.'
    ]
  },
  {
    name: 'MASTER LOWE',
    kind: 'ghost',
    zone: 'far',
    lines: [
      'I came down here fifty years ago to fetch a boy home. I did not manage it.',
      'I tried him with every spell I had and not one of them touched him.',
      'I was aiming at the wrong thing all evening. I have had plenty of time to work that out.'
    ],
    more: [
      'Fifty years. The damp has not improved.',
      'If you get out, tell them Lowe stayed down. They will know the name.'
    ]
  }
],

/* ------------------------------------------------- MUSIC AND PEACE (music) --- */
'music': [
  {
    name: 'MABEL ASHE',
    kind: 'student',
    zone: 'near',
    lines: [
      'Six bells. I have had six bells in my head since Tuesday and never in the right order.',
      'It is not the notes. It is remembering them while something with teeth walks at you.'
    ],
    more: [
      'Wrong again. I get two of them and then my hands stop agreeing with me.',
      'He says listen. I am listening. It is the hands that are the trouble.'
    ]
  },
  {
    name: 'MRS GRIMBLE',
    kind: 'teacher',
    zone: 'mid',
    look: { skin: 0, hair: 6, hairCol: 5, eyes: 4, wear: 1 },
    lines: [
      'I take the singing, next door. Nobody leaves my lesson in bandages, which is rare in here.',
      'There is a dog under this school with three heads, and a tune puts all three to sleep.',
      'That is the whole of music in this place. Teeth, and something to do about the teeth.'
    ],
    more: [
      'Breathe from lower down. It carries further along a corridor.',
      'Keep hold of the tune. You will be glad of it somewhere dark.'
    ]
  },
  {
    name: 'MATRON BRINE',
    kind: 'teacher',
    zone: 'mid',
    look: { skin: 2, hair: 6, hairCol: 1, eyes: 0, wear: 5 },
    lines: [
      'I sit in on this lesson because the hospital wing is full and I would like one quiet hour.',
      'Four of them in beds this week. None from this room. Two from Potions, as usual.'
    ],
    more: [
      'Quiet so far. Long may it last.',
      'If you feel cold in the corridors, that is not the weather. Keep walking.'
    ]
  },
  {
    name: 'DIGBY VOSS',
    kind: 'student',
    zone: 'far',
    lines: [
      'I sit at the back by the torches. It is the warmest corner in the whole school.',
      'I have not sung a note all term. Nobody has noticed and I am not going to raise it.'
    ],
    more: [
      'Still warm here. Still not singing.',
      'The torch behind me went out on its own last week. I moved along one seat.'
    ]
  }
],

/* ------------------------------------------- THE WILDERNESS CLASS (wild) --- */
'wild': [
  {
    name: 'JEM TULLOCH',
    kind: 'student',
    zone: 'near',
    lines: [
      'My uncle keeps the castle. I would rather be inside it than out here, and the castle is bad.',
      'The big man says the forest is safe. He says it the way you say a thing you want to be true.'
    ],
    more: [
      'Outside. Raining on me. Nobody has written any of it down.',
      'Something walked behind that hedge and it did not have the right number of legs.'
    ]
  },
  {
    name: 'MISS PARRY',
    kind: 'teacher',
    zone: 'mid',
    look: { skin: 1, hair: 2, hairCol: 0, eyes: 2, wear: 1 },
    lines: [
      'I am here to write down what happens. I stand this far back for the same reason.',
      'Walk, do not run. Everything out there runs better than you do.',
      'Creatures notice a sudden person. Be a slow one and they will let you come close.'
    ],
    more: [
      'Noted. All of it noted.',
      'Four on my list this morning. There were five on Monday.'
    ]
  },
  {
    name: 'LITTLE MARLOW',
    kind: 'creature',
    zone: 'mid',
    lines: [
      'Box. Air holes. Not my idea.',
      'He named me after a girl he was fond of. I would rather have had a bigger box.'
    ],
    more: [
      'Still in the box. Still counting the holes.',
      'Let the big one open it. He has the gloves on.'
    ]
  },
  {
    name: 'SAM LOWE',
    kind: 'student',
    zone: 'far',
    lines: [
      'I am counting trees so that I do not have to look between them.',
      'Two hundred and six. If I stop counting I will start listening instead.'
    ],
    more: [
      'Two hundred and forty. Do not tell me a number, you will lose me.',
      'There is a horse out there made of nothing at all. I have decided it is a horse.'
    ]
  }
],

/* --------------------------------------------- ADVANCED SPELLS (advanced) --- */
'advanced': [
  {
    name: 'CLARA FENWICK',
    kind: 'student',
    zone: 'near',
    lines: [
      'Nine targets, and each one only wants one spell. I learnt the list and lost it twice.',
      'The colours are the whole exam. You are meant to read them slowly. I never do.'
    ],
    more: [
      'Still reading. Still too fast.',
      'Ropes are the new one. I like ropes. A tied thing cannot come at you.'
    ]
  },
  {
    name: 'PROFESSOR DRAY',
    kind: 'teacher',
    zone: 'mid',
    look: { skin: 4, hair: 4, hairCol: 5, eyes: 5, wear: 4 },
    lines: [
      'I duelled for money once. Now I stand at the back of exams and nobody throws anything at me.',
      'The exam is honest. Every target is labelled. It is the labels you will be careless with.',
      'Learn the rope one properly. There is a year coming when you will want it badly.'
    ],
    more: [
      'Nine of them. Take your time, the hall is not going anywhere.',
      'Drop your wrist. It goes up before you cast, and anyone watching knows what is coming.'
    ]
  },
  {
    name: 'OSWIN GRIMBLE',
    kind: 'student',
    zone: 'far',
    lines: [
      'Third time sitting this. My aunt teaches singing and she says I should have taken singing.',
      'I got eight last year. The ninth I hit with fire, and the hall smelt of it for a week.'
    ],
    more: [
      'Eight again. My aunt has a word for somebody like me. The word is Oswin.',
      'Do not watch me do it. Being watched makes it worse.'
    ]
  },
  {
    name: 'MR SEDGE',
    kind: 'caretaker',
    zone: 'far',
    look: { skin: 3, hair: 5, hairCol: 0, eyes: 0, wear: 5 },
    lines: [
      'I sweep up after this exam. Scorch marks, rope ends, and one shoe last year.',
      'There is a Sedge who floats about the bathrooms upstairs. Great-uncle. We do not discuss him.'
    ],
    more: [
      'Broom. Bucket. Nine of them to go.',
      'Mind the floor by the far wall. It has been melted and mended twice.'
    ]
  }
]

}
