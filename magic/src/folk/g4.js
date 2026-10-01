/* ===========================================================================
   folk/g4.js - the cast for the last stretch: two matches, the house on the
   hill, the wolf, the cold one, home for the summer, and the last class.
   Data only. The engine decides where they can stand.
   ========================================================================= */

export default {

  /* --------------------------------- 19 - THE MATCH, AND THE HEAVY ONE -- */
  quid2: [
    {
      name: 'WILF SKEFF',
      kind: 'student',
      zone: 'near',
      lines: [
        'I am a beater. My whole job is knocking the iron ones away from you. I have hit that one twice.',
        'It did not care either time. It came back round the posts and went looking for you again.'
      ],
      more: [
        'Still on you. I checked twice, which was twice too many.',
        'I will swing at it. I will not stop it. Those are two different jobs.'
      ]
    },
    {
      name: 'CAPTAIN ORMEROD',
      kind: 'student',
      zone: 'mid',
      lines: [
        'The plan is this. You catch the gold one, the match ends, the iron one stops. That is all of it.',
        'It is not a good plan. It is the only one that gets you off this pitch today.',
        'Nothing the six of us do up there is going to help you. I am sorry about that.'
      ],
      more: [
        'Everyone in the stands can see it following you. Nobody can do a thing about it.',
        'Keep moving. That is the only sensible word anyone has for today.'
      ]
    },
    {
      name: 'NURSE CROWE',
      kind: 'teacher',
      zone: 'mid',
      look: { wear: 5 },
      lines: [
        'A tent, two beds and a box of bandages. Today I counted the bandages first, which tells you something.',
        'Eleven arms this season. Two ribs. One boy who flew into the flag post on purpose.',
        'If it hits you, come down. Do not be brave at me. I have no patience left for brave.'
      ],
      more: [
        'Breathing. Good. Carry on doing that one.',
        'There is a bed in my tent with your name on a card. I write the card before every match now.'
      ]
    },
    {
      name: 'MR WICK',
      kind: 'caretaker',
      zone: 'far',
      lines: [
        'That crate was locked. It was locked this morning, it is locked now, and I hold the only key.',
        'So somebody got at that ball without opening the box it lives in. I try not to think how.',
        'I have told them. They write it in a book and nothing happens.'
      ],
      more: [
        'Crate is still locked. I keep going back to it and I do not know what I am looking for.',
        'Nine years I have oiled those balls. Not one of them has ever hated anybody before.'
      ]
    }
  ],

  /* ------------------------------------------ 20 - THE MATCH IN THE RAIN - */
  quid3: [
    {
      name: 'ESME CROWE',
      kind: 'student',
      zone: 'near',
      lines: [
        'I count the seconds between the flash and the bang. It is down to two. It was five at the start.',
        'I am keeper. I stand still in front of three hoops in this. Have a think about that for me.'
      ],
      more: [
        'One second now. One. I have stopped counting.',
        'My aunt is the nurse. Her tent is open and the lamp is on. That is not comforting.'
      ]
    },
    {
      name: 'JORY NANCE',
      kind: 'student',
      zone: 'near',
      lines: [
        'Both iron ones are out. I can see one of them. I would dearly love to know where the other is.',
        'I swing where I think it is. That has worked once this season.'
      ],
      more: [
        'One of them I can see. The other is somewhere out in all this.',
        'Rain in my eyes, wind up both sleeves, and something heavy out there in it. Lovely.'
      ]
    },
    {
      name: 'PROFESSOR GALE',
      kind: 'teacher',
      zone: 'mid',
      look: { hairCol: 5, wear: 4 },
      lines: [
        'I have asked for this match to be stopped. I have asked every year since I started asking.',
        'They tell me the weather is a matter for the weather. Then they hand me the tally board.',
        'Stay low if you can. Lightning takes the highest thing it can reach and you are a seeker.'
      ],
      more: [
        'Raining. Going ahead anyway. And here I am under it with the rest of you.',
        'If you hear it close, go lower. That is the whole of the advice.'
      ]
    },
    {
      name: 'OLD BIDDLE',
      kind: 'caretaker',
      zone: 'far',
      lines: [
        'I am mopping a field. In the rain. I was told to mop it, so that is what I am doing.',
        'They do not call it off. A roof came off the stands in my first year and they played on.'
      ],
      more: [
        'Still mopping. Still raining. The two of us are evenly matched.',
        'Mind the far end if you come down. The ground is soft there and it takes a boot off you.'
      ]
    }
  ],

  /* ----------------------------------------- 21 - THE HOUSE ON THE HILL - */
  shack: [
    {
      name: 'MRS HOLLOWAY',
      kind: 'shopkeeper',
      zone: 'near',
      lines: [
        'I keep the shop at the bottom of this hill. Forty years, and I have never once been up it.',
        'Some nights there is screaming from the house. We all agree, out loud, that it is the wind.',
        'You are going up there, then. Well. I shall leave the shop light on.'
      ],
      more: [
        'Still screaming some nights. Still the wind.',
        'Nobody comes down that hill at a walk. They come down it running or not at all.'
      ]
    },
    {
      name: 'MR TRAVIS',
      kind: 'caretaker',
      zone: 'mid',
      lines: [
        'I boarded those windows up myself, years back. Six-inch nails. Every one of them held.',
        'Somebody has taken the boards off the top floor. From the inside.'
      ],
      more: [
        'I am not putting them back on. I have thought it over and the answer is no.',
        'The nails are on the floor up there, bent. You only bend a nail pulling it towards you.'
      ]
    },
    {
      name: 'MRS PENHALE',
      kind: 'ghost',
      zone: 'mid',
      lines: [
        'I have laid four places at the table. Nobody has sat down at it in a very long while.',
        'My husband put the boards up. He said it was the draught. It was not the draught.',
        'Mind the fourth step on the way up. It was always the fourth step.'
      ],
      more: [
        'Four plates. Still four. I keep setting them out.',
        'There are grown men upstairs tonight. I would not go up. You are going up.'
      ]
    },
    {
      name: 'DILLY PYE',
      kind: 'student',
      zone: 'far',
      lines: [
        'I came as far as this tree and this tree is where I am staying. The tree is my entire plan.',
        'Something enormous and black came past at a run and it had hold of a boy by the ankle.'
      ],
      more: [
        'At the tree. The tree has been very good to me and I shall not be leaving it.',
        'If you come out, shout. If something else comes out, I am going home.'
      ]
    }
  ],

  /* ---------------------------------------------------- 22 - THE WOLF --- */
  wolf: [
    {
      name: 'EDDA GALE',
      kind: 'student',
      zone: 'near',
      look: { hair: 7 },
      lines: [
        'I came out for leaves for class. Now I am up a tree, it is dark, and the moon is full.',
        'There is a bird in my hair. It got in there in the dark. It can stay as long as it likes.'
      ],
      more: [
        'Up the tree. The bird and I have come to an understanding.',
        'Something went under this tree on two legs and came back on four. I did not look twice.'
      ]
    },
    {
      name: 'PROFESSOR NANCE',
      kind: 'teacher',
      zone: 'mid',
      lines: [
        'I have walked these grounds on full moons for eleven years. Tonight I brought two lanterns.',
        'There is a thing in that clearing that was a colleague of mine this afternoon.',
        'Hurting it is no use and nobody wants to. Holding it still is the whole of tonight.'
      ],
      more: [
        'Keep the lantern between you and the trees. It does not help. It feels like it helps.',
        'By morning he will be a man on wet grass, and he will apologise. He always apologises.'
      ]
    },
    {
      name: 'BARTY BIDDLE',
      kind: 'caretaker',
      zone: 'mid',
      lines: [
        'I keep a calendar in my shed with the full moons ringed in pencil. I lock up early on those.',
        'Tonight I did not lock up early. Tonight I am stood out here with you, holding a spade.'
      ],
      more: [
        'I have the spade. It is not the right tool. It is the tool I have.',
        'Twelve rings on that calendar a year. I know every one of them off by heart.'
      ]
    },
    {
      name: 'THE BRAMBLE THING',
      kind: 'creature',
      zone: 'far',
      lines: [
        'I only watch. I have always only watched. Do not tell it that I am here.',
        'The big one is not the worst thing in these trees tonight. It is only the loudest.'
      ],
      more: [
        'Still watching. You are still here. Both of those surprise me.',
        'I liked the dog. The dog looked at me once and then let me be.'
      ]
    }
  ],

  /* ------------------------------------------------ 23 - THE COLD ONE --- */
  cold: [
    {
      name: 'GRETA WICK',
      kind: 'student',
      zone: 'near',
      look: { skin: 6, eyes: 4 },
      lines: [
        'I cannot feel my hands. I have been inside twice to warm them and it does not come off.',
        'I threw everything I know at it. It went through like I had not done anything at all.',
        'Then it took the best day I have ever had and made me stand there and watch it go.'
      ],
      more: [
        'Still cold. I think it keeps a bit of you when it goes.',
        'Whatever you do, do not do what I did. I thought of nothing, and nothing came out.'
      ]
    },
    {
      name: 'PROFESSOR SKEFF',
      kind: 'teacher',
      zone: 'mid',
      lines: [
        'The grass goes white where they pass. You can follow them round the grounds by the stripes.',
        'Every lock in the castle is turned and none of it matters. They do not use doors.'
      ],
      more: [
        'There is a hot drink inside and a room with a lamp in it. Go and sit in it afterwards.',
        'Three of them out there. I would very much like it to be two.'
      ]
    },
    {
      name: 'MR PYE',
      kind: 'caretaker',
      zone: 'mid',
      lines: [
        'I have lit these lamps four times tonight. They do not blow out. They go out.',
        'I am going no nearer the lake than this post. This post is where I live now.'
      ],
      more: [
        'Lit them again. Give it a minute.',
        'Out again. I have fetched a chair and I am sitting in it in the dark.'
      ]
    },
    {
      name: 'YOUNG PENHALE',
      kind: 'ghost',
      zone: 'far',
      lines: [
        'They do not come near me. There is nothing left in me for them to take.',
        'I have been on these grounds since before the lake was dug out. I am used to the cold.',
        'You are not used to it. You went grey the moment that one looked at you.'
      ],
      more: [
        'Out here, ignored, as ever. It is restful, mostly.',
        'Think of one good thing and hold on to it. That is what the warm ones always say.'
      ]
    }
  ],

  /* -------------------------------------------- 24 - HOME, AND THE AUNT - */
  home: [
    {
      name: 'UNCLE MARGARINE',
      kind: 'caretaker',
      zone: 'near',
      look: { hair: 5, wear: 3 },
      lines: [
        'No magic in this house. Not one spark. I pay the rates here and I make the rules.',
        'Sit up straight. My sister has come a long way to tell you what she thinks of you.',
        'Something tapped the kitchen window twice last night. It was a bird. I have decided that.'
      ],
      more: [
        'No magic. In this house. Say it back to me.',
        'I have stopped looking out of the windows after dark. It is a habit. It is not fear.'
      ]
    },
    {
      name: 'BRAN MARGARINE',
      kind: 'student',
      zone: 'near',
      look: { hair: 4, hairCol: 3 },
      lines: [
        'Dad says you go to a school for difficult boys. I looked it up. There is no such school.',
        'Can you do the one where things go up? Do not do it. But can you?'
      ],
      more: [
        'I am not scared of you. I am stood here, am I not.',
        'If she goes out of that window, I never saw a thing.'
      ]
    },
    {
      name: 'MRS ORMEROD',
      kind: 'shopkeeper',
      zone: 'mid',
      look: { hair: 6, hairCol: 5 },
      lines: [
        'I am at number eleven. I see everything that happens in this road and most of what does not.',
        'There were owls on your roof in June. Nine of them. In daylight. Not making a sound.'
      ],
      more: [
        'Still watching. Somebody in this road has to.',
        'If anything goes past my window this evening, I shall want it explained to me.'
      ]
    },
    {
      name: 'THE THING UNDER THE SHED',
      kind: 'creature',
      zone: 'far',
      lines: [
        'I followed you home. It is warmer here and nobody in this garden can see me.',
        'The woman at your table has a voice that comes straight through the shed wall.'
      ],
      more: [
        'Under the shed. There is a tin of something down here and I am working on it.',
        'If she comes out into the garden I shall go under the house instead.'
      ]
    }
  ],

  /* --------------------------------------------- 25 - WAND AND BROOM ---- */
  last: [
    {
      name: 'LILA SKEFF',
      kind: 'student',
      zone: 'near',
      lines: [
        'Rings and marks at the same time. Somebody up there has a sense of humour and it is not me.',
        'Then that is the year. I intend to sleep for a week and not look at a single staircase.'
      ],
      more: [
        'You are ahead of me. I am pretending not to mind, and doing it rather well.',
        'Go on then. I will watch from down here and tell everyone I helped.'
      ]
    },
    {
      name: 'PROFESSOR HOLLOWAY',
      kind: 'teacher',
      zone: 'mid',
      lines: [
        'I set this course out at four this morning in the dark, and I kept looking behind me.',
        'There was nothing in the field. I checked eleven times, which is ten times too many.',
        'Fly it well. You have had a year that nobody your age should have had.'
      ],
      more: [
        'Marking out the last of it, and looking behind me. It is a habit now.',
        'September comes whether anyone is ready. Enjoy the quiet bit in between.'
      ]
    },
    {
      name: 'WINNIE TRAVIS',
      kind: 'student',
      zone: 'mid',
      lines: [
        'I am not flying today. I am standing on grass, in the sun, on purpose, with both feet.',
        'The man with no nose is out there somewhere getting his strength back. Not today, though.'
      ],
      more: [
        'Still on the grass. Still both feet.',
        'When you come down there is bread and jam, and nobody is screaming anywhere.'
      ]
    },
    {
      name: 'THE THING IN THE LAKE',
      kind: 'creature',
      zone: 'far',
      lines: [
        'I live in this lake. I am a good deal smaller than the stories, and I would thank you not to say so.',
        'Fly over me if you like. Do not come down to me. That is the whole of the rule.'
      ],
      more: [
        'I have not moved. There is nowhere in a lake to move to.',
        'Something cold came over this water in the spring and went backwards over it. Thank you.'
      ]
    }
  ]

};
