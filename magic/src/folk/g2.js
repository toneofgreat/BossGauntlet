/* ===========================================================================
   folk/g2.js - flying, quid1, hunt, lord, transfig, duel.
   Pure data. No imports, no geometry, no positions.
   ========================================================================= */
export default {

  /* --- FLYING LESSON ------------------------------------------------- */
  flying: [
    {
      name: 'MADAM REDFERN',
      kind: 'teacher',
      zone: 'near',
      look: { skin: 1, hair: 6, hairCol: 5, eyes: 2, wear: 2 },
      lines: [
        'I am down as the second pair of eyes at every flying lesson. I have never once been on a broom.',
        'Madam Hoop has the whistle today, so the lesson will be short and somebody will cry.',
        'UP is a word you mean. It is not a word you say.'
      ],
      more: [
        'On the ground, where I have always been, and pleased about it.',
        'Your chin will bruise. They all do. It passes.'
      ]
    },
    {
      name: 'ELSPETH DUNNOCK',
      kind: 'student',
      zone: 'near',
      lines: [
        'Mine will not come up. I have said UP eleven times and it rolled over once, which felt worse.',
        'Say it like you have already done it. The wand man told us that. It works on brooms as well.'
      ],
      more: [
        'Thirteen times now. It is lying on its side in the wet grass.',
        'Go on without me. I will be here, being polite at it.'
      ]
    },
    {
      name: 'CORMAC VANCE',
      kind: 'student',
      zone: 'mid',
      lines: [
        'Six people have come off already. Two in the hedge. One is up a tree and has stopped shouting.',
        'I like it up there. It is the only part of this school where nothing is behind you.'
      ],
      more: [
        'Seven. The tree one came down on his own, eventually.',
        'Look where you want to be. The broom is listening, not looking.'
      ]
    },
    {
      name: 'MATRON SILVE',
      kind: 'teacher',
      zone: 'far',
      look: { skin: 2, hair: 3, hairCol: 5, eyes: 1, wear: 2 },
      lines: [
        'I stand at this hedge every lesson with a bag of splints and I have never taken it home shut.',
        'Four wrists this morning. It is twenty past nine.',
        'If you are going to come off, come off low. That is the only advice I have that ever works.'
      ],
      more: [
        'Still here. Bag still open.',
        'You are walking, which puts you ahead of most of them.'
      ]
    }
  ],

  /* --- YOUR FIRST MATCH ---------------------------------------------- */
  quid1: [
    {
      name: 'AUGUSTA HART',
      kind: 'student',
      zone: 'near',
      lines: [
        'You are seeker. The whole match is one small gold thing, and you, and nothing else at all.',
        'I have been captain two years. I have won one match and lost a tooth, on the same afternoon.',
        'Do not watch us down here. We are not the part that ends it.'
      ],
      more: [
        'It is up there somewhere. So are you. Get on with it.',
        'When you see it, go. Do not plan. Planning is how I lost the tooth.'
      ]
    },
    {
      name: 'TOBY MERROW',
      kind: 'student',
      zone: 'mid',
      lines: [
        'I am a beater. A bat, an iron ball, and no thinking at all. Best job in the whole school.',
        'If I shout DOWN, go down. I will not have time to say please first.'
      ],
      more: [
        'That iron one has had a go at my ear twice now.',
        'DOWN means down. I am still not saying please.'
      ]
    },
    {
      name: 'GIDEON ABBERLY',
      kind: 'student',
      zone: 'mid',
      lines: [
        'Keeper. Three hoops, one of me. I made peace with that arithmetic in my first week.',
        'Last match it rained so hard I could not see the hoops, and I still had to look like I could.'
      ],
      more: [
        'Two past me already. Catch the gold one and none of this counts.',
        'My gloves are wet. My gloves are always wet.'
      ]
    },
    {
      name: 'ODILE MALLOY',
      kind: 'student',
      zone: 'far',
      lines: [
        'I have caught it four times. You have been on a broom for one afternoon. This will be quick.',
        'No hard feelings. I will not remember your name either way.'
      ],
      more: [
        'Still looking. So are you, apparently.',
        'You are closer to it than I would like. That was not a compliment.'
      ]
    }
  ],

  /* --- WHERE IS HE? -------------------------------------------------- */
  hunt: [
    {
      name: 'MR STOAT',
      kind: 'caretaker',
      zone: 'near',
      look: { skin: 1, hair: 0, hairCol: 5, eyes: 0, wear: 5 },
      lines: [
        'Out of bed, in my corridor, after dark. I keep a list and you have just gone on it.',
        'Somebody has been marking my walls. I scrub one off at night and by morning there is another.',
        'Forty years I have worked here. The torches never used to go out three at a time.'
      ],
      more: [
        'Still on the list. Near the top of it.',
        'Leave the door at the end alone. It was locked from the other side.'
      ]
    },
    {
      name: 'PERPETUA FINNICK',
      kind: 'student',
      zone: 'mid',
      lines: [
        'I am a prefect. I am meant to walk this corridor. I have stood in this one spot for an hour.',
        'Something went past me when the bell went. It was the height of a person and the wrong shape.',
        'If you are going down there, do not come back and tell me about it.'
      ],
      more: [
        'I have not moved. It is a very good spot and I intend to wear it out.',
        'I counted the torches again. There are two fewer than there were.'
      ]
    },
    {
      name: 'SIR AMBROSE HART',
      kind: 'ghost',
      zone: 'mid',
      look: { skin: 1, hair: 4, hairCol: 5, eyes: 2, wear: 6 },
      lines: [
        'I was headmaster here thirty years and I have been dead for ninety. The dead years are quieter.',
        'The old man in the big frame has gone out of it. Paintings do not go out of their frames.',
        'Whatever came along here last night did not look up at the paintings. Everyone looks up at them.'
      ],
      more: [
        'I have had a drift round the corridor. His frame is still empty.',
        'Carry a light. Nothing in this castle minds the dark less than you do.'
      ]
    },
    {
      name: 'PROFESSOR GORSE',
      kind: 'teacher',
      zone: 'far',
      look: { skin: 3, hair: 1, hairCol: 5, eyes: 3, wear: 2 },
      lines: [
        'I am marking out here because the light is better. The light is not better.',
        'Professor Twitt is not the problem, whatever the third years say. Watch who is kind to him.',
        'Go to bed. I am going to say that, and neither of us is going to do anything about it.'
      ],
      more: [
        'The same essay. I have read the first paragraph four times.',
        'If you find anything, do not tell me where. I have to write it down if you tell me.'
      ]
    }
  ],

  /* --- THE MAN WITH NO NOSE ------------------------------------------ */
  lord: [
    {
      name: 'BROTHER MERROW',
      kind: 'ghost',
      zone: 'near',
      lines: [
        'I have been under this school since before it was a school. It was a well then. A good well.',
        'Something woke up down here in the spring, and the mist has not sat right since.',
        'You are warm. Everything in this room will notice that before it notices anything else.'
      ],
      more: [
        'I have not been anywhere. I never am anywhere.',
        'He talks while he works. There is a moment in it where he is too busy to be careful.'
      ]
    },
    {
      name: 'HESTER VANCE',
      kind: 'student',
      zone: 'mid',
      lines: [
        'Seventh year. I got as far as the chess and sat down. I will not pretend that was the plan.',
        'I came down here to help. I have been helping from this exact spot for two hours.'
      ],
      more: [
        'Still sitting. Still helping.',
        'If you go in there and come out again, I would like to hear how you managed it.'
      ]
    },
    {
      name: 'MR ABBERLY',
      kind: 'caretaker',
      zone: 'far',
      lines: [
        'I sweep down here on Tuesdays. I have never asked what the round room is for and I never will.',
        'There is a mirror in there. I do not clean the mirror. That is in writing, with my name on it.',
        'When the torches go green, I go up. That is the whole of my arrangement with this place.'
      ],
      more: [
        'It is Tuesday. I am sweeping. You could set a clock by me.',
        'The floor in there stays clean. Nothing walks on it.'
      ]
    }
  ],

  /* --- TRANSFIGURATION ----------------------------------------------- */
  transfig: [
    {
      name: 'ALBERT QUILL',
      kind: 'student',
      zone: 'near',
      lines: [
        'I turned mine into a teacup. It has a face on it. Professor Mynn gave me six and a long look.',
        'Changing a thing is easy. Changing it back is the part nobody puts on the timetable.'
      ],
      more: [
        'The cup blinked. I have decided that it did not.',
        'Mean it harder. A box can tell when you are only guessing at it.'
      ]
    },
    {
      name: 'THE CAT ON THE DESK',
      kind: 'creature',
      zone: 'mid',
      lines: [
        'Sit down.',
        'A cat said that. You may think about it later. Sit down.'
      ],
      more: [
        'Still a cat. For the moment.',
        'Your teacup has whiskers. I have no comment to make about that.'
      ]
    },
    {
      name: 'MARGERY STOAT',
      kind: 'student',
      zone: 'mid',
      lines: [
        'Third week I turned a beetle into a button. I kept the button. I am not sure that was kind.',
        'She was a cat when we came in. Nobody here is certain she has finished coming back.'
      ],
      more: [
        'I have the button in my pocket. I am no surer than I was.',
        'Do all eight in a row. You lose your nerve if you stop and think in the middle.'
      ]
    },
    {
      name: 'PROFESSOR DUNNOCK',
      kind: 'teacher',
      zone: 'far',
      look: { skin: 0, hair: 6, hairCol: 5, eyes: 4, wear: 2 },
      lines: [
        'I spent last term as a cat. Marking was easier. I came back with a habit of sitting in the sun.',
        'Do not change anything that is already looking at you. That is the only rule I enforce.',
        'The castle has been darker this year. Even the paintings have gone quiet about it.'
      ],
      more: [
        'Two legs, all morning. It is going well.',
        'You may stroke the cat on the desk. You may not say that I said so.'
      ]
    }
  ],

  /* --- THE DUELLING CLUB --------------------------------------------- */
  duel: [
    {
      name: 'MR DAWE',
      kind: 'caretaker',
      zone: 'near',
      look: { skin: 0, hair: 1, hairCol: 5, eyes: 4, wear: 5 },
      lines: [
        'Duelling club. Two children, one long stage, and a hall full of people who want a story.',
        'I stand here with a dustpan. That is my whole part in the evening and I have made peace with it.',
        'That Malloy boy breaks things so that you will look at the things. That is all his cleverness is.'
      ],
      more: [
        'Dustpan. Brush. I am in no hurry for either of them.',
        'Mend what he breaks and I shall think well of you. Nobody else in this hall will notice.'
      ]
    },
    {
      name: 'BARNABY FINNICK',
      kind: 'student',
      zone: 'near',
      lines: [
        'I have mended forty-one things this term. Teapots, a chair, a boot. The boot took longest.',
        'My hands shake now whenever something breaks. Useful, in a way. I am already turning round.'
      ],
      more: [
        'Forty-two. Somebody dropped a jug behind me while we were talking.',
        'Do both at once. The ones who lose stand still and stare at one broken teapot.'
      ]
    },
    {
      name: 'IRIS MERROW',
      kind: 'student',
      zone: 'mid',
      lines: [
        'I keep the score. Last year this club cost the school nine vases and one eyebrow.',
        'He is quick and he is loud. People think those are the same thing, and lose to him for it.'
      ],
      more: [
        'Nine vases and one eyebrow. The count is holding, just about.',
        'The end of the stage is nearer than he thinks. He never once looks behind him.'
      ]
    },
    {
      name: 'LADY MALLOY',
      kind: 'ghost',
      zone: 'far',
      lines: [
        'That boy is my great-great-grandson. I have watched four generations of us be smug up there.',
        'Three of them went off the end. I floated down beside each one and said nothing at all.'
      ],
      more: [
        'Still floating. Still saying nothing.',
        'He cannot see me. It would not help him if he could.'
      ]
    }
  ]

}
