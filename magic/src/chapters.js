/* ===========================================================================
   chapters.js - the year, in order. Each chapter builds a place and hands
   back one of the modes. Nothing here draws anything by hand that world.js,
   foes.js or spells.js can draw for it.
   ========================================================================= */
import * as THREE from '../vendor/three.module.js';
import {
  newWorld, addSky, addGround, addHall, addTorch, addDesks, addBlackboard, addBox,
  buildCastleHall, buildCorridor, buildGrounds, buildForest, buildPitch, buildChamber,
  buildShack, buildHouse, addCauldron, addBookshelf, addPlants, addTrees, addMotes, addMist
} from './world.js';
import { solid, glow, buildAvatar, randomLook, poseIdle, poseWalk } from './avatar.js';
import { mat, tex } from './tex.js';
import {
  buildDarkLord, buildSnake, snakeFollow, buildBookBoy, buildWolf, wolfWalk, buildManWolf,
  buildWraith, buildRat, buildBludger, buildSnitch, flapWings, buildAunt, buildTeacher
} from './foes.js';
import {
  modeTargets, modeSequence, modeRings, modeQuidditch, modeBoss, modeFind, modeStory,
  modeProtect, Hazards, shockwave, updateWaves, label
} from './modes.js';
import { makeTarget, SPELLS } from './spells.js';
import { AU, R, UI, rnd, rndInt, clamp, lerp, damp, TAU, pick, angWrap } from './core.js';
import { mountBroom, dismount, hurt, CAM } from './player.js';

const V = new THREE.Vector3();

/* --------------------------------------------------- a few shared people */
function npc(ctx, look, x, z, ry, name, col) {
  const av = buildAvatar(look, {});
  av.position.set(x, 0, z);
  av.rotation.y = ry || 0;
  ctx.world.group.add(av);
  if (name) label(ctx, av, name, 2.3, col);
  ctx.world.update.push((dt, t) => poseIdle(av, t + x));
  return av;
}
function friendLook() { return { skin: 2, hair: 1, hairCol: 4, eyes: 2, wear: 0, name: 'RUFUS' }; }
function friend2Look() { return { skin: 0, hair: 2, hairCol: 2, eyes: 0, wear: 0, name: 'MINA' }; }

/* who your friend is: the one with the rat */
const FRIEND = 'RUFUS';
const FRIEND2 = 'MINA';

/* ========================================================================= */
export const CHAPTERS = [

/* ----------------------------------------------------------------- 1 --- */
{
  id: 'wand', title: 'THE WAND CHOOSES', music: 'school', amb: 'hall',
  goal: 'Take the wand, then knock over the five straw men',
  spells: ['bolt'], learn: 'bolt',
  text: 'A shop with nine thousand narrow boxes in it, and a man who says the wand picks you, ' +
        'not the other way round. Eight of them do nothing. The ninth sets the curtains on fire. ' +
        'Then he points you at five straw men and tells you to knock them down.',
  after: 'The straw men are on the floor. The curtains are still smoking. You have a wand.',
  setup(ctx) {
    const w = ctx.world;
    addSky(w, 'indoor');
    addHall(w, { w: 18, d: 26, h: 8, columns: false, windows: true, seed: 12, torchCol: 0xffc070 });
    addBookshelf(w, -8, -6, Math.PI / 2, 6);
    addBookshelf(w, 8, -6, -Math.PI / 2, 6);
    addBookshelf(w, -8, 4, Math.PI / 2, 6);
    addMotes(w, 260, [18, 8, 26]);
    // the counter
    const woodM = mat('wood', { size: 256, repeat: [4, 1], roughness: 0.5 });
    const counter = new THREE.Mesh(new THREE.BoxGeometry(6, 1.1, 1.1), woodM);
    counter.position.set(0, 0.55, -9);
    counter.castShadow = counter.receiveShadow = true;
    w.group.add(counter);
    addBox(w, 0, 0.55, -9, 6, 1.1, 1.2);
    // stacks of wand boxes
    for (let i = 0; i < 40; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 1.0),
        solid(pick([0x6b5a3a, 0x7a6a4a, 0x5a4a2a]), 0.95));
      b.position.set(rnd(-8.6, 8.6), 0.6 + Math.floor(i / 8) * 0.14, -11 + rnd(-0.6, 0.6));
      b.castShadow = true;
      w.group.add(b);
    }
    const keeper = npc(ctx, { skin: 0, hair: 5, hairCol: 5, eyes: 4, wear: 5 }, 0, -10.6, 0, 'MR OLLERY');
    w.spawn.set(0, 0, 7);
    w.spawnYaw = Math.PI;

    const targets = modeTargets(ctx, {
      n: 5, kind: 'dummy', spell: 'bolt',
      place: (i) => ({ x: -7 + i * 3.5, y: 0, z: -4.5 }),
      winMsg: 'ALL FIVE DOWN'
    });
    let intro = true;
    ctx.say([
      ['MR OLLERY', 'Eleven inches. Springy. Do not point it at your own face, which I should not have to say, and yet.'],
      ['MR OLLERY', 'Hold it, mean it, and say it like you have already done it. The wand does the rest.'],
      ['MR OLLERY', 'Now. Five straw men. Click the mouse, or the big round button on a telephone. Off you go.']
    ]).then(() => { intro = false; });
    return {
      update(dt) { targets.update(dt); }
    };
  }
},

/* ----------------------------------------------------------------- 2 --- */
{
  id: 'charms', title: 'CHARMS', music: 'school', amb: 'hall',
  goal: 'Lift all nine feathers off the desks',
  learn: 'lift', spells: ['bolt', 'lift'],
  text: 'A very small teacher standing on a very large pile of books. Today: picking things up ' +
        'without touching them. It is the swish that people get wrong, he says, and then someone ' +
        'sets fire to a feather, which is a different mistake entirely.',
  after: 'Nine feathers on the ceiling. Two of them are still up there.',
  setup(ctx) {
    const w = ctx.world;
    addSky(w, 'indoor');
    addHall(w, { w: 20, d: 28, h: 9, seed: 19, windowCol: 0x3a5a9a, windowGlow: 0.9 });
    addDesks(w, { rows: 3, cols: 3, z0: 0 });
    addBlackboard(w, -13.6, 'SWISH,\nAND FLICK');
    addBookshelf(w, -9.2, 6, Math.PI / 2, 5);
    addMotes(w, 200, [20, 9, 28]);
    const books = new THREE.Group();
    for (let i = 0; i < 9; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.7), solid(pick([0x6b2020, 0x1d4a2a, 0x203a6b]), 0.9));
      b.position.set(0, 0.06 + i * 0.12, 0);
      books.add(b);
    }
    books.position.set(0, 0, -11);
    w.group.add(books);
    const prof = npc(ctx, { skin: 1, hair: 6, hairCol: 5, eyes: 1, wear: 2 }, 0, -11, 0, 'PROFESSOR TWITT');
    prof.position.y = 1.08;
    prof.scale.setScalar(0.78);
    w.spawn.set(0, 0, 10);
    w.spawnYaw = Math.PI;

    const m = modeTargets(ctx, {
      n: 9, kind: 'feather', spell: 'lift', r: 0.8, float: true, moving: 0,
      place: (i) => ({ x: (i % 3 - 1) * 2.6, y: 0.9, z: Math.floor(i / 3) * 3.1 + 2 }),
      onHit: (obj) => {
        // it goes up, and stays up
        const start = obj.position.y;
        let t = 0;
        ctx.world.update.push((dt) => { t += dt; obj.visible = true; obj.position.y = start + Math.min(6, t * 2.2); obj.rotation.y += dt; });
      },
      vanish: false,
      winMsg: 'ALL NINE UP'
    });
    ctx.say([
      ['PROFESSOR TWITT', 'Wands out! Now, the swish and flick. Swish. And flick. Not stab. You, at the back. Not stab.'],
      ['PROFESSOR TWITT', 'Pick LIFT on the bar at the bottom, or press 2, and lift every feather in this room.']
    ]);
    return Object.assign({}, m, { update: (dt) => m.update(dt) });
  }
},

/* ----------------------------------------------------------------- 3 --- */
{
  id: 'stairs', title: 'THE DARK STAIRS', music: 'dark', amb: 'hall',
  goal: 'Light the wand and find the three lost keys',
  learn: 'light', spells: ['bolt', 'lift', 'light'], light: false,
  text: 'The staircases move. Everybody says this like it is a charming local custom and not a ' +
        'thing that could kill you. Tonight the lamps are out, three keys are somewhere on the ' +
        'landing, and the only light in the school is the one you have not learned yet.',
  after: 'Three keys, one of them in a suit of armour’s helmet. Nobody will say who put it there.',
  setup(ctx) {
    const w = ctx.world;
    buildCorridor(w, { length: 70, torchCol: 0x2a3a5a });
    // kill most of the torch light: it is meant to be dark
    w.group.traverse((o) => { if (o.isPointLight) o.intensity *= 0.12; });
    if (w.sun) w.sun.intensity = 0.05;
    w.fog.near = 3; w.fog.far = 26;
    addMotes(w, 260, [8, 6, 70], 0x8fa8d8);
    const m = modeFind(ctx, {
      spots: [{ x: -2.4, y: 0.6, z: -18 }, { x: 2.6, y: 0.6, z: 6 }, { x: 0.4, y: 0.6, z: -30 }],
      hidden: true, warmRange: 7, pickRange: 2.4, need: 3,
      make: (s) => {
        const g = new THREE.Group();
        const k = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 7, 16), solid(0xd9ac2e, 0.3, 0.9));
        g.add(k);
        const sh = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.42, 0.05), solid(0xd9ac2e, 0.3, 0.9));
        sh.position.y = -0.28; g.add(sh);
        const bit = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.05), solid(0xd9ac2e, 0.3, 0.9));
        bit.position.set(0.07, -0.44, 0); g.add(bit);
        const l = new THREE.PointLight(0xffd070, 3, 6, 2);
        g.add(l);
        g.position.set(s.x, s.y, s.z);
        ctx.world.group.add(g);
        return g;
      },
      winMsg: 'ALL THREE KEYS'
    });
    // the wand light actually reveals: keys within the lit radius show up
    let said = false;
    ctx.say([
      [FRIEND, 'I cannot see my own hands. Can you see your hands?'],
      [FRIEND, 'Point the wand and say it. LIGHT. It is the first one everyone learns and the one everyone forgets.']
    ]);
    return {
      solveNext: m.solveNext,
      update(dt) {
        m.update(dt);
        const lit = ctx.caster.lightOn;
        if (!lit && !said && ctx.t > 6) { said = true; UI.toast('PRESS 3 FOR LIGHT', 2); }
        m.spots.forEach((sp) => {
          if (sp.found) return;
          const d = ctx.player.pos.distanceTo(sp.g.position);
          if (lit && d < 11) sp.g.visible = true;
        });
      }
    };
  }
},

/* ----------------------------------------------------------------- 4 --- */
{
  id: 'potions', title: 'POTIONS', music: 'dark', amb: 'cave',
  goal: 'Put the six things in the cauldron IN ORDER',
  learn: 'freeze', spells: ['bolt', 'lift', 'light', 'freeze'],
  text: 'Down in the cold part of the castle, a man who has never once been pleased explains that ' +
        'there will be no silly wand-waving in his classroom, and then sets you an order of ' +
        'operations where getting it wrong turns the whole thing into a frog.',
  after: 'The draught went the right blue. He wrote something in a book and did not say what.',
  setup(ctx) {
    const w = ctx.world;
    addSky(w, 'indoor');
    addHall(w, { w: 20, d: 24, h: 7, windows: false, seed: 41, dark: [30, 32, 38], light: [70, 74, 82], torchCol: 0x6fd0a8 });
    w.fog.near = 5; w.fog.far = 34;
    addDesks(w, { rows: 2, cols: 3, z0: 1 });
    addBlackboard(w, -11.6, 'THE DRAUGHT OF\nCOLD FINGERS');
    addBookshelf(w, -9.2, 5, Math.PI / 2, 5);
    addBookshelf(w, 9.2, 5, -Math.PI / 2, 5);
    const big = addCauldron(w, 0, -8, 0x3f6fbf);
    addMotes(w, 200, [20, 7, 24], 0x8fffd0);
    const prof = npc(ctx, { skin: 0, hair: 2, hairCol: 0, eyes: 4, wear: 4 }, 3.4, -9.4, 0.4, 'PROFESSOR GRIM');
    w.spawn.set(0, 0, 8);
    w.spawnYaw = Math.PI;

    const ING = [
      { n: 'SNAIL', col: 0x8a7a5a }, { n: 'MOONWORT', col: 0x6fd0a8 }, { n: 'IRON FILINGS', col: 0x8a8f96 },
      { n: 'NEWT EYE', col: 0xc0a03a }, { n: 'FROST BEETLE', col: 0x9fe8ff }, { n: 'ONE HAIR', col: 0x3a2a1a }
    ];
    const order = [1, 4, 0, 3, 2, 5];   // the recipe on the board, which nobody reads
    const m = modeSequence(ctx, {
      items: ING,
      order,
      r: 0.85,
      goalFor: (s) => s < order.length ? 'Next: ' + ING[order[s]].n : 'Stir it',
      maxMistakes: 4,
      make: (it, i) => {
        const g = new THREE.Group();
        const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.2, 0.42, 14),
          new THREE.MeshStandardMaterial({ color: 0xcfe0dc, roughness: 0.1, metalness: 0.05, transparent: true, opacity: 0.55 }));
        jar.position.y = 0.21; g.add(jar);
        const stuff = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.17, 0.26, 12), glow(it.col, 0.6));
        stuff.position.y = 0.15; g.add(stuff);
        const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.05, 14), solid(0x8a6a3a, 0.8));
        lid.position.y = 0.44; g.add(lid);
        const mk = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 8), glow(0xffe9a8, 2));
        mk.position.y = 1.0; mk.rotation.x = Math.PI;
        g.add(mk);
        g.userData.marker = mk;
        g.position.set(-5 + i * 2, 0.9, -3.2);
        g.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
        ctx.world.group.add(g);
        label(ctx, g, it.n, 1.35, '#cfe0dc');
        return g;
      },
      onStep: (step, g) => {
        g.visible = false;
        const col = ING[order[step - 1]].col;
        big.userData.brew.material.color.setHex(col);
        big.userData.light.color.setHex(col);
        ctx.caster.fx.burst(new THREE.Vector3(0, 1.1, -8), col, 26, 4, 0.09);
        AU.sfx('lift');
      },
      onWrong: () => {
        big.userData.brew.material.color.setHex(0x6b8a2a);
        AU.sfx('bad');
        shockwave(ctx, new THREE.Vector3(0, 0, -8), { col: 0x8aff5a, max: 9, dmg: 0 });
      },
      winMsg: 'THE RIGHT BLUE',
      loseMsg: 'It has turned into a frog. An actual frog.'
    });
    ctx.say([
      ['PROFESSOR GRIM', 'There will be no foolish wand-waving in here. There will be an order, and you will follow it.'],
      ['PROFESSOR GRIM', 'Moonwort. Frost beetle. Snail. Newt eye. Iron filings. One hair. In that order, or you get a frog.'],
      ['PROFESSOR GRIM', 'The glowing arrow is for people who were not listening. It is above the next one.']
    ]);
    return Object.assign({}, m, { update: (dt) => m.update(dt) });
  }
},

/* ----------------------------------------------------------------- 5 --- */
{
  id: 'defence', title: 'DEFENCE', music: 'dark', amb: 'hall', hp: 5,
  goal: 'Shield the bolts, then knock down the six that are shooting back',
  learn: 'shield', spells: ['bolt', 'lift', 'light', 'freeze', 'shield'],
  text: 'The subject with a new teacher every single year, which everybody mentions and nobody ' +
        'explains. This one has set up six enchanted dummies that shoot back, and a rule: you may ' +
        'not be hit five times.',
  after: 'Six dummies down, and you only took two. He wrote NOT BAD on the board and left.',
  setup(ctx) {
    const w = ctx.world;
    addSky(w, 'indoor');
    addHall(w, { w: 24, d: 32, h: 10, seed: 23, torchCol: 0xff9a5a });
    addBlackboard(w, -15.6, 'BLOCK FIRST.\nTHEN ASK.');
    addMotes(w, 180, [24, 10, 32]);
    const prof = npc(ctx, { skin: 3, hair: 0, hairCol: 1, eyes: 5, wear: 3 }, -8, 8, -0.5, 'PROFESSOR QUILL');
    w.spawn.set(0, 0, 11);
    w.spawnYaw = Math.PI;
    const haz = new Hazards(ctx);
    ctx.hazards = haz;
    const m = modeTargets(ctx, {
      n: 6, kind: 'dummy', spell: 'bolt', r: 1.0, moving: 0.8, range: 2.4,
      place: (i) => ({ x: -9 + i * 3.6, y: 0, z: -7 - (i % 2) * 3 }),
      winMsg: 'ALL SIX DOWN',
      loseMsg: 'They got you first.'
    });
    let fireT = 2.2;
    ctx.say([
      ['PROFESSOR QUILL', 'Rule one: the shield goes up before the trouble arrives, not after.'],
      ['PROFESSOR QUILL', 'Press 5 for SHIELD. It lasts three seconds. Then knock them all down.']
    ]);
    return {
      update(dt) {
        m.update(dt);
        haz.update(dt);
        fireT -= dt;
        if (fireT <= 0) {
          const alive = ctx.targets.filter((t) => t.tag === 'target' && !t.hit);
          fireT = clamp(2.6 - (6 - alive.length) * 0.15, 1.0, 2.6);
          if (alive.length) {
            const t = pick(alive);
            const from = t.obj.position.clone().setY(1.5);
            const dir = ctx.player.pos.clone().setY(1.0).sub(from).normalize();
            haz.fire(from, dir, { speed: 11, col: 0xff6a5a, dmg: 1, r: 0.2 });
          }
        }
        if (ctx.player.hp <= 0) ctx.lose('Five hits. He is writing it down.');
      }
    };
  }
},

/* ----------------------------------------------------------------- 6 --- */
{
  id: 'green', title: 'THE GREENHOUSE', music: 'school', amb: 'forest', hp: 5,
  goal: 'Burn back the creeping vine before it reaches the door',
  learn: 'fire', spells: ['bolt', 'lift', 'light', 'freeze', 'shield', 'fire'],
  text: 'Plants, in a glass house, in the rain. Most of them are fine. One of them is a creeper ' +
        'that grew four feet while everyone was looking at the fine ones, and it is now between ' +
        'you and the door.',
  after: 'The vine is a pile of ash and the greenhouse smells like a bonfire. Nobody lost a hand.',
  setup(ctx) {
    const w = ctx.world;
    addSky(w, 'dawn');
    addGround(w, 'dirt', 70);
    // glass house
    const glass = new THREE.MeshStandardMaterial({
      color: 0xbfe0d8, roughness: 0.06, metalness: 0.1, transparent: true, opacity: 0.22, side: THREE.DoubleSide
    });
    const frame = solid(0x3a4a3a, 0.7, 0.4);
    const W = 22, D = 26, H = 7;
    [[0, -D / 2, 0], [0, D / 2, Math.PI]].forEach(([x, z, ry]) => {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(W, H), glass);
      p.position.set(x, H / 2, z); p.rotation.y = ry; w.group.add(p);
    });
    [[-W / 2, Math.PI / 2], [W / 2, -Math.PI / 2]].forEach(([x, ry]) => {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(D, H), glass);
      p.position.set(x, H / 2, 0); p.rotation.y = ry; w.group.add(p);
    });
    const roof = new THREE.Mesh(new THREE.PlaneGeometry(W, D), glass);
    roof.rotation.x = Math.PI / 2; roof.position.y = H; w.group.add(roof);
    addBox(w, 0, H / 2, -D / 2 - 0.4, W, H, 1);
    addBox(w, 0, H / 2, D / 2 + 0.4, W, H, 1);
    addBox(w, -W / 2 - 0.4, H / 2, 0, 1, H, D);
    addBox(w, W / 2 + 0.4, H / 2, 0, 1, H, D);
    for (let i = -3; i <= 3; i++) {
      w.group.add(new THREE.Mesh(new THREE.BoxGeometry(0.12, H, 0.12), frame).translateX(i * 3.4).translateY(H / 2).translateZ(-D / 2));
      w.group.add(new THREE.Mesh(new THREE.BoxGeometry(0.12, H, 0.12), frame).translateX(i * 3.4).translateY(H / 2).translateZ(D / 2));
    }
    // benches of pots
    const woodM = mat('wood', { size: 256, repeat: [6, 1], roughness: 0.9 });
    [-6, 6].forEach((x) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(3, 0.12, 20), woodM);
      b.position.set(x, 0.9, 0); b.castShadow = b.receiveShadow = true;
      w.group.add(b);
      addBox(w, x, 0.44, 0, 3, 0.88, 20);   // waist high: you can shoot over it
    });
    addPlants(w, 26, 9);
    const prof = npc(ctx, { skin: 2, hair: 3, hairCol: 3, eyes: 2, wear: 3 }, 0, -10, 0, 'PROFESSOR SPROUT-ISH');
    w.spawn.set(0, 0, 10);
    w.spawnYaw = Math.PI;

    /* the vine: a row of segments that creeps towards the door */
    const vine = [];
    const vmat = solid(0x2a5a28, 1);
    for (let i = 0; i < 9; i++) {
      const g = new THREE.Group();
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.42, 1.8, 10), vmat);
      s.position.y = 0.9; g.add(s);
      for (let k = 0; k < 4; k++) {
        const l = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.7, 6), solid(0x1d4a1c, 1));
        const a = (k / 4) * TAU;
        l.position.set(Math.cos(a) * 0.3, 1.2, Math.sin(a) * 0.3);
        l.rotation.set(Math.cos(a) * 0.8, 0, -Math.sin(a) * 0.8);
        g.add(l);
      }
      g.position.set(-4.4 + i * 1.1, 0, -8 - (i % 3));   // it comes up the middle aisle
      g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      w.group.add(g);
      vine.push({ g, alive: true, base: g.position.clone() });
    }
    let reach = 0;
    vine.forEach((v, i) => {
      ctx.targets.push({
        obj: v.g, r: 1.1, h: 1.8, tag: 'vine',
        onHit: (spellId) => {
          if (spellId !== 'fire') { UI.toast('IT LIKES THAT', 1); return; }
          if (!v.alive) return;
          v.alive = false; v.g.visible = false;
          AU.sfx('good');
          ctx.caster.fx.burst(v.g.position.clone().setY(1), 0xff8a2a, 30, 5, 0.11);
          if (vine.every((q) => !q.alive)) ctx.win('BURNED BACK');
        }
      });
    });
    ctx.say([
      ['PROFESSOR SPROUT-ISH', 'Do not let it touch you. It is not poisonous, it is just very strong and extremely rude.'],
      ['PROFESSOR SPROUT-ISH', 'Fire. Press 6. It hates fire the way you hate being grabbed by a plant.']
    ]);
    return {
      solveNext() {
        const v = vine.find((q) => q.alive);
        return v ? { pos: v.g.position.clone().setY(1.2), spell: 'fire', dist: 4.5 } : null;
      },
      update(dt) {
        reach += dt * 0.55;
        let living = 0;
        vine.forEach((v, i) => {
          if (!v.alive) return;
          living++;
          v.g.position.z = v.base.z + reach * 1.5;
          v.g.rotation.z = Math.sin(R.elapsed * 2 + i) * 0.14;
          const d = v.g.position.distanceTo(ctx.player.pos);
          if (d < 1.6 && hurt(ctx.player, 1)) { UI.hurt(); AU.sfx('hurt'); }
        });
        ctx.tally('VINE <b>' + living + '</b> LEFT &middot; ' + '♥'.repeat(Math.max(0, ctx.player.hp)));
        if (vine.some((v) => v.alive && v.g.position.z > 11)) ctx.lose('It got to the door first.');
        if (ctx.player.hp <= 0) ctx.lose('It picked you up by the ankle.');
      }
    };
  }
},

/* ----------------------------------------------------------------- 7 --- */
{
  id: 'flying', title: 'FLYING LESSON', music: 'flight', amb: 'wind',
  goal: 'Through all twelve rings before the whistle',
  gives: 'broom', fly: true,
  flyOpts: { bounds: 100, ceil: 45, floor: 1.5, cruise: 14, maxSpeed: 30 },
  text: 'Everybody puts a hand over their broom and says UP. Yours comes up so fast it hits you in ' +
        'the chin. Then twelve hoops over the lawn, and a teacher with a whistle who has never ' +
        'once used it kindly.',
  after: 'Twelve rings. You are not walking anywhere ever again.',
  setup(ctx) {
    const w = ctx.world;
    buildGrounds(w, { sky: 'dawn', trees: 26 });
    w.spawn.set(0, 6, 30);
    const gates = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU * 1.4;
      gates.push([Math.sin(a) * (28 + i * 2.2), 6 + Math.sin(i * 1.3) * 5 + i * 0.7, -Math.cos(a) * (28 + i * 2.2) + 10, a]);
    }
    const m = modeRings(ctx, { gates, radius: 3.6, time: 105, winMsg: 'ALL TWELVE', loseMsg: 'The whistle went.' });
    ctx.say([
      ['MADAM HOOP', 'Hand over the broom. Say UP. If it does not come up, you are being polite at it.'],
      ['MADAM HOOP', 'Push forward to go faster, look where you want to go, and do not aim at the lake.']
    ]);
    return Object.assign({}, m, {
      update(dt) {
        m.update(dt);
        const nx = m.nextPos();
        if (nx) {
          const d = ctx.player.pos.distanceTo(nx);
          ctx.goal('Next ring: ' + Math.round(d) + 'm');
        }
      }
    });
  }
},

/* ----------------------------------------------------------------- 8 --- */
{
  id: 'quid1', title: 'YOUR FIRST QUITTICH', music: 'flight', amb: 'crowd', hp: 4,
  goal: 'Catch the little gold one',
  fly: true, flyOpts: { bounds: 58, ceil: 36, floor: 1.5, cruise: 15, maxSpeed: 32 },
  text: 'Seven a side. Three chasers throwing the red one at three hoops, two beaters swinging at ' +
        'two iron ones, a keeper, and you, the seeker, whose entire job is to catch a walnut with ' +
        'wings that is faster than you and does not want to be caught. Catching it ends the match ' +
        'and is worth a hundred and fifty.',
  after: 'You caught it in your teeth. Nobody is sure whether that counts. It counted.',
  setup(ctx) {
    const w = ctx.world;
    buildPitch(w, { sky: 'day' });
    w.spawn.set(0, 12, 40);
    const m = modeQuidditch(ctx, {
      bludgers: 1, catches: 1, time: 150, snitchSpeed: 15, bludgerSpeed: 10,
      winMsg: 'CAUGHT IT · 150 POINTS', loseMsg: 'The match ended without you.'
    });
    ctx.say([
      [FRIEND, 'You are seeker. Seeker is the one that matters, which is a lovely thing to tell someone who has flown once.'],
      [FRIEND, 'Find the little gold one. Do not look at the big iron one. It is behind you.']
    ]);
    return Object.assign({}, m, { update: (dt) => m.update(dt) });
  }
},

/* ----------------------------------------------------------------- 9 --- */
{
  id: 'hunt', title: 'WHERE IS HE?', music: 'dark', amb: 'hall',
  goal: 'Find the three marks, then the door at the end',
  spells: ['bolt', 'lift', 'light', 'freeze', 'shield', 'fire'],
  text: 'A three-headed dog on the third floor. A trapdoor under it. A name nobody says out loud, ' +
        'and a teacher with a stutter who is not the problem. Somebody in this castle is helping ' +
        'him, and there is a mark on the wall where they have been.',
  after: 'Three marks, and a door that was locked from the inside. He is down there.',
  setup(ctx) {
    const w = ctx.world;
    buildCorridor(w, { length: 76, torchCol: 0x5a7aa0 });
    w.group.traverse((o) => { if (o.isPointLight) o.intensity *= 0.3; });
    w.fog.near = 5; w.fog.far = 34;
    addMotes(w, 200, [8, 6, 76], 0x8fa8d8);
    // the door at the far end
    const door = new THREE.Mesh(new THREE.BoxGeometry(3, 4.6, 0.3), mat('wood', { size: 256, repeat: [2, 3], roughness: 0.7 }));
    door.position.set(0, 2.3, -37.4);
    door.castShadow = true;
    w.group.add(door);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.05, 8, 18), solid(0x8a7a4a, 0.4, 0.8));
    ring.position.set(0.7, 2.2, -37.2);
    w.group.add(ring);
    let doorOpen = false;
    const m = modeFind(ctx, {
      spots: [{ x: -3.4, y: 2.2, z: 12 }, { x: 3.4, y: 2.2, z: -6 }, { x: -3.4, y: 2.2, z: -22 }],
      need: 3, hidden: true, warmRange: 8, pickRange: 4.2,
      make: (s) => {
        const g = new THREE.Group();
        const cv = document.createElement('canvas'); cv.width = cv.height = 256;
        const x = cv.getContext('2d');
        x.strokeStyle = '#7dff9f'; x.lineWidth = 12; x.lineCap = 'round';
        x.beginPath(); x.moveTo(40, 40); x.lineTo(216, 216); x.moveTo(216, 40); x.lineTo(40, 216); x.stroke();
        x.beginPath(); x.arc(128, 128, 96, 0, 7); x.stroke();
        const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
        const mk = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2),
          new THREE.MeshBasicMaterial({ map: t, transparent: true, fog: false }));
        mk.rotation.y = s.x < 0 ? Math.PI / 2 : -Math.PI / 2;
        g.add(mk);
        const l = new THREE.PointLight(0x5fff9f, 3, 7, 2);
        g.add(l);
        g.position.set(s.x, s.y, s.z);
        ctx.world.group.add(g);
        return g;
      },
      onFind: (sp, n) => {
        UI.toast(['A HANDPRINT', 'A BURNED PATCH', 'THE SAME MARK AGAIN'][n - 1] || 'ANOTHER', 2);
        if (n >= 3) {
          doorOpen = true;
          ctx.goal('The door at the end is open now');
        }
      },
      need: 3,
      winMsg: ''
    });
    let won = false;
    ctx.say([
      [FRIEND2, 'Three marks. Same shape each time, and each one closer to the locked door at the end.'],
      [FRIEND2, 'Light the wand. Whatever left them was not carrying a lamp.']
    ]);
    return {
      solveNext() {
        const a = m.solveNext();
        if (a) return a;
        return doorOpen ? { goto: new THREE.Vector3(0, 0, -36.5) } : null;
      },
      update(dt) {
        m.update(dt);
        const found = m.spots.filter((s) => s.found).length;
        ctx.tally('<b>' + found + '</b> / 3 marks' + (doorOpen ? ' &middot; THE DOOR' : ''));
        m.spots.forEach((sp) => {
          if (!sp.found && ctx.caster.lightOn && ctx.player.pos.distanceTo(sp.g.position) < 13) sp.g.visible = true;
        });
        if (doorOpen) {
          door.rotation.y = damp(door.rotation.y, -1.1, 2, dt);
          door.position.x = damp(door.position.x, -1.3, 2, dt);
          if (!won && ctx.player.pos.z < -35) { won = true; ctx.win('DOWN THERE'); }
        }
      }
    };
  }
},

/* ---------------------------------------------------------------- 10 --- */
{
  id: 'lord', title: 'THE MAN WITH NO NOSE', music: 'dark', amb: 'cave', hp: 6,
  goal: 'He is only open when his guard drops. Wait for it.',
  spells: ['bolt', 'lift', 'light', 'freeze', 'shield', 'fire'],
  text: 'Under the trapdoor, past the chess, in a round room with a mirror in it, is the thing ' +
        'everyone has been not-saying for a hundred pages. He is thinner than you expected and ' +
        'much worse. He blocks everything you throw. He cannot block while he is casting.',
  after: 'He came apart like smoke and went out through the ceiling. That is not the same as dead, ' +
         'and everybody in the room knew it.',
  setup(ctx) {
    const w = ctx.world;
    addSky(w, 'cave');
    // a round chamber
    const stoneM = mat('stone', { size: 512, repeat: [8, 4], seed: 71, dark: [30, 26, 34], light: [72, 64, 76], bumpScale: 0.6 });
    const fl = new THREE.Mesh(new THREE.CircleGeometry(22, 40), mat('flag', { size: 512, repeat: [7, 7], seed: 72 }));
    fl.rotation.x = -Math.PI / 2; fl.receiveShadow = true;
    w.group.add(fl);
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(22, 22, 16, 44, 1, true), stoneM);
    wall.position.y = 8; wall.material.side = THREE.BackSide;
    w.group.add(wall);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      addBox(w, Math.cos(a) * 23.5, 8, Math.sin(a) * 23.5, 6, 16, 6);
      if (i % 2 === 0) addTorch(w, Math.cos(a) * 21, 4.5, Math.sin(a) * 21, 0x6fd0a8);
    }
    w.fog.near = 6; w.fog.far = 46;
    // the mirror
    const mirror = new THREE.Group();
    const glassM = new THREE.MeshStandardMaterial({ color: 0x2a3444, roughness: 0.05, metalness: 1, emissive: 0x16202e, emissiveIntensity: 0.6 });
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 6.4), glassM);
    gl.position.y = 3.6; mirror.add(gl);
    const fr = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.22, 10, 30), solid(0xc9a227, 0.3, 0.9));
    fr.position.y = 3.6; fr.scale.set(0.78, 1.25, 1); mirror.add(fr);
    mirror.position.set(0, 0, -16);
    mirror.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    w.group.add(mirror);
    addMist(w, 40, 20);
    w.spawn.set(0, 0, 13);
    w.spawnYaw = Math.PI;

    const m = modeBoss(ctx, {
      name: 'HE', hp: 7, r: 1.7, h: 2.4, window: 4.2, openFor: 2.8, firstWindow: 3.5,
      openMsg: 'HIS GUARD IS DOWN',
      guardHint: 'HE IS BLOCKING IT',
      winMsg: 'HE CAME APART',
      loseMsg: 'He was always going to be too fast for a first year.',
      build: (c) => {
        const obj = buildDarkLord();
        obj.position.set(0, 0, -11);
        c.world.group.add(obj);
        return { obj, glow: [obj.userData.head.children[1], obj.userData.head.children[2]] };
      },
      behave: (boss, c, dt, t, haz) => {
        const p = c.player;
        const o = boss.obj;
        // he circles and keeps his distance
        const to = Math.atan2(p.pos.x - o.position.x, p.pos.z - o.position.z);
        o.rotation.y = angWrap(o.rotation.y + angWrap(to - o.rotation.y) * clamp(dt * 3, 0, 1));
        const d = o.position.distanceTo(p.pos);
        const want = boss.open ? 9 : 7;
        const dir = V.copy(p.pos).sub(o.position).setY(0).normalize();
        const strafe = new THREE.Vector3(-dir.z, 0, dir.x);
        const sp = (boss.stagger > 0 ? 0.6 : 3.4) * (1 + boss.phase * 0.35);
        o.position.addScaledVector(dir, (d - want) * dt * 1.4);
        o.position.addScaledVector(strafe, Math.sin(t * 0.7) * sp * dt);
        o.position.y = Math.sin(t * 1.2) * 0.12;
        const r = Math.hypot(o.position.x, o.position.z);
        if (r > 18) { o.position.x *= 18 / r; o.position.z *= 18 / r; }
        // he only fires while guarding; that is the deal
        boss.fireT = (boss.fireT || 1.4) - dt;
        if (boss.fireT <= 0 && !boss.open) {
          boss.fireT = clamp(1.9 - boss.phase * 0.45, 0.7, 2);
          const from = o.position.clone().setY(1.5);
          const aim = p.pos.clone().setY(1.0).sub(from).normalize();
          if (boss.phase >= 1) {
            for (let k = -1; k <= 1; k++) {
              const a = aim.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), k * 0.2);
              haz.fire(from, a, { speed: 15, col: 0x8fff6a, dmg: 1, r: 0.22 });
            }
          } else haz.fire(from, aim, { speed: 14, col: 0x8fff6a, dmg: 1, r: 0.22 });
          AU.sfx('zap');
        }
        if (boss.phase === 2) {
          boss.slamT = (boss.slamT || 6) - dt;
          if (boss.slamT <= 0) {
            boss.slamT = 7;
            shockwave(c, o.position.clone(), { col: 0x8fff6a, max: 22, speed: 15, dmg: 1 });
            UI.toast('JUMP', 1.0);
          }
        }
      },
      onPhase: (boss, ph, c) => {
        if (ph === 1) c.toast('HE IS ANGRY NOW', 1.6);
        if (ph === 2) { c.toast('HE IS NOT PLAYING', 1.8); AU.sfx('ghost'); }
      },
      onDeath: (boss, c) => {
        c.caster.fx.burst(boss.obj.position.clone().setY(1.6), 0x8fff6a, 70, 9, 0.14);
        UI.flash(900);
        let t = 0;
        c.world.update.push((dt) => {
          t += dt;
          boss.obj.position.y = t * 3;
          boss.obj.scale.setScalar(Math.max(0.01, 1 - t * 0.5));
          boss.obj.rotation.y += dt * 6;
        });
      }
    });
    ctx.say([
      ['HE', 'A first year. They sent a first year.'],
      ['HE', 'You may as well throw things at a wall. I am the wall.'],
      [FRIEND, 'He cannot block and cast at the same time! When he winds up, hit him THEN!']
    ]);
    return m;
  }
},

/* ---------------------------------------------------------------- 11 --- */
{
  id: 'transfig', title: 'TRANSFIGURATION', music: 'school', amb: 'hall',
  goal: 'Turn all eight of them into something else',
  learn: 'change',
  text: 'A teacher who was a cat when you walked in and was not, by the time you sat down. ' +
        'Changing one thing into another thing is the hardest branch of magic in the school and ' +
        'she says so in a way that suggests she is looking forward to most of you failing.',
  after: 'Eight teacups, none of them leaking. One of them still has whiskers.',
  setup(ctx) {
    const w = ctx.world;
    addSky(w, 'indoor');
    addHall(w, { w: 22, d: 30, h: 10, seed: 29, windowCol: 0x4a6aa0, windowGlow: 1.1 });
    addDesks(w, { rows: 3, cols: 4, z0: 1 });
    addBlackboard(w, -14.6, 'A THING IS ONLY\nA THING UNTIL\nYOU DISAGREE');
    addMotes(w, 200, [22, 10, 30]);
    npc(ctx, { skin: 0, hair: 6, hairCol: 5, eyes: 4, wear: 2 }, 0, -12, 0, 'PROFESSOR MYNN');
    w.spawn.set(0, 0, 11);
    w.spawnYaw = Math.PI;
    const cups = [];
    const m = modeTargets(ctx, {
      n: 8, kind: 'crate', spell: 'change', r: 0.8, vanish: false,
      place: (i) => ({ x: (i % 4 - 1.5) * 2.6, y: 0.85, z: Math.floor(i / 4) * 3.1 + 1 }),
      onHit: (obj) => {
        obj.clear();
        const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.14, 0.24, 16), solid(0xf0ece0, 0.25));
        cup.position.y = 0.12;
        obj.add(cup);
        const handle = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.022, 6, 14), solid(0xf0ece0, 0.25));
        handle.position.set(0.22, 0.14, 0); handle.rotation.y = Math.PI / 2;
        obj.add(handle);
        const tea = new THREE.Mesh(new THREE.CircleGeometry(0.17, 16), solid(0x6b3a1a, 0.3));
        tea.rotation.x = -Math.PI / 2; tea.position.y = 0.2;
        obj.add(tea);
        if (Math.random() < 0.3) {
          for (let k = 0; k < 3; k++) {
            const wk = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.2, 4), solid(0x2a2a2a, 0.8));
            wk.position.set(0, 0.1, 0.16); wk.rotation.z = Math.PI / 2 + (k - 1) * 0.3;
            obj.add(wk);
          }
        }
        obj.traverse((o) => { if (o.isMesh) o.castShadow = true; });
        cups.push(obj);
      },
      winMsg: 'EIGHT TEACUPS'
    });
    ctx.say([
      ['PROFESSOR MYNN', 'Anyone messing about in my class will leave and not come back. That is not a threat, it is a timetable.'],
      ['PROFESSOR MYNN', 'CHANGE. Press the new one on the bar. A box, into a teacup. Eight of them. Begin.']
    ]);
    return Object.assign({}, m, { update: (dt) => m.update(dt) });
  }
},

/* ---------------------------------------------------------------- 12 --- */
{
  id: 'duel', title: 'THE DUELLING CLUB', music: 'dark', amb: 'hall', hp: 6,
  goal: 'Mend what he breaks, and push him off the end of the stage',
  learn: 'blast',
  text: 'They put a long stage down the middle of the hall and let two students point wands at ' +
        'each other, which goes exactly the way you would expect. Your opponent is smug, quick, ' +
        'and about to learn what a push looks like.',
  after: 'He went off the end of the stage and into the cauldron of the year below. New spell: PUSH.',
  setup(ctx) {
    const w = ctx.world;
    buildCastleHall(w, { torches: true });
    // a raised stage down the middle
    const woodM = mat('wood', { size: 512, repeat: [3, 10], roughness: 0.6 });
    const stage = new THREE.Mesh(new THREE.BoxGeometry(6, 1, 30), woodM);
    stage.position.set(0, 0.5, 0);
    stage.castShadow = stage.receiveShadow = true;
    w.group.add(stage);
    addBox(w, 0, 0.5, 0, 6, 1, 30);
    w.spawn.set(0, 1, 11);
    w.spawnYaw = Math.PI;
    // the opponent
    const foeLook = { skin: 0, hair: 4, hairCol: 5, eyes: 4, wear: 1, name: 'DRACO-ISH' };
    const foe = buildAvatar(foeLook, {});
    foe.position.set(0, 1, -9);
    foe.rotation.y = 0;
    w.group.add(foe);
    label(ctx, foe, 'MALLOY', 2.3, '#c8d8e8');
    const haz = new Hazards(ctx);
    ctx.hazards = haz;
    // things he breaks, that you mend
    const props = [];
    for (let i = 0; i < 4; i++) {
      const g = new THREE.Group();
      const vase = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 0.8, 14), solid(0xbfae8a, 0.6));
      vase.position.y = 0.4;
      g.add(vase);
      g.position.set(i % 2 ? 4.4 : -4.4, 1, -6 + i * 4);
      g.userData.broken = false;
      g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      w.group.add(g);
      props.push(g);
      ctx.targets.push({
        obj: g, r: 1.0, h: 0.9, tag: 'prop',
        onHit: (id) => {
          if (id !== 'mend' || !g.userData.broken) return;
          g.userData.broken = false;
          g.children[0].scale.set(1, 1, 1);
          g.children[0].rotation.set(0, 0, 0);
          g.children[0].material = solid(0xbfae8a, 0.6);
          mended++;
          AU.sfx('good');
          ctx.caster.fx.ring(g.position.clone().setY(1.4), 0x8fffc0, 3, 0.5);
        }
      });
    }
    let mended = 0, hp = 6, breakT = 4, fireT = 1.6, pushed = 0;
    ctx.targets.push({
      obj: foe, r: 1.1, h: 1.8, tag: 'foe',
      onHit: (id) => {
        if (id === 'blast') {
          pushed += 3.2;
          AU.sfx('hit');
          R.kick(0.12, 0.25);
          ctx.caster.fx.burst(foe.position.clone().setY(1.8), 0xffe9a8, 22, 5, 0.1);
        } else if (id === 'bolt') {
          pushed += 0.8;
          AU.sfx('zap');
        } else {
          UI.toast('HE SHRUGGED IT OFF', 1);
        }
      }
    });
    ctx.say([
      ['MALLOY', 'Try not to cry when it is over.'],
      ['PROFESSOR QUILL', 'New spell today: PUSH. It does not hurt. It moves things. Including people. Including off a stage.'],
      ['PROFESSOR QUILL', 'And when he breaks the vases, MEND them. Both at once. That is the whole lesson.']
    ]);
    return {
      solveNext() {
        const broken = props.find((g) => g.userData.broken);
        if (broken) return { pos: broken.position.clone().setY(1.4), spell: 'mend', dist: 3 };
        return { pos: foe.position.clone().setY(1.6), spell: 'blast', dist: 5 };
      },
      update(dt) {
        haz.update(dt);
        const p = ctx.player;
        // he backs away as he is pushed
        foe.position.z = Math.max(-16.5, -9 - pushed * 0.5);   // he backs off, but not into the wall
        foe.rotation.y = Math.atan2(p.pos.x - foe.position.x, p.pos.z - foe.position.z);
        poseIdle(foe, R.elapsed);
        fireT -= dt;
        if (fireT <= 0) {
          fireT = rnd(1.8, 2.8);
          const from = foe.position.clone().setY(2.2);
          haz.fire(from, p.pos.clone().setY(1.4).sub(from).normalize(), { speed: 15, col: 0xbf6fff, dmg: 1, r: 0.2 });
        }
        breakT -= dt;
        if (breakT <= 0) {
          breakT = 6.5;
          const ok = props.filter((g) => !g.userData.broken);
          if (ok.length) {
            const g = pick(ok);
            g.userData.broken = true;
            g.children[0].scale.set(1.1, 0.25, 1.1);
            g.children[0].rotation.z = 0.7;
            g.children[0].material = solid(0x6b5a44, 0.9);
            AU.sfx('hit');
            ctx.caster.fx.burst(g.position.clone().setY(1.3), 0xbfae8a, 20, 4, 0.08);
          }
        }
        const brokenN = props.filter((g) => g.userData.broken).length;
        ctx.tally('PUSHED <b>' + Math.round(pushed) + '</b>/16 &middot; BROKEN <b>' + brokenN + '</b>' +
          '<br>YOU ' + '♥'.repeat(Math.max(0, p.hp)));
        if (brokenN >= 4) ctx.lose('Every vase in the hall is in pieces.');
        if (p.hp <= 0) ctx.lose('He was quicker than you.');
        if (pushed >= 16) ctx.win('OFF THE END');
      }
    };
  }
},

/* ---------------------------------------------------------------- 13 --- */
{
  id: 'chamberfind', title: 'THE CHAMBER', music: 'dark', amb: 'cave',
  goal: 'Find the tap with the snake on it, then open it',
  text: 'Writing on the wall in something that will not wash off. A girl who has been crying in a ' +
        'bathroom since before your parents were born. And a sink that has never worked, because ' +
        'it is not a sink.',
  after: 'The floor opened. There is a pipe down there and it goes a very long way.',
  setup(ctx) {
    const w = ctx.world;
    addSky(w, 'indoor');
    addHall(w, { w: 16, d: 20, h: 6, windows: false, seed: 88, dark: [40, 44, 48], light: [96, 102, 106], torchCol: 0x7fd0ff, chandeliers: false });
    w.fog.near = 4; w.fog.far = 28;
    // a ring of sinks
    const porc = solid(0xe4e8ea, 0.25);
    const pipes = solid(0x6b7076, 0.35, 0.8);
    const sinks = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      const g = new THREE.Group();
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.3, 0.3, 16), porc);
      bowl.position.y = 0.9; g.add(bowl);
      const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 0.9, 12), porc);
      stand.position.y = 0.45; g.add(stand);
      const tap = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 10), pipes);
      tap.position.set(0, 1.15, -0.28); g.add(tap);
      const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.28, 10), pipes);
      spout.position.set(0, 1.26, -0.16); spout.rotation.x = Math.PI / 2.4; g.add(spout);
      g.position.set(Math.cos(a) * 4.4, 0, Math.sin(a) * 4.4);
      g.rotation.y = -a + Math.PI / 2;
      g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      w.group.add(g);
      addBox(w, g.position.x, 0.6, g.position.z, 1, 1.2, 1);
      sinks.push({ g, i, snake: i === 5 });
      if (i === 5) {
        // the tiny snake scratched into the side of the tap
        const sn = new THREE.Mesh(new THREE.TorusKnotGeometry(0.06, 0.017, 40, 6, 2, 3), glow(0x6fff9f, 1.6));
        sn.position.set(0, 1.15, -0.34);
        g.add(sn);
        g.userData.mark = sn;
        sn.visible = false;
      }
    }
    // the writing on the wall
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 256;
    const x2 = cv.getContext('2d');
    x2.font = 'bold 74px Georgia, serif'; x2.textAlign = 'center';
    x2.fillStyle = '#8a1220';
    x2.fillText('THE CHAMBER IS OPEN', 512, 96);
    x2.font = 'bold 52px Georgia, serif';
    x2.fillText('ENEMIES OF THE HEIR, BEWARE', 512, 176);
    for (let i = 0; i < 60; i++) {
      x2.fillRect(rnd(40, 984), rnd(100, 250), 3, rnd(10, 60));
    }
    const t2 = new THREE.CanvasTexture(cv); t2.colorSpace = THREE.SRGBColorSpace;
    const writ = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.3),
      new THREE.MeshBasicMaterial({ map: t2, transparent: true }));
    writ.position.set(0, 3.4, -7.9);
    w.group.add(writ);
    // water on the floor
    const water = new THREE.Mesh(new THREE.CircleGeometry(7, 30), new THREE.MeshStandardMaterial({
      color: 0x24404a, roughness: 0.06, metalness: 0.8, transparent: true, opacity: 0.6
    }));
    water.rotation.x = -Math.PI / 2; water.position.y = 0.02;
    w.group.add(water);
    addMotes(w, 150, [16, 6, 20], 0x9fd8ff);
    const ghost = buildBookBoy({ skin: 6, hair: 3, hairCol: 5, eyes: 3, wear: 5 });
    ghost.position.set(-5, 0.4, 5);
    ghost.scale.setScalar(0.9);
    w.group.add(ghost);
    label(ctx, ghost, 'MOANING MYRA', 2.3, '#bfe0ff');
    w.update.push((dt, t) => { ghost.position.y = 0.4 + Math.sin(t * 1.1) * 0.12; poseIdle(ghost, t); });
    w.spawn.set(0, 0, 8);
    w.spawnYaw = Math.PI;

    let opened = false, done = false;
    const target = sinks[5];
    ctx.targets.push({
      obj: target.g, r: 1.2, h: 1.3, tag: 'tap',
      onHit: () => {
        if (opened) return;
        if (!target.g.userData.mark.visible) { UI.toast('LOOK AT IT FIRST', 1.2); return; }
        opened = true;
        AU.sfx('snake');
        R.kick(0.3, 1.2);
        UI.toast('IT IS OPENING', 2.4);
        ctx.goal('Get in');
        // the sinks slide back and a hole appears
        const hole = new THREE.Mesh(new THREE.CircleGeometry(2.2, 28), new THREE.MeshBasicMaterial({ color: 0x000000 }));
        hole.rotation.x = -Math.PI / 2; hole.position.y = 0.06;
        w.group.add(hole);
        ctx.holeAt = new THREE.Vector3(0, 0, 0);
        sinks.forEach((s, i) => {
          const a = (i / 8) * TAU;
          const to = new THREE.Vector3(Math.cos(a) * 7.4, 0, Math.sin(a) * 7.4);
          w.update.push((dt) => { s.g.position.lerp(to, 1 - Math.pow(0.1, dt)); });
        });
      }
    });
    ctx.say([
      ['MOANING MYRA', 'Oh, it is you. Come to laugh at me? Everybody comes to laugh at me.'],
      ['MOANING MYRA', 'A boy came in here once and talked to the taps. Talked. To the taps. And then I died, so.'],
      [FRIEND2, 'Every sink in here is the same except one. Get close and look at them.']
    ]);
    return {
      solveNext() {
        if (opened) return { goto: new THREE.Vector3(0, 0, 0) };
        if (!target.g.userData.mark.visible) return { goto: target.g.position.clone().setY(0) };
        return { pos: target.g.position.clone().setY(1), spell: 'bolt', dist: 3 };
      },
      update(dt) {
        const p = ctx.player;
        sinks.forEach((s) => {
          const d = p.pos.distanceTo(s.g.position);
          if (s.snake && d < 2.6 && !s.g.userData.mark.visible) {
            s.g.userData.mark.visible = true;
            UI.toast('A SNAKE, SCRATCHED INTO THE TAP', 2.4);
            AU.sfx('unlock');
            ctx.goal('Cast at the tap');
          }
        });
        if (!opened) ctx.tally(target.g.userData.mark.visible ? 'FOUND IT &middot; NOW OPEN IT' : 'EIGHT SINKS &middot; ONE IS WRONG');
        else {
          ctx.tally('GET IN');
          if (!done && Math.hypot(p.pos.x, p.pos.z) < 2.0) { done = true; ctx.win('DOWN THE PIPE'); }
        }
      }
    };
  }
},

/* ---------------------------------------------------------------- 14 --- */
{
  id: 'snake', title: 'THE GREAT SNAKE', music: 'dark', amb: 'cave', hp: 6,
  goal: 'Do not look at its eyes. Put them out, then go for the mouth.',
  text: 'Sixty feet of it, and eyes that kill anybody who meets them, which is a detail you would ' +
        'have liked earlier. It cannot hunt what it cannot see. Blind it first. Everything after ' +
        'that is just a very large snake.',
  after: 'It fell in the water and did not come up. One fang went through your sleeve. ' +
         'Only the sleeve.',
  setup(ctx) {
    const w = ctx.world;
    buildChamber(w);
    const snake = buildSnake(20);
    snake.position.set(0, 0, -32);
    w.group.add(snake);
    let eyes = 2;
    const eyeMeshes = snake.userData.head.children.filter((c) => c.material && c.material.emissive && c.material.emissiveIntensity > 1);
    const m = modeBoss(ctx, {
      name: 'THE SNAKE', hp: 6, r: 2.6, needsOpen: false,
      winMsg: 'IT WENT UNDER',
      loseMsg: 'It is very fast for something that long.',
      build: () => ({ obj: snake.userData.head, glow: eyeMeshes }),
      behave: (boss, c, dt, t, haz) => {
        const p = c.player;
        const head = snake.userData.head;
        // it swims at you, faster once it cannot see
        const target = V.copy(p.pos).setY(2.4 + Math.sin(t * 1.4) * 0.8);
        const sp = (eyes > 0 ? 5.2 : 3.4) * (1 + boss.phase * 0.2);
        const to = V.clone().sub(head.position);
        const d = to.length();
        to.normalize();
        if (d > 5) head.position.addScaledVector(to, sp * dt);
        else head.position.addScaledVector(to, -2 * dt);
        head.lookAt(p.pos.x, p.pos.y + 1, p.pos.z);
        snakeFollow(snake, dt, t);
        // the stare: only dangerous while it has eyes
        if (eyes > 0) {
          const look = V.copy(p.pos).sub(head.position).normalize();
          const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(head.quaternion);
          const facing = look.dot(fwd);
          const dist = head.position.distanceTo(p.pos);
          if (facing > 0.93 && dist < 22) {
            boss.stareT = (boss.stareT || 0) + dt;
            document.getElementById('hurt').style.opacity = String(clamp(boss.stareT / 2.2, 0, 0.9));
            if (boss.stareT > 2.2) {
              boss.stareT = 0;
              if (hurt(p, 2)) { UI.hurt(); AU.sfx('hurt'); UI.toast('DO NOT LOOK AT IT', 1.6); }
            }
          } else {
            boss.stareT = Math.max(0, (boss.stareT || 0) - dt * 1.5);
            document.getElementById('hurt').style.opacity = String(clamp((boss.stareT || 0) / 2.2, 0, 0.9));
          }
        }
        // the bite
        boss.biteT = (boss.biteT || 3) - dt;
        if (boss.biteT <= 0 && d < 9) {
          boss.biteT = 3.2;
          const from = head.position.clone();
          haz.fire(from, p.pos.clone().setY(1).sub(from).normalize(), { speed: 17, col: 0x9fff6a, dmg: 1, r: 0.3 });
          AU.sfx('snake');
        }
      },
      onDamage: (boss, c) => {
        if (eyes > 0) {
          eyes--;
          eyeMeshes[eyes].visible = false;
          UI.toast(eyes ? 'ONE EYE LEFT' : 'IT IS BLIND', 2);
          document.getElementById('hurt').style.opacity = '0';
        }
      },
      onDeath: () => {
        let t = 0;
        ctx.world.update.push((dt) => {
          t += dt;
          snake.position.y -= dt * 1.2;
          snake.userData.head.rotation.z += dt * 0.6;
        });
        AU.sfx('snake');
      }
    });
    ctx.say([
      ['MOANING MYRA', 'Do not look at it. I looked at it.'],
      [FRIEND2, 'Its eyes are the weapon. Hit the eyes twice and it is just teeth after that.']
    ]);
    return m;
  }
},

/* ---------------------------------------------------------------- 15 --- */
{
  id: 'book', title: 'THE BOY IN THE BOOK', music: 'dark', amb: 'cave', hp: 6,
  goal: 'He is only real while the book is open. Shut it.',
  text: 'There is a boy standing in the chamber who was sixteen fifty years ago and has not aged a ' +
        'day, because he has been living in a diary. He is very polite and he is here to kill you. ' +
        'You cannot hurt him. You can hurt the book.',
  after: 'You put a fang through the diary and he went out like a candle, mid-sentence, ' +
         'with his mouth still open.',
  setup(ctx) {
    const w = ctx.world;
    buildChamber(w);
    const boy = buildBookBoy({ skin: 0, hair: 0, hairCol: 0, eyes: 3, wear: 4 });
    boy.position.set(0, 0.2, -26);
    w.group.add(boy);
    label(ctx, boy, 'T. RIDDELL', 2.5, '#bfe0ff');
    // the diary, on a stone
    const diaryG = new THREE.Group();
    const cover = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.16, 1.2), solid(0x14141c, 0.8));
    diaryG.add(cover);
    const pages = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.12, 1.12), new THREE.MeshStandardMaterial({
      map: tex('paper', { size: 256 }), roughness: 0.95
    }));
    pages.position.y = 0.01;
    diaryG.add(pages);
    const shine = new THREE.PointLight(0x6fa8d8, 6, 12, 2);
    shine.position.y = 0.6;
    diaryG.add(shine);
    diaryG.position.set(0, 1.4, -18);
    diaryG.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    w.group.add(diaryG);
    label(ctx, diaryG, 'THE BOOK', 1.2, '#ffd070');
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 1.3, 14),
      mat('stone', { size: 256, repeat: [2, 1], dark: [22, 34, 28], light: [56, 78, 62] }));
    plinth.position.set(0, 0.65, -18);
    plinth.castShadow = plinth.receiveShadow = true;
    w.group.add(plinth);
    addBox(w, 0, 0.65, -18, 1.8, 1.3, 1.8);

    const m = modeBoss(ctx, {
      name: 'THE BOOK', hp: 5, r: 1.1, needsOpen: false,
      winMsg: 'HE WENT OUT LIKE A CANDLE',
      loseMsg: 'He was always going to be better at this than you.',
      build: () => ({ obj: diaryG, glow: [] }),
      behave: (boss, c, dt, t, haz) => {
        const p = c.player;
        // he drifts, and he is untouchable
        boy.position.x = Math.sin(t * 0.5) * 7;
        boy.position.z = -26 + Math.cos(t * 0.37) * 5;
        boy.position.y = 0.2 + Math.sin(t * 1.3) * 0.15;
        boy.rotation.y = Math.atan2(p.pos.x - boy.position.x, p.pos.z - boy.position.z);
        poseIdle(boy, t);
        diaryG.rotation.y += dt * 0.7;
        diaryG.position.y = 1.4 + Math.sin(t * 1.6) * 0.1;
        boss.fireT = (boss.fireT || 1.6) - dt;
        if (boss.fireT <= 0) {
          boss.fireT = clamp(1.7 - boss.phase * 0.4, 0.6, 1.8);
          const from = boy.position.clone().setY(1.8);
          const aim = p.pos.clone().setY(1).sub(from).normalize();
          const n = 1 + boss.phase;
          for (let k = 0; k < n; k++) {
            const a = aim.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), (k - (n - 1) / 2) * 0.22);
            haz.fire(from, a, { speed: 14, col: 0x6fa8ff, dmg: 1, r: 0.22 });
          }
          AU.sfx('zap');
        }
        // he also calls the snake's ghost: a slow homing orb in the last phase
        if (boss.phase === 2) {
          boss.homeT = (boss.homeT || 5) - dt;
          if (boss.homeT <= 0) {
            boss.homeT = 5.5;
            const from = boy.position.clone().setY(2);
            haz.fire(from, p.pos.clone().sub(from).normalize(), { speed: 7, col: 0x9fff9f, dmg: 1, r: 0.34, homing: 1.4, life: 8 });
            UI.toast('THAT ONE FOLLOWS', 1.4);
          }
        }
      },
      onDamage: () => {
        boy.traverse((o) => { if (o.isMesh && o.material.opacity !== undefined) o.material.opacity = Math.max(0.12, o.material.opacity - 0.1); });
        AU.sfx('page');
      },
      onDeath: (boss, c) => {
        let t = 0;
        c.world.update.push((dt) => {
          t += dt;
          boy.traverse((o) => { if (o.isMesh && o.material.opacity !== undefined) o.material.opacity = Math.max(0, o.material.opacity - dt * 0.6); });
          boy.scale.setScalar(Math.max(0.01, 1 - t * 0.35));
          diaryG.rotation.x += dt * 4;
        });
        c.caster.fx.burst(diaryG.position.clone(), 0x6fa8ff, 60, 8, 0.13);
        UI.flash(700);
      }
    });
    ctx.say([
      ['T. RIDDELL', 'How nice. I have not had a visitor in fifty years, and the last one did most of the talking.'],
      ['T. RIDDELL', 'You cannot touch me. I am a memory. Memories do not bruise.'],
      [FRIEND2, 'Then do not hit HIM. Hit the book he is coming out of!']
    ]);
    return m;
  }
},

/* ---------------------------------------------------------------- 16 --- */
{
  id: 'music', title: 'MUSIC AND PEACE', music: 'school', amb: 'hall',
  goal: 'Play the six notes back, in order',
  learn: 'song',
  text: 'A class nobody takes seriously until the term a three-headed dog is involved, at which ' +
        'point everybody remembers that the one thing that puts a monster to sleep is a tune. ' +
        'Six bells. Listen, then play them back.',
  after: 'You can put a very large thing to sleep now, as long as you can remember six notes ' +
         'while it is looking at you.',
  setup(ctx) {
    const w = ctx.world;
    addSky(w, 'indoor');
    addHall(w, { w: 20, d: 24, h: 9, seed: 37, torchCol: 0xffc9a0, windowCol: 0x5a7abf, windowGlow: 1.2 });
    addMotes(w, 220, [20, 9, 24]);
    addBookshelf(w, -9.2, -4, Math.PI / 2, 5);
    npc(ctx, { skin: 5, hair: 1, hairCol: 5, eyes: 1, wear: 3 }, -5, -9, 0.4, 'PROFESSOR BELLOWS');
    w.spawn.set(0, 0, 8);
    w.spawnYaw = Math.PI;

    const NOTES = [262, 294, 330, 392, 440, 523];
    const COLS = [0xff6a6a, 0xffb36a, 0xffe96a, 0x8fe06a, 0x6fc0ff, 0xc08fff];
    const order = [3, 0, 5, 2, 4, 1];
    const bells = [];
    const m = modeSequence(ctx, {
      items: NOTES, order, r: 0.9,
      goal: 'Play the six notes back',
      goalFor: (s) => 'Note ' + (s + 1) + ' of 6',
      maxMistakes: 5,
      showNext: false,
      make: (f, i) => {
        const g = new THREE.Group();
        const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.5, 0.8, 16, 1, true), solid(0xc9a227, 0.25, 0.9));
        bell.position.y = 0.4; bell.material.side = THREE.DoubleSide;
        g.add(bell);
        const top = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 10, 0, TAU, 0, Math.PI / 2), solid(0xc9a227, 0.25, 0.9));
        top.position.y = 0.8; g.add(top);
        const clap = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), glow(COLS[i], 0.8));
        clap.position.y = 0.2; g.add(clap);
        const l = new THREE.PointLight(COLS[i], 2, 5, 2);
        l.position.y = 0.4; g.add(l);
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 8), solid(0x5a4a2a, 0.6));
        bar.position.y = 1.6; g.add(bar);
        g.position.set((i - 2.5) * 2.1, 1.3, -5);
        g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
        ctx.world.group.add(g);
        g.userData = { clap, l, f, i };
        bells.push(g);
        return g;
      },
      onStep: (step, g) => {
        AU.tone({ f: g.userData.f, dur: 1.1, type: 'sine', g: 0.2 });
        AU.tone({ f: g.userData.f * 2, dur: 0.8, type: 'triangle', g: 0.07 });
        g.userData.l.intensity = 9;
        g.userData.hit = R.elapsed;
      },
      onWrong: (g) => { AU.tone({ f: 90, dur: 0.6, type: 'sawtooth', g: 0.18 }); },
      winMsg: 'THAT IS THE TUNE'
    });
    // play the phrase for them at the start
    let demoT = 1.2, demoI = 0;
    ctx.say([
      ['PROFESSOR BELLOWS', 'Six bells. I play them. You play them back. If you can do that you can walk past anything with teeth.']
    ]);
    return {
      solveNext() {
        if (demoI < order.length) return { wait: true };   // let it finish playing first
        return m.solveNext();
      },
      update(dt) {
        m.update(dt);
        if (demoI < order.length) {
          demoT -= dt;
          if (demoT <= 0) {
            demoT = 0.75;
            const g = bells[order[demoI]];
            AU.tone({ f: g.userData.f, dur: 0.9, type: 'sine', g: 0.22 });
            g.userData.l.intensity = 9;
            g.userData.hit = R.elapsed;
            demoI++;
            ctx.goal(demoI < order.length ? 'Listen…' : 'Now you');
          }
        }
        bells.forEach((g) => {
          g.userData.l.intensity = damp(g.userData.l.intensity, 1.4, 4, dt);
          const since = R.elapsed - (g.userData.hit || -9);
          g.rotation.z = since < 1 ? Math.sin(since * 22) * 0.12 * (1 - since) : 0;
        });
      }
    };
  }
},

/* ---------------------------------------------------------------- 17 --- */
{
  id: 'wild', title: 'THE WILDERNESS CLASS', music: 'school', amb: 'forest', hp: 5,
  goal: 'Track the four creatures and get close without spooking them',
  learn: 'track',
  text: 'Held at the edge of the forest by an enormous man who keeps saying the forest is perfectly ' +
        'safe in a voice that suggests otherwise. Four creatures are out there. You are going to ' +
        'find them by their footprints and then, crucially, not frighten them.',
  after: 'Four found. One of them followed you home for eleven metres and then thought better of it.',
  setup(ctx) {
    const w = ctx.world;
    buildForest(w, { trees: 120 });
    w.spawn.set(0, 0, 0);
    const big = buildAvatar({ skin: 3, hair: 1, hairCol: 1, eyes: 0, wear: 4 }, { hat: false });
    big.scale.setScalar(1.7);
    big.position.set(4, 0, 6);
    w.group.add(big);
    label(ctx, big, 'HAGGARD', 3.6);
    w.update.push((dt, t) => poseIdle(big, t));

    const beasts = [];
    const spots = [{ x: -28, z: -22 }, { x: 34, z: 12 }, { x: 6, z: -44 }, { x: -40, z: 26 }];
    const m = modeFind(ctx, {
      spots: spots.map((s) => ({ x: s.x, y: 0, z: s.z })),
      need: 4, hidden: true, reveal: 'track', revealRange: 90, warmRange: 14, pickRange: 4.5,
      make: (s, i) => {
        const g = new THREE.Group();
        if (i === 0) {
          const wo = buildWolf({ col: 0x6a6258 });
          wo.scale.setScalar(0.8);
          g.add(wo);
          g.userData.walk = wo;
        } else if (i === 1) {
          // something with a beak and wings
          const b = new THREE.Mesh(new THREE.SphereGeometry(0.7, 14, 10), solid(0x8a8f96, 0.95));
          b.scale.set(1, 0.9, 1.6); b.position.y = 1.1; g.add(b);
          const h = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 9), solid(0xc8ccd2, 0.9));
          h.position.set(0, 1.9, 0.7); g.add(h);
          const beak = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.6, 8), solid(0xe8a13a, 0.6));
          beak.position.set(0, 1.85, 1.15); beak.rotation.x = Math.PI / 2; g.add(beak);
          [-1, 1].forEach((sx) => {
            const wg = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.1, 0.8), solid(0x9aa0a8, 0.95));
            wg.position.set(sx * 1.1, 1.3, 0); wg.rotation.z = sx * 0.2; g.add(wg);
          });
        } else if (i === 2) {
          // a small glowing thing
          const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 1), glow(0x8fffc0, 1.2));
          b.position.y = 0.8; g.add(b);
          const l = new THREE.PointLight(0x8fffc0, 5, 12, 2); l.position.y = 1; g.add(l);
        } else {
          // a horse-ish shadow
          const b = new THREE.Mesh(new THREE.SphereGeometry(0.8, 14, 10), solid(0x1a1a20, 1));
          b.scale.set(0.8, 0.9, 1.8); b.position.y = 1.5; g.add(b);
          const n = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 1.2, 10), solid(0x1a1a20, 1));
          n.position.set(0, 2.1, 1.1); n.rotation.x = 0.7; g.add(n);
          [[-0.4, 0.8], [0.4, 0.8], [-0.4, -0.8], [0.4, -0.8]].forEach(([x, z]) => {
            const L = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.07, 1.5, 8), solid(0x1a1a20, 1));
            L.position.set(x, 0.75, z); g.add(L);
          });
        }
        g.position.set(s.x, 0, s.z);
        g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
        ctx.world.group.add(g);
        beasts.push(g);
        return g;
      },
      onFind: (sp, n) => {
        UI.toast(['A WOLF, AND IT IS FINE', 'SOMETHING WITH A BEAK', 'A LITTLE GREEN LIGHT', 'A HORSE MADE OF SHADOW'][n - 1] || '', 2.4);
        AU.sfx('good');
      },
      winMsg: 'ALL FOUR'
    });
    // glowing footprints when you use TRACK
    ctx.onPulse = (kind, from) => {
      if (kind !== 'track') return;
      UI.toast('FOOTPRINTS', 1.6);
      m.spots.forEach((sp) => {
        sp.g.visible = true;
        // a line of prints from you towards it
        const dir = V.copy(sp.g.position).sub(from).setY(0).normalize();
        for (let i = 1; i < 9; i++) {
          const pr = new THREE.Mesh(new THREE.CircleGeometry(0.2, 10), glow(0xa8ff8f, 1.4));
          pr.rotation.x = -Math.PI / 2;
          pr.position.copy(from).addScaledVector(dir, i * 2.2).setY(0.05);
          pr.position.x += (i % 2 ? 0.3 : -0.3);
          ctx.world.group.add(pr);
          let life = 9;
          ctx.world.update.push((dt) => {
            life -= dt;
            pr.material.opacity = clamp(life / 9, 0, 1);
            pr.material.transparent = true;
            pr.visible = life > 0;
          });
        }
      });
    };
    ctx.say([
      ['HAGGARD', 'Righ’. Forest’s perfectly safe. Mostly. Four things out there an’ none of ’em want a fuss.'],
      ['HAGGARD', 'Use TRACK. It lights up where they went. Then walk — walk, mind — up to ’em.']
    ]);
    return {
      solveNext: m.solveNext,
      update(dt) {
        m.update(dt);
        beasts.forEach((b, i) => {
          if (b.userData.walk) wolfWalk(b.userData.walk, R.elapsed + i, 0.15);
          b.position.y = i === 2 ? 0.4 + Math.sin(R.elapsed * 1.4) * 0.3 : 0;
          b.rotation.y = Math.sin(R.elapsed * 0.3 + i) * 0.7;
        });
        // running spooks them: they hop away
        if (ctx.player.speed > 6) {
          m.spots.forEach((sp) => {
            if (sp.found) return;
            const d = ctx.player.pos.distanceTo(sp.g.position);
            if (d < 12) {
              const away = V.copy(sp.g.position).sub(ctx.player.pos).setY(0).normalize();
              sp.g.position.addScaledVector(away, dt * 7);
            }
          });
        }
      }
    };
  }
},

/* ---------------------------------------------------------------- 18 --- */
{
  id: 'advanced', title: 'ADVANCED SPELLS', music: 'school', amb: 'hall', hp: 5,
  goal: 'Each one wants a different spell. Read the colour.',
  learn: 'bind',
  text: 'The exam. Nine targets, each of them only willing to be dealt with one particular way, ' +
        'and a new spell on top: ropes, which tie a thing up and stop it moving. You will need ' +
        'that one later, though nobody tells you why.',
  after: 'Nine out of nine, and a length of rope that appears out of the air whenever you ask for it.',
  setup(ctx) {
    const w = ctx.world;
    addSky(w, 'indoor');
    addHall(w, { w: 26, d: 34, h: 11, seed: 43, torchCol: 0xffc070 });
    addMotes(w, 220, [26, 11, 34]);
    addBlackboard(w, -16.6, 'READ THE COLOUR.\nPICK THE SPELL.');
    w.spawn.set(0, 0, 13);
    w.spawnYaw = Math.PI;
    const WANT = ['fire', 'freeze', 'lift', 'change', 'blast', 'mend', 'bind', 'bolt', 'bind'];
    const orbs = [];
    let left = WANT.length;
    WANT.forEach((spell, i) => {
      const col = SPELLS[spell].col;
      const g = new THREE.Group();
      const o = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 1), glow(col, 1.3));
      g.add(o);
      const cage = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.04, 6, 24), solid(col, 0.4, 0.7));
      g.add(cage);
      const cage2 = cage.clone(); cage2.rotation.x = Math.PI / 2; g.add(cage2);
      const l = new THREE.PointLight(col, 4, 9, 2); g.add(l);
      g.position.set((i % 3 - 1) * 6, 1.6 + Math.floor(i / 3) * 1.6, -4 - Math.floor(i / 3) * 5);
      ctx.world.group.add(g);
      label(ctx, g, SPELLS[spell].name, 1.3, '#' + col.toString(16).padStart(6, '0'));
      orbs.push({ g, spell, done: false });
      ctx.targets.push({
        obj: g, r: 0.9, h: 0, tag: 'orb',
        onHit: (id) => {
          const rec = orbs[i];
          if (rec.done) return;
          if (id !== spell) {
            UI.toast('WRONG SPELL', 1);
            AU.sfx('bad');
            return;
          }
          rec.done = true; rec.g.visible = false;
          left--;
          AU.sfx('good');
          ctx.caster.fx.burst(g.position.clone(), col, 30, 6, 0.11);
          ctx.tally('<b>' + (WANT.length - left) + '</b> / ' + WANT.length);
          if (left <= 0) ctx.win('NINE OUT OF NINE');
        }
      });
    });
    ctx.tally('<b>0</b> / ' + WANT.length);
    ctx.say([
      ['PROFESSOR QUILL', 'Every one of these is labelled. Every one of them only accepts one spell. There is no trick.'],
      ['PROFESSOR QUILL', 'The new one is ROPES. It ties a thing where it stands. Two of those are for it.']
    ]);
    return {
      solveNext() {
        const o = orbs.find((q) => !q.done);
        return o ? { pos: o.g.position.clone(), spell: o.spell, dist: 4 } : null;
      },
      update(dt) {
        orbs.forEach((o, i) => {
          if (o.done) return;
          o.g.rotation.y += dt * (0.6 + i * 0.05);
          o.g.rotation.x += dt * 0.3;
          o.g.position.y += Math.sin(R.elapsed * 1.3 + i) * dt * 0.3;
        });
      }
    };
  }
},

/* ---------------------------------------------------------------- 19 --- */
{
  id: 'quid2', title: 'QUITTICH, AND THE HEAVY ONE', music: 'flight', amb: 'crowd', hp: 4,
  goal: 'Catch it. The iron one is chasing you and it will not stop.',
  fly: true, flyOpts: { bounds: 58, ceil: 36, floor: 1.5, cruise: 16, maxSpeed: 34 },
  text: 'Somebody has done something to one of the iron balls. It has gone past the other team ' +
        'entirely and it is following you, only you, all the way round the pitch, and it will keep ' +
        'doing that until somebody catches the gold one and ends the match.',
  after: 'You caught it one-handed with a ball of solid iron nine inches behind your head.',
  setup(ctx) {
    const w = ctx.world;
    buildPitch(w, { sky: 'day' });
    w.spawn.set(0, 14, 40);
    const m = modeQuidditch(ctx, {
      bludgers: 1, chase: true, catches: 1, time: 140,
      snitchSpeed: 17, snitchPanic: 3, bludgerSpeed: 15,
      winMsg: 'CAUGHT IT, AND IT MISSED',
      loseMsg: 'It got you in the end.'
    });
    ctx.say([
      [FRIEND, 'That one is not playing the game. That one is playing YOU.'],
      [FRIEND, 'Do not try to outrun it in a straight line. Turn. It is heavy and it is stupid.']
    ]);
    return Object.assign({}, m, {
      update(dt) {
        m.update(dt);
        const b = m.bludgers[0];
        if (b) {
          const d = b.obj.position.distanceTo(ctx.player.pos);
          ctx.goal(d < 9 ? 'IT IS RIGHT BEHIND YOU' : 'Find the gold one');
          if (d < 14) R.kick(0.02 * (14 - d) / 14, 0.1);
        }
      }
    });
  }
},

/* ---------------------------------------------------------------- 20 --- */
{
  id: 'quid3', title: 'QUITTICH IN THE STORM', music: 'flight', amb: 'storm', hp: 4,
  goal: 'Same again, in this',
  fly: true, flyOpts: { bounds: 56, ceil: 34, floor: 1.5, cruise: 15, maxSpeed: 32 },
  text: 'The match is not called off. The match is never called off. Rain sideways, wind that ' +
        'shoves you two metres every few seconds, lightning close enough to see the pitch by, ' +
        'and both iron balls out looking for you.',
  after: 'You came down soaked through with the gold one in your fist and could not hear anything ' +
         'for an hour.',
  setup(ctx) {
    const w = ctx.world;
    buildPitch(w, { sky: 'storm' });
    w.fog.near = 12; w.fog.far = 110;
    w.spawn.set(0, 14, 40);
    // rain
    const N = 2400;
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = rnd(-70, 70); pos[i * 3 + 1] = rnd(0, 60); pos[i * 3 + 2] = rnd(-70, 70);
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const rain = new THREE.Points(g, new THREE.PointsMaterial({
      color: 0xa8c0d8, size: 0.28, transparent: true, opacity: 0.55, depthWrite: false
    }));
    w.group.add(rain);
    const arr = g.attributes.position.array;
    w.update.push((dt) => {
      for (let i = 0; i < N; i++) {
        arr[i * 3 + 1] -= dt * 44;
        arr[i * 3] += dt * 9;
        if (arr[i * 3 + 1] < 0) { arr[i * 3 + 1] = 60; arr[i * 3] = rnd(-70, 70); arr[i * 3 + 2] = rnd(-70, 70); }
      }
      g.attributes.position.needsUpdate = true;
    });
    const m = modeQuidditch(ctx, {
      bludgers: 2, chase: true, catches: 1, time: 150, storm: 1,
      snitchSpeed: 16, bludgerSpeed: 13,
      winMsg: 'IN ALL THAT, YOU CAUGHT IT',
      loseMsg: 'The storm won.'
    });
    ctx.say([
      ['MADAM HOOP', 'The match is not being called off. It has never been called off. Get up there.']
    ]);
    return Object.assign({}, m, { update: (dt) => m.update(dt) });
  }
},

/* ---------------------------------------------------------------- 21 --- */
{
  id: 'shack', title: 'THE HOUSE ON THE HILL', music: 'sad', amb: 'wind', hp: 5,
  goal: 'Stay in the room. Let it happen.',
  text: 'Something enormous and black drags you by the leg through a hole under a tree and up into ' +
        'a boarded-up house where two grown men are waiting. One of them has been in prison for ' +
        'twelve years. The other one is your teacher. And they both want the rat your friend has ' +
        'had in his pocket since the first week.',
  after: 'The rat stood up and was a man, and then he was gone through the hole in the floor ' +
         'before anybody could shut their mouth.',
  setup(ctx) {
    const w = ctx.world;
    buildShack(w);
    const grim = buildAvatar({ skin: 0, hair: 2, hairCol: 0, eyes: 4, wear: 4, name: 'SIRUS' }, { hat: false });
    grim.position.set(4.5, 0, -1.5); grim.rotation.y = -1.9;
    w.group.add(grim);
    label(ctx, grim, 'THE PRISONER', 2.3, '#c8b8d8');
    const teach = buildAvatar({ skin: 1, hair: 0, hairCol: 2, eyes: 1, wear: 5, name: 'PROFESSOR LUPE' }, { hat: false });
    teach.position.set(-2.5, 0, -3.5); teach.rotation.y = 1.1;
    w.group.add(teach);
    label(ctx, teach, 'PROFESSOR LUPE', 2.3, '#c8d8c8');
    const pal = buildAvatar(friendLook(), {});
    pal.position.set(-1.2, 0, 2.6); pal.rotation.y = 0.2;
    w.group.add(pal);
    label(ctx, pal, FRIEND, 2.3, '#e8c890');
    const rat = buildRat();
    rat.position.set(-1.0, 0.95, 2.1);
    w.group.add(rat);
    const ratMan = buildAvatar({ skin: 1, hair: 4, hairCol: 5, eyes: 4, wear: 5, name: 'PETER' }, { hat: false });
    ratMan.position.set(-1.0, 0, 2.1);
    ratMan.scale.setScalar(0.92);
    ratMan.visible = false;
    w.group.add(ratMan);
    w.update.push((dt, t) => {
      poseIdle(grim, t); poseIdle(teach, t + 1); poseIdle(pal, t + 2);
      if (rat.visible) { rat.position.y = 0.95 + Math.sin(t * 6) * 0.02; rat.userData.tail.rotation.z = Math.sin(t * 5) * 0.4; }
      if (ratMan.visible) poseIdle(ratMan, t);
    });

    return modeStory(ctx, {
      winMsg: 'HE GOT AWAY',
      steps: [
        { goal: 'Listen', say: [
          ['THE PRISONER', 'Twelve years. Twelve years in a stone box for something I did not do, and the man who did it has been asleep on your friend’s pillow the whole time.'],
          [FRIEND, 'He is a RAT. He is my rat. He has been my rat since I was nine.'],
          ['THE PRISONER', 'He has been a rat for twelve years, which is a long time for a rat, and you never once wondered.']
        ] },
        { goal: 'Let the teacher speak', say: [
          ['PROFESSOR LUPE', 'Put the wand down. Both of you. I have known him since we were your age and I am telling you he is not lying.'],
          ['PROFESSOR LUPE', 'Give me the rat.']
        ] },
        { do: (c) => { UI.toast('GIVE HIM THE RAT', 2); c.goal('Walk up to your friend and cast at the rat'); c.targets.push({
            obj: rat, r: 1.2, tag: 'rat',
            onHit: () => { c.ratHit = true; }
          }); } , until: (c) => c.ratHit },
        { do: (c) => {
            AU.sfx('pop');
            UI.flash(400);
            R.kick(0.2, 0.5);
            c.caster.fx.burst(rat.position.clone(), 0xc0a090, 40, 5, 0.1);
            rat.visible = false;
            ratMan.visible = true;
            ratMan.scale.setScalar(0.2);
            let t = 0;
            c.world.update.push((dt) => { t += dt; ratMan.scale.setScalar(Math.min(0.95, 0.2 + t * 2)); });
          },
          say: [
            ['PETER', 'Ah. Hello. You have all grown.'],
            [FRIEND, 'I let him sleep in my BED.'],
            ['PETER', 'And a lovely bed it was. Sorry about this —'],
          ] },
        { do: (c) => {
            AU.sfx('whoosh');
            let t = 0;
            c.world.update.push((dt) => {
              t += dt;
              ratMan.position.x -= dt * 7;
              ratMan.position.y = Math.max(-2, -t * 1.2);
              ratMan.rotation.y += dt * 4;
              if (t > 1.4) ratMan.visible = false;
            });
            UI.toast('HE IS GONE', 2.4);
          },
          wait: 2.2 },
        { say: [
          ['THE PRISONER', 'Twelve years, and he goes down a hole in the floor in four seconds.'],
          ['PROFESSOR LUPE', 'We have to get outside. Now. Before —'],
          ['PROFESSOR LUPE', 'What phase is the moon.'],
          [FRIEND, 'Full. It is full. It has been full all week.']
        ] }
      ]
    });
  }
},

/* ---------------------------------------------------------------- 22 --- */
{
  id: 'wolf', title: 'THE WOLF', music: 'sad', amb: 'forest', hp: 6,
  goal: 'Keep the man-wolf off him. Ropes hold it. Push moves it.',
  text: 'Outside, in the open, under a full moon, your teacher stops being your teacher. There is ' +
        'a dog in the clearing that has decided it is on your side, and it is about to take on ' +
        'something twice its size to keep it off you.',
  after: 'The big one ran off into the trees. The dog lived. It looked at you for a long moment ' +
         'and then it was a man again, and then it was gone.',
  setup(ctx) {
    const w = ctx.world;
    buildForest(w, { trees: 90, inner: 24 });   // a clearing, so a spell can actually cross it
    w.fog.near = 5; w.fog.far = 46;
    w.spawn.set(0, 0, 8);
    const dog = buildWolf({ col: 0x2a2a30, eyes: 0x9fd0ff });
    dog.position.set(-3, 0, 2);
    w.group.add(dog);
    label(ctx, dog, 'THE DOG', 2.2, '#bfd0ff');
    const beast = buildManWolf();
    beast.position.set(2, 0, -16);
    w.group.add(beast);
    label(ctx, beast, 'THE OTHER ONE', 3.4, '#ffb0a0');
    let dogHp = 6;
    let bound = 0, pushed = 0, hits = 0;
    const need = 8;
    ctx.targets.push({
      obj: beast, r: 1.7, h: 2.7, tag: 'beast',
      onHit: (id) => {
        if (id === 'bind') {
          bound = 3.2;
          AU.sfx('good');
          UI.toast('TIED', 1.2);
          for (let i = 0; i < 4; i++) {
            const rope = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.06, 6, 20), solid(0xa8ff8f, 0.7));
            rope.position.copy(beast.position).setY(1 + i * 0.5);
            rope.rotation.x = Math.PI / 2;
            w.group.add(rope);
            let life = 3.2;
            w.update.push((dt) => {
              life -= dt;
              rope.visible = life > 0;
              rope.position.copy(beast.position).setY(1 + i * 0.5);
              rope.rotation.z += dt * 2;
            });
          }
          hits++;
        } else if (id === 'blast') {
          pushed = 1;
          const away = V.copy(beast.position).sub(ctx.player.pos).setY(0).normalize();
          beast.position.addScaledVector(away, 5);
          AU.sfx('hit');
          R.kick(0.14, 0.3);
          hits++;
        } else if (id === 'bolt' || id === 'freeze') {
          hits += 0.5;
          if (id === 'freeze') bound = Math.max(bound, 1.6);
          AU.sfx('zap');
        } else {
          UI.toast('IT DOES NOT CARE', 1);
          return;
        }
        ctx.caster.fx.burst(beast.position.clone().setY(2), 0xa8ff8f, 20, 5, 0.1);
        if (hits >= need) ctx.win('IT RAN OFF');
      }
    });
    ctx.say([
      ['PROFESSOR LUPE', 'Run. RUN —'],
      ['THE PRISONER', 'I will hold him. You keep him off me. ROPES, boy. Ropes and push. Nothing else touches him.']
    ]);
    let biteT = 2.5;
    return {
      solveNext() {
        return { pos: beast.position.clone().setY(2), spell: 'bind', dist: 6 };
      },
      update(dt) {
        const p = ctx.player, t = R.elapsed;
        // the dog places itself between the beast and you
        const mid = V.copy(beast.position).add(p.pos).multiplyScalar(0.5);
        dog.position.lerp(mid, 1 - Math.pow(0.35, dt));
        dog.position.y = 0;
        dog.rotation.y = Math.atan2(beast.position.x - dog.position.x, beast.position.z - dog.position.z);
        wolfWalk(dog, t, 0.7);
        // the beast goes for whoever is closest
        if (bound > 0) { bound -= dt; }
        else {
          const goDog = dog.position.distanceTo(beast.position) < p.pos.distanceTo(beast.position);
          const tgt = goDog ? dog.position : p.pos;
          const dir = V.copy(tgt).sub(beast.position).setY(0);
          const d = dir.length();
          dir.normalize();
          if (d > 2.2) beast.position.addScaledVector(dir, dt * 5.2);
          beast.rotation.y = Math.atan2(dir.x, dir.z);
          beast.userData.legs.forEach((L, i) => { L.rotation.x = Math.sin(t * 7 + i * Math.PI) * 0.6; });
          beast.userData.arms.forEach((A, i) => { A.rotation.x = Math.sin(t * 7 + i * Math.PI + 1) * 0.5; });
          biteT -= dt;
          if (biteT <= 0 && d < 3.2) {
            biteT = 1.8;
            AU.sfx('wolf');
            if (goDog) {
              dogHp--;
              ctx.caster.fx.burst(dog.position.clone().setY(1), 0xaa3030, 18, 4, 0.09);
              if (dogHp <= 0) ctx.lose('It got to the dog.');
            } else if (hurt(p, 1)) { UI.hurt(); AU.sfx('hurt'); R.kick(0.2, 0.4); }
          }
        }
        beast.userData.head.rotation.x = Math.sin(t * 3) * 0.12;
        ctx.tally('THE DOG ' + '♥'.repeat(Math.max(0, dogHp)) + '<br>YOU ' + '♥'.repeat(Math.max(0, p.hp)) +
          '<br>DRIVEN OFF <b>' + Math.floor(hits) + '</b>/' + need);
        if (p.hp <= 0) ctx.lose('It went through you to get to him.');
      }
    };
  }
},

/* ---------------------------------------------------------------- 23 --- */
{
  id: 'cold', title: 'THE COLD ONE', music: 'dark', amb: 'wind', hp: 6,
  goal: 'Nothing else works. Use the GUARDIAN.',
  learn: 'guard',
  text: 'It is black and it has no face and where it goes the grass goes white. Every spell you ' +
        'have goes straight through it. There is exactly one thing it is frightened of, and you ' +
        'have to make it out of the best thing that ever happened to you, which is harder than it ' +
        'sounds while something is eating the warmth out of your chest.',
  after: 'It went backwards over the lake and did not come back. You can go home now.',
  setup(ctx) {
    const w = ctx.world;
    buildGrounds(w, { sky: 'night', trees: 30, lake: true, castleAt: [-70, -96] });
    w.fog.near = 4; w.fog.far = 40;
    if (w.sun) w.sun.intensity = 0.18;
    addMist(w, 90, 60);
    w.spawn.set(0, 0, 16);
    const wraiths = [];
    const main = buildWraith();
    main.position.set(0, 0, -14);
    w.group.add(main);
    wraiths.push(main);
    for (let i = 0; i < 2; i++) {
      const e = buildWraith();
      e.scale.setScalar(0.8);
      e.position.set(i ? -16 : 16, 0, -22);
      w.group.add(e);
      wraiths.push(e);
    }
    let chill = 0;
    const m = modeBoss(ctx, {
      name: 'THE COLD ONE', hp: 5, r: 2.0, h: 2.8, needsOpen: false,
      weakness: 'guard',
      weaknessHint: 'IT GOES STRAIGHT THROUGH',
      winMsg: 'IT WENT BACKWARDS OVER THE LAKE',
      loseMsg: 'The cold got all the way in.',
      build: () => ({ obj: main, glow: [] }),
      behave: (boss, c, dt, t, haz) => {
        const p = c.player;
        wraiths.forEach((wr, i) => {
          const speed = i === 0 ? 2.6 : 1.9;
          const dir = V.copy(p.pos).sub(wr.position).setY(0);
          const d = dir.length();
          dir.normalize();
          if (d > 2) wr.position.addScaledVector(dir, speed * dt);
          wr.position.y = Math.sin(t * 0.9 + i) * 0.35 + 0.2;
          wr.rotation.y = Math.atan2(dir.x, dir.z);
          wr.userData.rags.forEach((r, k) => { r.rotation.x = Math.sin(t * 2 + k) * 0.35; });
          wr.userData.hands.forEach((h, k) => { h.position.y = 1.9 + Math.sin(t * 1.6 + k) * 0.12; });
          // the cold
          if (d < 7) {
            chill += dt * (1 + (7 - d) * 0.2);
            if (chill > 3.4) {
              chill = 0;
              if (hurt(p, 1)) { UI.hurt(); AU.sfx('ghost'); UI.toast('YOU CANNOT FEEL YOUR HANDS', 1.5); }
            }
          } else chill = Math.max(0, chill - dt);
        });
        document.getElementById('hurt').style.opacity = String(clamp(chill / 3.4 * 0.7, 0, 0.7));
        // the world dims as they get close
        const near = Math.min.apply(null, wraiths.map((wr) => wr.position.distanceTo(p.pos)));
        if (c.world.sun) c.world.sun.intensity = lerp(0.18, 0.02, clamp((12 - near) / 10, 0, 1));
      },
      onDamage: (boss, c) => {
        // the little ones scatter as the big one weakens
        wraiths.slice(1).forEach((wr) => { wr.position.addScaledVector(V.copy(wr.position).sub(c.player.pos).setY(0).normalize(), 8); });
        UI.toast('IT FLINCHED', 1.2);
      },
      onDeath: (boss, c) => {
        let t = 0;
        c.world.update.push((dt) => {
          t += dt;
          wraiths.forEach((wr, i) => {
            wr.position.z -= dt * (14 + i * 3);
            wr.position.y += dt * 2;
            wr.scale.multiplyScalar(1 - dt * 0.3);
          });
        });
        document.getElementById('hurt').style.opacity = '0';
        UI.flash(900);
      }
    });
    ctx.say([
      ['PROFESSOR LUPE', 'Do not try the usual things. They go through it like it is a curtain.'],
      ['PROFESSOR LUPE', 'Think of one thing. The best one. Hold it, and cast GUARDIAN. It comes out silver and it does the rest.'],
      ['PROFESSOR LUPE', 'If you think of nothing, nothing is what comes out.']
    ]);
    return m;
  }
},

/* ---------------------------------------------------------------- 24 --- */
{
  id: 'home', title: 'HOME, AND THE AUNT', music: 'school', amb: null, hp: 5,
  goal: 'She will not stop. You know a spell for this.',
  text: 'Home for the summer, at a dinner table, being told exactly what is wrong with you by a ' +
        'relative who has never once been told to stop. You are not allowed to do magic at home. ' +
        'You are going to do magic at home.',
  after: 'She went blue, then round, then out of the window, and up. Somebody will fetch her down. ' +
         'Probably.',
  setup(ctx) {
    const w = ctx.world;
    buildHouse(w);
    const aunt = buildAunt();
    aunt.position.set(0, 0, -2.2);
    aunt.rotation.y = 0;
    w.group.add(aunt);
    label(ctx, aunt, 'AUNT MARGARINE', 2.3, '#e8c0c0');
    w.update.push((dt, t) => { if (!ctx.blueberry) poseIdle(aunt, t); });
    let rage = 0, done = false;
    const LINES = [
      'It is the BLOOD, you see. Bad blood always comes out.',
      'If there is something wrong with the pup, there is something wrong with the mother.',
      'In MY day a boy like you would have been sent somewhere with a wall round it.',
      'And what is that SCHOOL, exactly? Nobody will tell me. That tells me everything.',
      'Do not look at me like that. You are exactly like your father.'
    ];
    let lineI = 0, lineT = 3;
    ctx.targets.push({
      obj: aunt, r: 1.2, h: 1.8, tag: 'aunt',
      onHit: (id) => {
        if (done) return;
        if (id !== 'change') { UI.toast('NOT THAT ONE', 1.1); return; }
        done = true;
        ctx.blueberry = true;
        AU.sfx('pop');
        UI.flash(350);
        // blue, then round, then up
        const blue = new THREE.Color(0x3f6fd8);
        aunt.traverse((o) => {
          if (o.isMesh) {
            o.material = o.material.clone();
            o.material.__owned = true;
            o.material.color = blue.clone();
            o.material.roughness = 0.35;
          }
        });
        let t = 0;
        const startY = aunt.position.y;
        ctx.world.update.push((dt) => {
          t += dt;
          const round = Math.min(1, t / 2.2);
          aunt.scale.set(1.25 + round * 1.5, 1 + round * 1.7, 1.25 + round * 1.5);
          aunt.rotation.y += dt * (0.4 + round);
          if (t > 2.0) {
            aunt.position.y = startY + (t - 2.0) * (t - 2.0) * 2.4;
            aunt.position.z = -2.2 - Math.min(9, (t - 2.0) * 3.4);
            aunt.rotation.z += dt * 0.7;
          }
          if (t > 2.2 && !ctx.popped) {
            ctx.popped = true;
            ctx.caster.fx.burst(new THREE.Vector3(0, 2, -4), 0x3f6fd8, 50, 6, 0.13);
            AU.sfx('whoosh');
          }
        });
        ctx.say([
          ['AUNT MARGARINE', 'Now see here — I am going BLUE — why am I going ROUND —'],
          ['AUNT MARGARINE', 'I shall be writing to somebody about thiiiii—'],
          ['', 'She goes out through the window over the garden and keeps going, up, at a steady rate, getting smaller.']
        ]).then(() => ctx.win('A BLUEBERRY, GOING UP'));
      }
    });
    ctx.say([
      ['AUNT MARGARINE', 'Sit down. I have things to say about you and I intend to say all of them.']
    ]);
    return {
      solveNext() {
        return done ? null : { pos: aunt.position.clone().setY(1.4), spell: 'change', dist: 3.5 };
      },
      update(dt) {
        if (done) return;
        lineT -= dt;
        if (lineT <= 0 && lineI < LINES.length) {
          lineT = 6;
          UI.toast('', 0);
          ctx.say([['AUNT MARGARINE', LINES[lineI++]]]);
          rage++;
          R.kick(0.03 * rage, 0.3);
          // the room reacts: the glasses rattle
          AU.sfx('page');
        }
        ctx.tally('PATIENCE <b>' + Math.max(0, 5 - rage) + '</b>/5');
        ctx.goal(rage >= 2 ? 'CHANGE. Point it at her.' : 'Listen to her. For now.');
      }
    };
  }
},

/* ---------------------------------------------------------------- 25 --- */
{
  id: 'last', title: 'WAND AND BROOM', music: 'win', amb: 'wind', hp: 5,
  goal: 'Ten rings, six targets, one broom, and you never have to put it down again',
  gives: 'broom',
  fly: true, flyOpts: { bounds: 110, ceil: 50, floor: 2, cruise: 17, maxSpeed: 36 },
  text: 'You are allowed the broom at all times now. There is one more class, and it is both of ' +
        'them at once: fly the course and hit the marks while you are doing it. Then that is the ' +
        'year. For now.',
  after: 'THAT IS THE YEAR. There is a man with no nose out there somewhere getting his strength ' +
         'back, and a rat who owes somebody twelve years, and none of it is your problem until ' +
         'September. You win. FOR NOW.',
  setup(ctx) {
    const w = ctx.world;
    buildGrounds(w, { sky: 'dawn', trees: 34 });
    w.spawn.set(0, 8, 34);
    const gates = [];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU * 1.2;
      gates.push([Math.sin(a) * (30 + i * 3), 8 + Math.sin(i * 1.7) * 6 + i * 1.1, -Math.cos(a) * (30 + i * 3) + 6, a]);
    }
    const rings = modeRings(ctx, { gates, radius: 4, time: 130, winMsg: '' });
    // floating marks to shoot while you fly
    let marks = 0;
    const MARKN = 6;
    for (let i = 0; i < MARKN; i++) {
      const a = (i / MARKN) * TAU;
      const g = new THREE.Group();
      const o = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1, 1), glow(0xffd070, 1.3));
      g.add(o);
      const r1 = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.09, 8, 28), solid(0xc9a227, 0.3, 0.9));
      g.add(r1);
      const r2 = r1.clone(); r2.rotation.x = Math.PI / 2; g.add(r2);
      const l = new THREE.PointLight(0xffd070, 6, 16, 2); g.add(l);
      g.position.set(Math.cos(a) * 44, 12 + Math.sin(i * 2.1) * 8, Math.sin(a) * 44);
      w.group.add(g);
      ctx.targets.push({
        obj: g, r: 2.0, h: 0, tag: 'mark',
        onHit: () => {
          if (g.userData.done) return;
          g.userData.done = true;
          g.visible = false;
          marks++;
          AU.sfx('good');
          ctx.caster.fx.burst(g.position.clone(), 0xffd070, 40, 7, 0.13);
        }
      });
      w.update.push((dt, t) => { g.rotation.y += dt * 0.7; g.rotation.x += dt * 0.3; });
    }
    let ringsDone = false;
    const origWin = ctx.win;
    ctx.win = (msg) => { ringsDone = true; };     // the rings alone are not the end
    ctx.say([
      ['MADAM HOOP', 'Both at once. Rings and marks. Cast while you are moving — that is the whole trick of it.'],
      [FRIEND, 'And then that is the year. Go on.']
    ]);
    return {
      solveNext() {
        if (!ringsDone) { const g = rings.gates.find((q) => !q.done); if (g) return { goto: g.pos.clone() }; }
        const t = ctx.targets.find((q) => q.tag === 'mark' && !q.obj.userData.done);
        return t ? { pos: t.obj.position.clone(), spell: 'bolt', dist: 6 } : null;
      },
      update(dt) {
        rings.update(dt);
        ctx.tally('RINGS <b>' + (ringsDone ? 10 : Math.min(10, 10 - (rings.gates.filter((g) => !g.done).length))) + '</b>/10' +
          ' &middot; MARKS <b>' + marks + '</b>/' + MARKN);
        ctx.goal(ringsDone && marks < MARKN ? 'Now the marks' : (!ringsDone && marks >= MARKN ? 'Now the rings' : 'Rings and marks'));
        if (ringsDone && marks >= MARKN) {
          ctx.win = origWin;
          ctx.win('YOU WIN · FOR NOW');
        }
      }
    };
  }
}

];
