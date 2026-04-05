import * as THREE from 'three';
import { Engine, Materials, createTextPlane, addPointLight } from './engine.js';
import { buildHub } from './rooms/hub.js';
import { buildMirrorRoom } from './rooms/mirrorRoom.js';
import { buildPressureRoom } from './rooms/pressureRoom.js';
import { buildDecodeRoom } from './rooms/decodeRoom.js';
import { buildHub2 } from './rooms/level2/hub2.js';
import { buildEcosystemRoom } from './rooms/level2/ecosystemRoom.js';
import { buildCircuitRoom } from './rooms/level2/circuitRoom.js';
import { buildMapRoom } from './rooms/level2/mapRoom.js';
import { buildWordsRoom } from './rooms/level2/wordsRoom.js';
import { buildStarRoom } from './rooms/level2/starRoom.js';

// ─── Game State ───────────────────────────────────────────────────────
const gameState = {
  currentRoom: null,
  currentLevel: 1,
  completedRooms: new Set(),
  level1Complete: false,
  level2Complete: false
};

// ─── Game Setup ───────────────────────────────────────────────────────
const canvas = document.getElementById('game-canvas');
const engine = new Engine(canvas);

const loadingScreen = document.getElementById('loading-screen');
const loadingFill = document.getElementById('loading-fill');
const loadingText = document.getElementById('loading-text');
const startScreen = document.getElementById('start-screen');
const startBtn = document.getElementById('start-btn');

// ─── Build Rooms ──────────────────────────────────────────────────────
const rooms = {};
let hub, mirrorRoom, pressureRoom, decodeRoom;
let hub2, ecosystemRoom, circuitRoom, mapRoom, wordsRoom, starRoom;

function loadRooms() {
  try {
    loadingText.textContent = 'Building control room...';
    loadingFill.style.width = '10%';
    hub = buildHub(engine, gameState);
    rooms.hub = hub;

    loadingText.textContent = 'Calibrating mirrors...';
    loadingFill.style.width = '20%';
    mirrorRoom = buildMirrorRoom(engine, gameState);
    rooms.mirror = mirrorRoom;

    loadingText.textContent = 'Pressurizing chambers...';
    loadingFill.style.width = '30%';
    pressureRoom = buildPressureRoom(engine, gameState);
    rooms.pressure = pressureRoom;

    loadingText.textContent = 'Decrypting archives...';
    loadingFill.style.width = '40%';
    decodeRoom = buildDecodeRoom(engine, gameState);
    rooms.decode = decodeRoom;

    loadingText.textContent = 'Descending to the depths...';
    loadingFill.style.width = '50%';
    hub2 = buildHub2(engine, gameState);
    rooms.hub2 = hub2;

    loadingText.textContent = 'Growing ecosystems...';
    loadingFill.style.width = '60%';
    ecosystemRoom = buildEcosystemRoom(engine, gameState);
    rooms.ecosystem = ecosystemRoom;

    loadingText.textContent = 'Wiring circuits...';
    loadingFill.style.width = '70%';
    circuitRoom = buildCircuitRoom(engine, gameState);
    rooms.circuit = circuitRoom;

    loadingText.textContent = 'Charting maps...';
    loadingFill.style.width = '80%';
    mapRoom = buildMapRoom(engine, gameState);
    rooms.map = mapRoom;

    loadingText.textContent = 'Finding lost words...';
    loadingFill.style.width = '88%';
    wordsRoom = buildWordsRoom(engine, gameState);
    rooms.words = wordsRoom;

    loadingText.textContent = 'Aligning stars...';
    loadingFill.style.width = '95%';
    starRoom = buildStarRoom(engine, gameState);
    rooms.stars = starRoom;

    loadingText.textContent = 'Systems ready.';
    loadingFill.style.width = '100%';
  } catch (err) {
    console.error('Room build failed:', err);
    loadingText.textContent = `Error: ${err.message}`;
    loadingText.style.color = '#e63946';
    throw err;
  }
}

// ─── Room Transitions ─────────────────────────────────────────────────
function enterRoom(roomName) {
  if (gameState.currentRoom && rooms[gameState.currentRoom]) {
    const current = rooms[gameState.currentRoom];
    current.exit();
    engine.scene.remove(current.group);
    engine.clearParticles();
    engine.stopAmbient();
    engine.hideObjective();
    engine.hidePrompt();
  }

  const room = rooms[roomName];
  if (!room) return;

  gameState.currentRoom = roomName;
  engine.scene.add(room.group);
  room.enter();
}

// ─── Wire Doors: Level 1 ─────────────────────────────────────────────
function wireLevel1Doors() {
  hub.doors.mirror.onInteract = () => enterRoom('mirror');
  hub.doors.pressure.onInteract = () => enterRoom('pressure');
  hub.doors.archive.onInteract = () => {
    if (gameState.completedRooms.has('mirror') && gameState.completedRooms.has('pressure')) {
      enterRoom('decode');
    } else {
      engine.showObjective('Restore Mirror and Pressure systems first');
      setTimeout(() => engine.hideObjective(), 3000);
    }
  };

  mirrorRoom.doors.back.onInteract = () => {
    if (mirrorRoom.isComplete && !gameState.completedRooms.has('mirror')) {
      gameState.completedRooms.add('mirror');
      hub.onRoomComplete('mirror');
    }
    enterRoom('hub');
  };

  pressureRoom.doors.back.onInteract = () => {
    if (pressureRoom.isComplete && !gameState.completedRooms.has('pressure')) {
      gameState.completedRooms.add('pressure');
      hub.onRoomComplete('pressure');
    }
    enterRoom('hub');
  };

  decodeRoom.doors.back.onInteract = () => {
    if (decodeRoom.isComplete && !gameState.completedRooms.has('decode')) {
      gameState.completedRooms.add('decode');
      hub.onRoomComplete('archive');
    }
    enterRoom('hub');
  };
}

// ─── Wire Doors: Level 2 ─────────────────────────────────────────────
function wireLevel2Doors() {
  hub2.doors.ecosystem.onInteract = () => enterRoom('ecosystem');
  hub2.doors.circuit.onInteract = () => enterRoom('circuit');

  hub2.doors.map.onInteract = () => {
    if (gameState.completedRooms.has('ecosystem') && gameState.completedRooms.has('circuit')) {
      enterRoom('map');
    } else {
      engine.showObjective("Complete L'Écosystème and Le Circuit first");
      setTimeout(() => engine.hideObjective(), 3000);
    }
  };

  hub2.doors.words.onInteract = () => {
    if (gameState.completedRooms.has('map')) {
      enterRoom('words');
    } else {
      engine.showObjective('Complete La Carte first');
      setTimeout(() => engine.hideObjective(), 3000);
    }
  };

  hub2.doors.stars.onInteract = () => {
    if (gameState.completedRooms.has('ecosystem') &&
        gameState.completedRooms.has('circuit') &&
        gameState.completedRooms.has('map') &&
        gameState.completedRooms.has('words')) {
      enterRoom('stars');
    } else {
      engine.showObjective('Complete all four rooms to unlock La Chambre des Étoiles');
      setTimeout(() => engine.hideObjective(), 3000);
    }
  };

  hub2.doors.backToLevel1.onInteract = () => {
    gameState.currentLevel = 1;
    enterRoom('hub');
  };

  // Room doors → back to hub2
  ecosystemRoom.doors.back.onInteract = () => {
    if (ecosystemRoom.isComplete && !gameState.completedRooms.has('ecosystem')) {
      gameState.completedRooms.add('ecosystem');
      hub2.onRoomComplete('ecosystem');
    }
    enterRoom('hub2');
  };

  circuitRoom.doors.back.onInteract = () => {
    if (circuitRoom.isComplete && !gameState.completedRooms.has('circuit')) {
      gameState.completedRooms.add('circuit');
      hub2.onRoomComplete('circuit');
    }
    enterRoom('hub2');
  };

  mapRoom.doors.back.onInteract = () => {
    if (mapRoom.isComplete && !gameState.completedRooms.has('map')) {
      gameState.completedRooms.add('map');
      hub2.onRoomComplete('map');
    }
    enterRoom('hub2');
  };

  wordsRoom.doors.back.onInteract = () => {
    if (wordsRoom.isComplete && !gameState.completedRooms.has('words')) {
      gameState.completedRooms.add('words');
      hub2.onRoomComplete('words');
    }
    enterRoom('hub2');
  };

  starRoom.doors.back.onInteract = () => {
    if (starRoom.isComplete && !gameState.completedRooms.has('stars')) {
      gameState.completedRooms.add('stars');
      hub2.onRoomComplete('stars');
    }
    enterRoom('hub2');
  };
}

// ─── Level 2 Access Hatch ─────────────────────────────────────────────
let hatchAdded = false;

function addDescendHatch() {
  if (hatchAdded) return;
  hatchAdded = true;

  // Add a glowing hatch to the hub floor
  const hatchGroup = new THREE.Group();

  // Hatch ring
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.5, 0.7, 24),
    Materials.emissive(0x00e5cc, 3)
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(0, 0.02, 2);
  hatchGroup.add(ring);

  // Hatch grate
  const grate = new THREE.Mesh(
    new THREE.CircleGeometry(0.5, 24),
    new THREE.MeshStandardMaterial({
      color: 0x1a3a5c, roughness: 0.3, metalness: 0.8,
      emissive: 0x00e5cc, emissiveIntensity: 0.5
    })
  );
  grate.rotation.x = -Math.PI / 2;
  grate.position.set(0, 0.01, 2);
  hatchGroup.add(grate);

  // Label
  const label = createTextPlane('DESCENDRE / DESCEND', 1.2, 0.2, 14, '#00e5cc', 'rgba(0,0,0,0)');
  label.position.set(0, 0.15, 2);
  label.rotation.x = -0.3;
  hatchGroup.add(label);

  // Light below
  addPointLight(hatchGroup, new THREE.Vector3(0, -0.5, 2), 0x00e5cc, 2, 5);

  hub.group.add(hatchGroup);

  // Register as interactive
  engine.registerInteractive(grate, {
    type: 'click',
    prompt: 'Descend to Les Profondeurs',
    icon: '⬇️',
    onInteract: () => {
      engine.playEffect('powerup');
      gameState.currentLevel = 2;
      enterRoom('hub2');
    }
  });
}

// ─── Victory Checks ───────────────────────────────────────────────────
let level1VictoryShown = false;
let level2VictoryShown = false;

function checkLevel1Victory() {
  if (level1VictoryShown) return;
  if (!gameState.completedRooms.has('mirror') ||
      !gameState.completedRooms.has('pressure') ||
      !gameState.completedRooms.has('decode')) return;

  level1VictoryShown = true;
  gameState.level1Complete = true;

  setTimeout(() => {
    engine.showCompletion('LEVEL 1 COMPLETE');
    engine.playEffect('success');
    setTimeout(() => {
      engine.playEffect('powerup');
      engine.showNarrative('DESCEND TO THE DEPTHS', `
        <p class="emphasis">All three surface systems have been restored!</p>
        <p>The station's sensors have detected active research labs far below the ocean floor.
        Dr. Moreau's underwater laboratory awaits.</p>
        <p class="french">"Les profondeurs vous attendent. Descendez."</p>
        <br>
        <p class="emphasis">Level 2: Les Profondeurs is now unlocked.</p>
        <p>Look for the glowing hatch on the floor to descend.</p>
      `);
      addDescendHatch();
    }, 2000);
  }, 1000);
}

function checkLevel2Victory() {
  if (level2VictoryShown) return;
  if (!gameState.completedRooms.has('ecosystem') ||
      !gameState.completedRooms.has('circuit') ||
      !gameState.completedRooms.has('map') ||
      !gameState.completedRooms.has('words') ||
      !gameState.completedRooms.has('stars')) return;

  level2VictoryShown = true;
  gameState.level2Complete = true;

  setTimeout(() => {
    engine.showCompletion('LES PROFONDEURS — MISSION COMPLETE');
    engine.playEffect('success');
    setTimeout(() => {
      engine.playEffect('powerup');
      engine.showNarrative('RUINS DISCOVERED', `
        <p class="emphasis">The ancient ruins have been located!</p>
        <p>Your mastery of ecosystems, circuits, navigation, vocabulary, and stellar alignment
        has revealed coordinates hidden for centuries.</p>
        <p class="french">"Les ruines anciennes sont révélées. La connaissance triomphe."</p>
        <br>
        <p class="emphasis">Congratulations — you've completed Escape Engine!</p>
        <p>You balanced ecosystems, routed power circuits, navigated by compass,
        mastered vocabulary in context, and aligned the stars to unlock the deep.</p>
        <p class="french">Extraordinaire! Vous êtes un vrai explorateur!</p>
      `);
    }, 2000);
  }, 1000);
}

// ─── Game Loop ────────────────────────────────────────────────────────
function gameLoop() {
  requestAnimationFrame(gameLoop);

  const delta = engine.update();

  if (gameState.currentRoom && rooms[gameState.currentRoom]) {
    rooms[gameState.currentRoom].update(delta);
  }

  if (gameState.currentRoom === 'hub') checkLevel1Victory();
  if (gameState.currentRoom === 'hub2') checkLevel2Victory();
}

// ─── Init ─────────────────────────────────────────────────────────────
function init() {
  loadRooms();
  wireLevel1Doors();
  wireLevel2Doors();

  setTimeout(() => {
    loadingScreen.classList.add('hidden');
    startScreen.classList.remove('hidden');
  }, 800);

  startBtn.addEventListener('click', () => {
    startScreen.classList.add('hidden');
    engine.showHUD();
    engine._ensureAudio();
    enterRoom('hub');
    engine.lockControls();

    document.addEventListener('click', () => {
      if (!engine.isLocked && !engine.narrativeOpen && gameState.currentRoom) {
        engine.lockControls();
      }
    });
  });

  gameLoop();
}

init();
