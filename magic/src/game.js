/* ===========================================================================
   game.js - the shell. Title, the mirror where you build yourself, the board
   of chapters, and the runner that plays one.
   ========================================================================= */
import * as THREE from '../vendor/three.module.js';
import { $, R, IN, AU, UI, SAVE, showScreen, clamp, lerp, rnd, TAU, damp } from './core.js';
import { OPTIONS, buildAvatar, buildWand, poseIdle } from './avatar.js';
import { newWorld } from './world.js';
import { makePlayer, updateWalk, updateFly, updateCamera, CAM, wandTip, aimDir, mountBroom, dismount } from './player.js';
import { Caster, SPELLS, SPELL_ORDER } from './spells.js';
import { CHAPTERS } from './chapters.js';

let state = 'title';          // title | mirror | board | card | play | paused
let world = null, player = null, caster = null, ctx = null, mode = null, chapterIdx = 0;
let paused = false;
let ending = false;
let endTimer = null;

/* ============================================================= the mirror = */
const MIR = { renderer: null, scene: null, cam: null, av: null, yaw: 0.35, drag: false, lx: 0, spin: 0 };

function mirrorInit() {
  const cv = $('mirrorCv');
  MIR.renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
  MIR.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  MIR.renderer.shadowMap.enabled = true;
  MIR.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  MIR.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  MIR.renderer.outputColorSpace = THREE.SRGBColorSpace;
  MIR.scene = new THREE.Scene();
  MIR.scene.background = new THREE.Color(0x0a0912);
  MIR.cam = new THREE.PerspectiveCamera(32, 0.75, 0.1, 60);
  MIR.cam.position.set(0, 1.35, 4.6);
  MIR.cam.lookAt(0, 1.05, 0);
  const key = new THREE.SpotLight(0xffe0b0, 40, 14, 0.7, 0.5, 1.6);
  key.position.set(2.4, 4.4, 3.2);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  MIR.scene.add(key, key.target);
  const rim = new THREE.PointLight(0x6f9fff, 14, 12, 2);
  rim.position.set(-2.6, 2.2, -2.2);
  MIR.scene.add(rim);
  MIR.scene.add(new THREE.AmbientLight(0x394060, 1.4));
  const floor = new THREE.Mesh(new THREE.CircleGeometry(2.2, 40),
    new THREE.MeshStandardMaterial({ color: 0x1a1726, roughness: 0.4, metalness: 0.3 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  MIR.scene.add(floor);
  // a few motes so it feels like a room
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(120 * 3);
  for (let i = 0; i < 120; i++) { pos[i * 3] = rnd(-1.6, 1.6); pos[i * 3 + 1] = rnd(0.2, 3); pos[i * 3 + 2] = rnd(-1.6, 1.6); }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  MIR.scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffd9a0, size: 0.03, transparent: true, opacity: 0.7 })));

  const cvEl = cv;
  const down = (x) => { MIR.drag = true; MIR.lx = x; };
  const move = (x) => { if (MIR.drag) { MIR.yaw -= (x - MIR.lx) * 0.012; MIR.lx = x; } };
  const up = () => { MIR.drag = false; };
  cvEl.addEventListener('mousedown', (e) => down(e.clientX));
  window.addEventListener('mousemove', (e) => move(e.clientX));
  window.addEventListener('mouseup', up);
  cvEl.addEventListener('touchstart', (e) => { down(e.touches[0].clientX); e.preventDefault(); }, { passive: false });
  cvEl.addEventListener('touchmove', (e) => { move(e.touches[0].clientX); e.preventDefault(); }, { passive: false });
  cvEl.addEventListener('touchend', up);
}

function mirrorRefresh() {
  if (MIR.av) { MIR.scene.remove(MIR.av); }
  MIR.av = buildAvatar(SAVE.data.look, {});
  const w = buildWand(0);
  w.position.set(0, -0.02, 0.04);
  w.rotation.x = -0.4;
  MIR.av.userData.handR.add(w);
  MIR.scene.add(MIR.av);
  const it = OPTIONS.wear.items[SAVE.data.look.wear];
  const sillies = [];
  if (OPTIONS.skin.items[SAVE.data.look.skin].silly) sillies.push('green');
  if (OPTIONS.hair.items[SAVE.data.look.hair].silly) sillies.push('a nest');
  if (OPTIONS.hairCol.items[SAVE.data.look.hairCol].silly) sillies.push('every colour');
  if (OPTIONS.eyes.items[SAVE.data.look.eyes].silly) sillies.push('odd eyes');
  if (it.silly) sillies.push('a chicken');
  $('mirrorPlate').textContent = sillies.length
    ? (SAVE.data.look.name || 'YOU') + ' · ' + sillies.join(', ').toUpperCase()
    : (SAVE.data.look.name || 'YOU') + ' · DRAG TO TURN';
}

function mirrorSize() {
  const cv = $('mirrorCv');
  const r = cv.parentElement.getBoundingClientRect();
  if (r.width < 4) return;
  MIR.renderer.setSize(r.width, r.height, false);
  MIR.cam.aspect = r.width / r.height;
  MIR.cam.updateProjectionMatrix();
}

function buildOptionsUI() {
  const list = $('optList');
  list.innerHTML = '';
  const nameWrap = document.createElement('div');
  nameWrap.className = 'opt';
  nameWrap.innerHTML = '<h3>Your name</h3>';
  const nb = document.createElement('input');
  nb.className = 'namebox'; nb.maxLength = 12; nb.value = SAVE.data.look.name || 'ALEX';
  nb.addEventListener('input', () => {
    SAVE.data.look.name = nb.value.toUpperCase().slice(0, 12) || 'YOU';
    mirrorRefresh();
  });
  nameWrap.appendChild(nb);
  list.appendChild(nameWrap);

  Object.keys(OPTIONS).forEach((key) => {
    const O = OPTIONS[key];
    const wrap = document.createElement('div');
    wrap.className = 'opt';
    wrap.innerHTML = '<h3>' + O.label + '</h3>';
    const row = document.createElement('div');
    row.className = O.kind === 'swatch' ? 'swatches' : 'chips';
    O.items.forEach((it, i) => {
      let el;
      if (O.kind === 'swatch') {
        el = document.createElement('div');
        el.className = 'sw' + (SAVE.data.look[key] === i ? ' on' : '');
        el.style.background = it.odd
          ? 'linear-gradient(90deg,#' + it.col.toString(16).padStart(6, '0') + ' 50%,#' + it.odd.toString(16).padStart(6, '0') + ' 50%)'
          : (it.silly && key === 'hairCol'
            ? 'conic-gradient(#ff3b30,#ff9500,#ffcc00,#34c759,#00a2ff,#5856d6,#af52de,#ff3b30)'
            : '#' + it.col.toString(16).padStart(6, '0'));
        el.title = it.name;
      } else {
        el = document.createElement('button');
        el.className = 'chip' + (SAVE.data.look[key] === i ? ' on' : '') + (it.silly ? ' silly' : '');
        el.textContent = it.name;
      }
      el.addEventListener('click', () => {
        SAVE.data.look[key] = i;
        SAVE.save();
        buildOptionsUI();
        mirrorRefresh();
        AU.init(); AU.resume(); AU.sfx('ui');
      });
      row.appendChild(el);
    });
    wrap.appendChild(row);
    list.appendChild(wrap);
  });
}

/* ============================================================== the board = */
function buildBoard() {
  const b = $('board');
  b.innerHTML = '';
  CHAPTERS.forEach((ch, i) => {
    const done = SAVE.data.done.indexOf(ch.id) >= 0;
    const open = i === 0 || done || SAVE.data.done.indexOf(CHAPTERS[i - 1].id) >= 0;
    const el = document.createElement('button');
    el.className = 'ch' + (done ? ' done' : '') + (!done && open ? ' now' : '') + (open ? '' : ' locked');
    el.innerHTML = '<b>' + (i + 1) + '. ' + ch.title + '</b><i>' + (done ? 'DONE' : open ? 'OPEN' : 'LOCKED') + '</i>';
    if (open) el.addEventListener('click', () => { AU.sfx('ui'); openCard(i); });
    b.appendChild(el);
  });
  const doneN = SAVE.data.done.length;
  $('boardNote').textContent = doneN + ' of ' + CHAPTERS.length + ' chapters · ' +
    SAVE.data.spells.length + ' spells · ' + (SAVE.data.broom ? 'broom in hand' : 'no broom yet');
  $('boardKick').textContent = (SAVE.data.look.name || 'YOU') + '’S YEAR';
}

function firstUndone() {
  for (let i = 0; i < CHAPTERS.length; i++) if (SAVE.data.done.indexOf(CHAPTERS[i].id) < 0) return i;
  return CHAPTERS.length - 1;
}

/* ============================================================== the card = */
let cardMode = 'intro';
function openCard(i, outro) {
  chapterIdx = i;
  const ch = CHAPTERS[i];
  cardMode = outro || 'intro';
  $('cardKick').textContent = 'CHAPTER ' + (i + 1) + ' OF ' + CHAPTERS.length;
  $('cardTitle').textContent = ch.title;
  const learn = $('cardLearn');
  if (cardMode === 'intro') {
    $('cardText').textContent = ch.text;
    learn.style.display = 'none';
    $('cardGo').textContent = 'GO';
  } else if (cardMode === 'won') {
    $('cardText').textContent = ch.after || 'Done.';
    if (ch.learn) {
      const S = SPELLS[ch.learn];
      learn.style.display = 'block';
      learn.querySelector('.g').textContent = S.glyph;
      learn.querySelector('b').textContent = S.name;
      learn.querySelector('span').textContent = S.words;
    } else learn.style.display = 'none';
    $('cardGo').textContent = i + 1 < CHAPTERS.length ? 'NEXT CHAPTER' : 'THE YEAR';
  } else {
    $('cardText').textContent = ch.failText || 'That did not go well. Try it again.';
    learn.style.display = 'none';
    $('cardGo').textContent = 'TRY AGAIN';
  }
  state = 'card';
  showScreen('cardScreen');
}

/* ============================================================ the runner = */
function teardown() {
  if (mode && mode.dispose) mode.dispose();
  if (world) {
    R.dispose(world.group);
    if (R.scene) R.scene.remove(world.group);
  }
  world = null; player = null; caster = null; ctx = null; mode = null;
  UI.clearSay();
  UI.tally('');
  UI.hearts(0, 0);
  UI.castBar(null);
  UI.spellbar([], -1);
  AU.stopMusic();
  AU.stopAmbience();
}

let activeSpell = 0;
let spellList = [];

function startChapter(i) {
  if (endTimer) { clearTimeout(endTimer); endTimer = null; }
  teardown();
  ending = false;
  chapterIdx = i;
  const ch = CHAPTERS[i];
  const scene = new THREE.Scene();
  R.setScene(scene);
  world = newWorld();
  scene.add(world.group);

  ctx = {
    world, chapter: ch, targets: [], t: 0,
    goal: (s) => UI.goal(s),
    tally: (s) => UI.tally(s),
    toast: (s, t2) => UI.toast(s, t2),
    say: (lines) => UI.say(lines),
    win: (msg) => finish(true, msg),
    lose: (msg) => finish(false, msg),
    THREE
  };

  player = makePlayer(world, SAVE.data.look, { hp: ch.hp || 5, wand: SAVE.data.wand || 0 });
  ctx.player = player;
  caster = new Caster(ctx);
  ctx.caster = caster;
  if (ch.light) caster.lightOn = true;

  // now the chapter builds its world and hands back a mode
  const built = ch.setup(ctx) || {};
  if (world.fog) scene.fog = world.fog;
  if (world.bg) scene.background = world.bg;

  player.pos.copy(world.spawn);
  player.yaw = world.spawnYaw || 0;
  player.root.position.copy(player.pos);
  player.hp = player.maxHp = ch.hp || 5;
  CAM.reset(world.spawnYaw || 0);

  mode = built.update ? built : (built.mode || null);
  ctx.mode = mode;

  // what you can cast in here: what the chapter says, or everything you know
  // plus whatever it is about to teach you
  const pool = ch.spells || SAVE.data.spells.concat(ch.learn ? [ch.learn] : []);
  spellList = [];
  SPELL_ORDER.forEach((id) => { if (pool.indexOf(id) >= 0 && SPELLS[id]) spellList.push(id); });
  activeSpell = 0;
  UI.spellbar(spellList.map((s) => SPELLS[s]), 0);
  wireSlots();

  UI.chapter('CHAPTER ' + (i + 1) + ' · ' + ch.title, ch.goal || '');
  if (ch.hp) UI.hearts(player.hp, player.maxHp);
  AU.init(); AU.resume();
  AU.setMusic(ch.music || 'school');
  AU.setAmbience(ch.amb || null);
  if (ch.fly) mountBroom(player);

  state = 'play';
  paused = false;
  showScreen(null);
}
function wireSlots() {
  $('spellbar').querySelectorAll('.slot').forEach((el) => {
    el.onclick = (e) => {
      activeSpell = +el.dataset.i;
      UI.spellbar(spellList.map((s) => SPELLS[s]), activeSpell);
      wireSlots();
      AU.sfx('ui');
      e.stopPropagation();
    };
  });
}

function finish(won, msg) {
  if (ending) return;
  ending = true;
  const ch = CHAPTERS[chapterIdx];
  if (won) {
    AU.sfx('win');
    UI.toast(msg || 'DONE', 2.2);
    if (ch.learn) SAVE.learn(ch.learn);
    if (ch.gives === 'broom') { SAVE.data.broom = true; }
    SAVE.finish(ch.id);
    SAVE.data.chapter = Math.max(SAVE.data.chapter, chapterIdx + 1);
    SAVE.save();
  } else {
    AU.sfx('lose');
    UI.toast(msg || 'NOT THIS TIME', 2.2);
    SAVE.data.deaths++;
    SAVE.save();
  }
  const mine = chapterIdx;
  endTimer = setTimeout(() => {
    endTimer = null;
    teardown();
    openCard(mine, won ? 'won' : 'lost');
  }, won ? 2100 : 1800);
}

/* ============================================================== the loop = */
function tryCast() {
  if (!caster || !player || state !== 'play' || paused) return;
  if (UI.talking()) { UI.advance(); return; }
  if (!spellList.length) return;
  const id = spellList[activeSpell];
  const from = wandTip(player, new THREE.Vector3());
  const dir = aimDir(new THREE.Vector3());
  const shot = caster.cast(id, from, dir);
  if (shot) {
    player.castT = 0.42;
    if (ctx.mode && ctx.mode.onCast) ctx.mode.onCast(id, shot);
    if (ctx.onCast) ctx.onCast(id, shot);
  }
}

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, R.clock.getDelta());
  R.elapsed += dt;
  R.frame++;

  if (state === 'mirror') {
    if (!MIR.drag) MIR.yaw += dt * 0.25;
    if (MIR.av) {
      MIR.av.rotation.y = MIR.yaw;
      poseIdle(MIR.av, R.elapsed);
    }
    mirrorSize();
    MIR.renderer.render(MIR.scene, MIR.cam);
    IN.endFrame();
    return;
  }

  if (state === 'play' && !paused && player && ctx) {
    ctx.t += dt;
    if (IN.takeCast()) tryCast();
    for (let k = 1; k <= 9; k++) {
      if (IN.down[String(k)] && spellList[k - 1]) {
        activeSpell = k - 1;
        UI.spellbar(spellList.map((s) => SPELLS[s]), activeSpell);
        wireSlots();
        AU.sfx('ui');
      }
    }
    const opt = CHAPTERS[chapterIdx].walkOpts || {};
    if (player.mode === 'fly') {
      updateFly(player, dt, world, CHAPTERS[chapterIdx].flyOpts || {});
      updateCamera(player, dt, world, { dist: 7.4, height: 1.2, noClip: true, minPitch: -0.8, maxPitch: 0.9 });
    } else {
      updateWalk(player, dt, world, opt);
      updateCamera(player, dt, world, CHAPTERS[chapterIdx].camOpts || {});
    }
    caster.update(dt);
    world.update.forEach((f) => f(dt, R.elapsed));
    if (mode && mode.update) mode.update(dt);
    if (CHAPTERS[chapterIdx].hp) UI.hearts(player.hp, player.maxHp);
    R.applyShake(dt);
  } else if (state === 'play' && paused && world) {
    // frozen, but keep the candles moving so it does not look dead
    world.update.forEach((f) => f(0, R.elapsed));
  }

  UI.tickToast(dt);
  R.render();
  IN.endFrame();
}

/* =============================================================== wiring = */
function wire() {
  $('beginBtn').addEventListener('click', () => {
    AU.init(); AU.resume(); AU.sfx('ui');
    state = 'mirror';
    showScreen('make');
    buildOptionsUI();
    mirrorRefresh();
    setTimeout(mirrorSize, 30);
  });
  $('continueBtn').addEventListener('click', () => {
    AU.init(); AU.resume(); AU.sfx('ui');
    if (!SAVE.data.made) { $('beginBtn').click(); return; }
    state = 'board';
    buildBoard();
    showScreen('boardScreen');
  });
  $('diceBtn').addEventListener('click', () => {
    const L = SAVE.data.look;
    L.skin = Math.floor(Math.random() * OPTIONS.skin.items.length);
    L.hair = Math.floor(Math.random() * OPTIONS.hair.items.length);
    L.hairCol = Math.floor(Math.random() * OPTIONS.hairCol.items.length);
    L.eyes = Math.floor(Math.random() * OPTIONS.eyes.items.length);
    L.wear = Math.floor(Math.random() * OPTIONS.wear.items.length);
    SAVE.save();
    buildOptionsUI();
    mirrorRefresh();
    AU.sfx('ui');
  });
  $('enterBtn').addEventListener('click', () => {
    AU.init(); AU.resume(); AU.sfx('unlock');
    SAVE.data.made = true;
    SAVE.save();
    state = 'board';
    buildBoard();
    showScreen('boardScreen');
  });
  $('mirrorBtn').addEventListener('click', () => {
    AU.sfx('ui');
    state = 'mirror';
    showScreen('make');
    buildOptionsUI();
    mirrorRefresh();
    setTimeout(mirrorSize, 30);
  });
  $('nextChBtn').addEventListener('click', () => { AU.sfx('ui'); openCard(firstUndone()); });
  $('wipeBtn').addEventListener('click', () => {
    if (!confirm('Start the whole year again? Everything goes: chapters, spells, broom.')) return;
    SAVE.wipe();
    buildBoard();
    state = 'title';
    showScreen('titleScreen');
    refreshTitle();
  });
  $('cardGo').addEventListener('click', () => {
    AU.sfx('ui');
    if (cardMode === 'intro' || cardMode === 'lost') startChapter(chapterIdx);
    else {
      const next = chapterIdx + 1;
      if (next < CHAPTERS.length) openCard(next);
      else { state = 'board'; buildBoard(); showScreen('boardScreen'); }
    }
  });
  $('cardBoard').addEventListener('click', () => {
    AU.sfx('ui');
    state = 'board'; buildBoard(); showScreen('boardScreen');
  });
  $('resumeBtn').addEventListener('click', () => { AU.sfx('ui'); paused = false; state = 'play'; showScreen(null); });
  $('retryBtn').addEventListener('click', () => { AU.sfx('ui'); startChapter(chapterIdx); });
  $('quitBtn').addEventListener('click', () => {
    AU.sfx('ui');
    teardown();
    state = 'board'; buildBoard(); showScreen('boardScreen');
  });
  const togglePause = () => {
    if (state !== 'play') return;
    paused = !paused;
    if (paused) { showScreen('pauseScreen'); $('pauseHint').textContent = CHAPTERS[chapterIdx].goal || ''; }
    else showScreen(null);
  };
  $('pauseBtn').addEventListener('click', (e) => { togglePause(); e.stopPropagation(); });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') togglePause();
  });
}

function refreshTitle() {
  const d = SAVE.data;
  $('saveNote').textContent = d.made
    ? d.look.name + ' · ' + d.done.length + '/' + CHAPTERS.length + ' CHAPTERS · ' + d.spells.length + ' SPELLS'
    : 'NOTHING SAVED YET';
  $('continueBtn').style.display = d.made ? '' : 'none';
}

/* ================================================================ start = */
export async function start() {
  SAVE.load();
  R.init();
  IN.init();
  mirrorInit();
  wire();
  refreshTitle();
  state = 'title';
  showScreen('titleScreen');
  // a dark scene behind the title, so the page is never an empty black box
  const s = new THREE.Scene();
  s.background = new THREE.Color(0x07060c);
  R.setScene(s);
  R.clock.start();
  requestAnimationFrame(frame);

  /* a way to drive the whole thing without hands, for testing */
  window.__magic = {
    THREE,
    save: () => SAVE.data,
    state: () => state,
    chapters: () => CHAPTERS.map((c) => ({ id: c.id, title: c.title, learn: c.learn })),
    go(i) { startChapter(i); },
    openCard(i) { openCard(i); },
    board() { state = 'board'; buildBoard(); showScreen('boardScreen'); },
    mirror() { state = 'mirror'; showScreen('make'); buildOptionsUI(); mirrorRefresh(); mirrorSize(); },
    setLook(l) { Object.assign(SAVE.data.look, l); SAVE.save(); if (state === 'mirror') { buildOptionsUI(); mirrorRefresh(); } },
    ctx: () => ctx,
    player: () => player,
    mode: () => mode,
    world: () => world,
    caster: () => caster,
    spells: () => spellList,
    pickSpell(id) { const i = spellList.indexOf(id); if (i >= 0) { activeSpell = i; UI.spellbar(spellList.map((s) => SPELLS[s]), i); } return i >= 0; },
    castAt(x, y, z) {
      if (!caster || !player) return false;
      const from = wandTip(player, new THREE.Vector3());
      const dir = new THREE.Vector3(x, y, z).sub(from).normalize();
      caster.cool = 0;
      return !!caster.cast(spellList[activeSpell], from, dir);
    },
    castFwd() {
      if (!caster || !player) return false;
      caster.cool = 0;
      const from = wandTip(player, new THREE.Vector3());
      const dir = aimDir(new THREE.Vector3());
      return !!caster.cast(spellList[activeSpell], from, dir);
    },
    tp(x, y, z) { if (player) { player.pos.set(x, y, z); player.root.position.copy(player.pos); } },
    faceAt(x, y, z) {
      if (!player) return;
      const dx = x - player.pos.x, dz = z - player.pos.z;
      CAM.yaw = Math.atan2(-dx, -dz);
      CAM.pitch = -Math.atan2((y - (player.pos.y + 1.4)), Math.hypot(dx, dz));
      player.yaw = Math.atan2(dx, dz);
    },
    step(n) {
      for (let i = 0; i < (n || 1); i++) {
        const dt = 1 / 60;
        R.elapsed += dt;
        if (state === 'play' && !paused) {
          ctx.t += dt;
          if (player.mode === 'fly') updateFly(player, dt, world, CHAPTERS[chapterIdx].flyOpts || {});
          else updateWalk(player, dt, world, CHAPTERS[chapterIdx].walkOpts || {});
          caster.update(dt);
          world.update.forEach((f) => f(dt, R.elapsed));
          if (mode && mode.update) mode.update(dt);
        }
      }
    },
    say() { return UI.talking(); },
    advance() { UI.advance(); },
    skipTalk() { let n = 0; while (UI.talking() && n < 60) { UI.advance(); n++; } return n; },
    finish(won) { finish(won); },
    hearts() { return player ? player.hp : -1; },
    wipe() { SAVE.wipe(); }
  };
}
