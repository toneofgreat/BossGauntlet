/* ===========================================================================
   folk/g1.js - the first weeks. A wand shop, charms, the dark stairs, the
   potions dungeon, defence, and the greenhouse in the rain. Data only.
   ========================================================================= */
export default {

  /* ------------------------------------------------------- THE WAND SHOP */
  wand: [
    {
      name: 'MRS OLLERY',
      kind: 'shopkeeper',
      zone: 'near',
      look: { skin: 0, hair: 6, hairCol: 5, eyes: 4, wear: 5 },
      lines: [
        'He will tell you the wand picks you. He will not tell you it took nine boxes to pick him.',
        'Do not worry about the curtains. The curtains are part of it now.'
      ],
      more: [
        'Eleven inches, springy. I heard him through the wall.',
        'If one goes cold in your hand, put it back in the box and say nothing.'
      ]
    },
    {
      name: 'TOBY BRACK',
      kind: 'student',
      zone: 'near',
      lines: [
        'I have been in this chair an hour. Fourteen boxes. One of them screamed and he wrote it down.',
        'My mum says that is normal. My mum has never been in this shop.'
      ],
      more: [
        'Fifteen boxes.',
        'I am going to be an old man in this chair.'
      ]
    },
    {
      name: 'NELL SPRAGG',
      kind: 'student',
      zone: 'mid',
      lines: [
        'The straw men are at the back. They do not move. That is the only kind thing about them.',
        'Mine lit up on the first try and I have been unbearable about it since.'
      ],
      more: [
        'Still unbearable.',
        'Aim low. They go over better when you take the legs.'
      ]
    },
    {
      name: 'OLD MAN COBBE',
      kind: 'shopkeeper',
      zone: 'far',
      look: { skin: 1, hair: 5, hairCol: 5, eyes: 4, wear: 3 },
      lines: [
        'Sixty years with the same wand. I kept a shop with it. It cracked while I was washing up.',
        'He says it will pick me again. He says that to everybody who comes in crying.'
      ],
      more: [
        'Nothing yet. Box forty.',
        'You get used to the smell of a burning curtain.'
      ]
    }
  ],

  /* ------------------------------------------------------------- CHARMS */
  charms: [
    {
      name: 'IVY DEVERY',
      kind: 'student',
      zone: 'near',
      lines: [
        'I flicked too hard and my feather caught fire. He wrote FLICK on the board and underlined it.',
        "It is still smoking. I am pretending it is somebody else's."
      ],
      more: [
        'Smells like a birthday in here.',
        'The swish is small. The flick is smaller. That is all it is.'
      ]
    },
    {
      name: 'MISS LARCH',
      kind: 'teacher',
      zone: 'mid',
      look: { skin: 4, hair: 3, hairCol: 0, eyes: 0, wear: 4 },
      lines: [
        'I came in for chalk. I stayed because the last class put two feathers on the ceiling and left.',
        'They are still up there. When the torches drop you can hear them turning round.'
      ],
      more: [
        'Nobody is getting those down today.',
        'Still turning.'
      ]
    },
    {
      name: 'ODELL WREN',
      kind: 'student',
      zone: 'mid',
      lines: [
        'Mine went up on the second try, then came down on my head. They do not mention that part.',
        'He is tiny and he is standing on books, and he is still the scariest thing in this room.'
      ],
      more: [
        'Mean it. If you do not mean it, the feather knows.',
        'He is watching you. He watches everybody. It is the job.'
      ]
    },
    {
      name: 'TOMMY OAKES',
      kind: 'student',
      zone: 'far',
      lines: [
        'Something was at the window last lesson. It was raining. It was not the rain.',
        'I sit at the back now. The back has a wall behind it.'
      ],
      more: [
        'Raining harder now, if that is of any use to you.',
        'Do not look at the glass when the torches go low.'
      ]
    }
  ],

  /* --------------------------------------------------------- DARK STAIRS */
  stairs: [
    {
      name: 'PIP HALLAM',
      kind: 'student',
      zone: 'near',
      lines: [
        'The lamps have been out since Tuesday. Nobody has said why and I have stopped asking.',
        'I can hear the stairs moving. I cannot see them moving. That is the worse one.'
      ],
      more: [
        'Say something now and then so I know where you are.',
        'Two went past me just now. Steps, I mean. Not people.'
      ]
    },
    {
      name: 'OLD TIDDOW',
      kind: 'ghost',
      zone: 'mid',
      lines: [
        'Two hundred and eleven steps on this side. There were two hundred and nine when I was alive.',
        'I would hold a lamp for you but my hand goes straight through the handle.',
        'There is something shiny out on the landing. I have watched it a week. It has not moved.'
      ],
      more: [
        'Two hundred and twelve. That is new.',
        'Do not step on the left staircase while it is thinking.'
      ]
    },
    {
      name: 'MR SPRAGG',
      kind: 'caretaker',
      zone: 'mid',
      look: { skin: 0, hair: 1, hairCol: 5, eyes: 4, wear: 4 },
      lines: [
        'Three keys off my ring. I did not drop them. Somebody took them and put them somewhere clever.',
        'When you find the third, do not tell me where it was. I would rather not know.'
      ],
      more: [
        'Three short, and that is after I counted the ring twice.',
        'I have asked the suit of armour. The suit of armour is saying nothing.'
      ]
    },
    {
      name: 'ELSIE MUNN',
      kind: 'student',
      zone: 'far',
      lines: [
        'I sat down when the lamps went out and the staircase carried me up here. Now I wait.',
        'If a light comes along the landing, it is either you, or it is not you.'
      ],
      more: [
        'Still waiting.',
        'It moved again. I am higher up than I was when we started talking.'
      ]
    }
  ],

  /* ------------------------------------------------------------ POTIONS */
  potions: [
    {
      name: 'WALTER PITT',
      kind: 'student',
      zone: 'near',
      lines: [
        'Do not stir it early. He watches for that. He puts it in the book with the green cover.',
        'A boy got a frog last week. The frog is in a jar on that shelf. Nobody asks whose it is.'
      ],
      more: [
        'The frog is still there.',
        'Read the board. Everyone down here forgets there is a board.'
      ]
    },
    {
      name: 'BRIDIE LARCH',
      kind: 'student',
      zone: 'mid',
      lines: [
        'The order is not the order you would guess. I think that is the whole point of the order.',
        'He has never once been pleased. People have gone and looked at the old photographs.'
      ],
      more: [
        'He is looking into your cauldron.',
        'Now he is looking into mine. Carry on as if nothing is happening.'
      ]
    },
    {
      name: 'MATRON HALLAM',
      kind: 'teacher',
      zone: 'mid',
      look: { skin: 3, hair: 6, hairCol: 5, eyes: 4, wear: 5 },
      lines: [
        'I stand here for the whole lesson now. Twice this term I have carried somebody up the stairs.',
        'Cold fingers is the easy one. Wait until you meet the draught that makes you honest.'
      ],
      more: [
        'Still standing here. Do not mind me.',
        'If your hands go white, that is the draught working, not you dying.'
      ]
    },
    {
      name: 'OSBERT BRACK',
      kind: 'student',
      zone: 'far',
      lines: [
        'I copied the board out twice in case the board changes. The board has changed before.',
        'Four wrong and you get the frog. He counts them out loud as he goes.'
      ],
      more: [
        'Three wrong is survivable. He only sighs at three.',
        'Do not drop a jar down here. The floor slopes towards him.'
      ]
    }
  ],

  /* ------------------------------------------------------------ DEFENCE */
  defence: [
    {
      name: 'FENN WREN',
      kind: 'student',
      zone: 'near',
      lines: [
        'The dummies shoot back. He built them himself, over the holidays, because he wanted to.',
        'Block first, then ask. You end up saying it in your sleep.'
      ],
      more: [
        'The one on the end leans a little just before it fires.',
        'Five hits and you are out of the room. He counts those too.'
      ]
    },
    {
      name: 'PROFESSOR TIDDOW',
      kind: 'teacher',
      zone: 'mid',
      look: { skin: 0, hair: 4, hairCol: 5, eyes: 4, wear: 4 },
      lines: [
        'I had this post the year before last. I lasted until spring. I teach numbers now and I sleep at night.',
        'Nobody keeps this job. We all go about hoping that is a coincidence.'
      ],
      more: [
        'I come in to watch most weeks. I could not tell you why I do it.',
        'Shield up before you think you need it. That is the whole lesson and it takes a year.'
      ]
    },
    {
      name: 'DOT MUNN',
      kind: 'student',
      zone: 'mid',
      lines: [
        'I am not hiding. I am standing behind something, which is a different thing.',
        'They go for whoever is moving about. So I have stopped moving about.'
      ],
      more: [
        'Still not moving.',
        'Yours has turned to face you. I thought you would want to know that.'
      ]
    },
    {
      name: 'MR OAKES',
      kind: 'caretaker',
      zone: 'far',
      look: { skin: 5, hair: 5, hairCol: 0, eyes: 0, wear: 4 },
      lines: [
        'Six of them shooting, and I get the scorch marks. New teacher every year, same mop.',
        'The one before last left his coat on that hook. We have left it where it is.'
      ],
      more: [
        'Mind the wet floor. Then mind the dummies.',
        'Nobody has taken the coat down. Nobody is going to.'
      ]
    }
  ],

  /* --------------------------------------------------------- GREENHOUSE */
  green: [
    {
      name: 'HETTY DEVERY',
      kind: 'student',
      zone: 'near',
      lines: [
        'It grew four feet while we were all looking at the nice plants. Four feet, in one lesson.',
        'It does not bite. It takes hold of your arm and leans, which I liked a lot less.'
      ],
      more: [
        'It is nearer than it was a minute ago.',
        'Water made it worse. Cutting made it worse. There is one thing left to try.'
      ]
    },
    {
      name: 'MR LARCH',
      kind: 'caretaker',
      zone: 'mid',
      look: { skin: 2, hair: 7, hairCol: 2, eyes: 1, wear: 3 },
      lines: [
        'I planted that. The label said HARDY. The label did not say what it was hardy about.',
        'Burn it back if you must, but not the benches. The benches are older than this school admits.'
      ],
      more: [
        'Rain on glass all day. You stop hearing it, and then you hear it.',
        'Not the glass. Not the benches. Not me.'
      ]
    },
    {
      name: 'ARTHUR PITT',
      kind: 'student',
      zone: 'mid',
      lines: [
        'Something walked past the glass twice. Big, and on two legs, and in no hurry at all.',
        'She knows what it is. You can tell by how fast she carried on talking.'
      ],
      more: [
        'It has not come back yet.',
        'Three times now. She is still talking.'
      ]
    },
    {
      name: 'COBBE THE TOAD',
      kind: 'creature',
      zone: 'far',
      lines: [
        'Hrrk.',
        'Hrrk. Hrrk.'
      ],
      more: [
        'Brrp.',
        'Hrrk.',
        'Hrrrrk.'
      ]
    }
  ]

};
