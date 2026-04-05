import * as THREE from 'three';
import { Engine, Materials, createRoom, createDoor, createTextPlane, addSpotlight, addPointLight } from '../engine.js';

// ─── Hub: Salle de Controle ──────────────────────────────────────────
// The central control room of Station Lumiere. Players start here and
// return between wings. Three doors lead to the puzzle rooms; a status
// board tracks progress; a logbook establishes the narrative.

const ROOM_W = 12;
const ROOM_H = 5;
const ROOM_D = 10;

// ── Logbook HTML ─────────────────────────────────────────────────────
const LOGBOOK_HTML = `
<p style="color:#e6a44c;font-family:'Courier New',monospace;font-size:0.85em;margin-bottom:0.6em;">
  STATION LUMIERE &mdash; EMERGENCY LOG<br>
  Chief Engineer Adaeze Okafor<br>
  Entry #247 &mdash; 03:18 UTC
</p>

<p>If you are reading this, the station is still standing. That is more than I
expected when the lights went out.</p>

<p>It started at 02:41. A deep shudder ran through the hull &mdash; the kind you
feel in your teeth. Then every screen went dark. <em>Panne totale.</em> Total
failure. The backup generators should have kicked in, but they didn't. Nothing
did.</p>

<p>Our Franco-American team had been running Station Lumi&egrave;re for eleven
months without a single critical fault. Dr. Moreau always said,
<em>&laquo;&nbsp;La mer pardonne rarement&nbsp;&raquo;</em> &mdash; the sea
rarely forgives. I used to think she was being dramatic. I don't anymore.</p>

<p>I have isolated the problem to three core systems:</p>

<ol style="margin:0.5em 0 0.5em 1.2em;line-height:1.6;">
  <li><strong>Le Miroir</strong> &mdash; The optical calibration array in the
  Mirror Room. Its alignment grid controls the station's navigation sensors. If
  we can't see where we are, <em>on est perdus</em> &mdash; we're lost.</li>

  <li><strong>La Pression</strong> &mdash; The pressure regulation system.
  The valves in the Pressure Room keep our hull from cracking under the
  Atlantic. Without them, we are living on borrowed time.</li>

  <li><strong>Les Archives</strong> &mdash; The station's central data core.
  Locked behind a security door that only opens once navigation and hull
  integrity are restored. All of our research &mdash; <em>toutes nos
  donn&eacute;es</em> &mdash; is in there.</li>
</ol>

<p>I have rerouted what little emergency power remains to keep the control room
alive. The status board above this console will tell you which systems are
online. Restore the Mirror Room and the Pressure Room first &mdash; only then
will the Archive door unseal.</p>

<p><em>Bonne chance.</em> And please &mdash; work quickly. The sea does not
wait.</p>

<p style="color:#667;font-size:0.8em;margin-top:1em;">
  &mdash; A. Okafor, Ing&eacute;nieure en chef<br>
  Station Lumi&egrave;re, Atlantique Nord
</p>
`;

// ─────────────────────────────────────────────────────────────────────
export function buildHub(engine, gameState) {
  const group = new THREE.Group();

  // Track animation state
  let elapsed = 0;
  const blinkTimers = { a: 0, b: 0, c: 0 };
  const indicators = {};       // populated below
  let archiveDoorRef = null;   // populated below
  let archiveUnlocked = false;
  let archiveDoorOpenT = 0;    // 0 = closed, 1 = open

  // ── Room shell ───────────────────────────────────────────────────
  const room = createRoom(
    ROOM_W, ROOM_H, ROOM_D,
    Materials.wall(0x12283e),
    Materials.floor(0x0b1520),
    Materials.ceiling(0x10223a)
  );
  group.add(room.group);

  // ── Floor grid lines (subtle) ────────────────────────────────────
  const gridGroup = new THREE.Group();
  const gridMat = new THREE.LineBasicMaterial({ color: 0x1a3050, transparent: true, opacity: 0.5 });
  for (let x = -ROOM_W / 2; x <= ROOM_W / 2; x += 1) {
    const pts = [new THREE.Vector3(x, 0.005, -ROOM_D / 2), new THREE.Vector3(x, 0.005, ROOM_D / 2)];
    gridGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gridMat));
  }
  for (let z = -ROOM_D / 2; z <= ROOM_D / 2; z += 1) {
    const pts = [new THREE.Vector3(-ROOM_W / 2, 0.005, z), new THREE.Vector3(ROOM_W / 2, 0.005, z)];
    gridGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gridMat));
  }
  group.add(gridGroup);

  // ── Central Console ──────────────────────────────────────────────
  const consoleGroup = new THREE.Group();
  consoleGroup.position.set(0, 0, -1.5);

  // Base
  const baseMat = Materials.metal(0x2a3a4a);
  const base = new THREE.Mesh(new THREE.BoxGeometry(3, 0.9, 1.2), baseMat);
  base.position.y = 0.45;
  base.castShadow = true;
  base.receiveShadow = true;
  consoleGroup.add(base);

  // Angled top surface
  const topShape = new THREE.Shape();
  topShape.moveTo(-1.5, 0);
  topShape.lineTo(1.5, 0);
  topShape.lineTo(1.5, 1.2);
  topShape.lineTo(-1.5, 1.2);
  topShape.lineTo(-1.5, 0);
  const topGeo = new THREE.BoxGeometry(3, 0.08, 1.2);
  const topPanel = new THREE.Mesh(topGeo, Materials.metal(0x3a4a5a));
  topPanel.position.set(0, 0.94, 0);
  topPanel.rotation.x = -0.25;
  consoleGroup.add(topPanel);

  // Screen on console (dark, with faint glow)
  const screenGeo = new THREE.PlaneGeometry(2.0, 0.6);
  const screenMat = Materials.screen(0x0a1a30);
  const screen = new THREE.Mesh(screenGeo, screenMat);
  screen.position.set(0, 1.15, -0.15);
  screen.rotation.x = -0.25;
  consoleGroup.add(screen);

  // ── Status Board (on the wall above console) ─────────────────────
  const boardGroup = new THREE.Group();
  boardGroup.position.set(0, 2.8, -ROOM_D / 2 + 0.06);

  // Board backing
  const boardBack = new THREE.Mesh(
    new THREE.BoxGeometry(3.2, 1.4, 0.08),
    Materials.metal(0x1a2a3a)
  );
  boardGroup.add(boardBack);

  // Title
  const boardTitle = createTextPlane('ETAT DES SYSTEMES / SYSTEM STATUS', 3.0, 0.25, 16, '#7eaacc', 'rgba(0,0,0,0)');
  boardTitle.position.set(0, 0.5, 0.05);
  boardGroup.add(boardTitle);

  // Three indicator rows
  const indicatorData = [
    { key: 'mirror',   label: 'A: LE MIROIR',    room: 'mirror',   x: -0.9 },
    { key: 'pressure', label: 'B: LA PRESSION',   room: 'pressure', x:  0.0 },
    { key: 'archive',  label: 'C: LES ARCHIVES',  room: 'archive',  x:  0.9 },
  ];

  for (const ind of indicatorData) {
    const indGroup = new THREE.Group();
    indGroup.position.set(ind.x, 0, 0.05);

    // Label
    const lbl = createTextPlane(ind.label, 0.7, 0.2, 12, '#8899aa', 'rgba(0,0,0,0)');
    lbl.position.set(0, 0.1, 0);
    indGroup.add(lbl);

    // Indicator light (sphere)
    const isComplete = gameState.completedRooms.has(ind.room);
    const lightMat = isComplete ? Materials.emissiveOk(0x2a9d8f, 3) : Materials.emissiveWarn(0xe63946, 3);
    const lightMesh = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 16), lightMat);
    lightMesh.position.set(0, -0.18, 0.02);
    indGroup.add(lightMesh);

    // Outer ring
    const ringMesh = new THREE.Mesh(
      new THREE.RingGeometry(0.1, 0.13, 24),
      Materials.metal(0x556677)
    );
    ringMesh.position.set(0, -0.18, 0.03);
    indGroup.add(ringMesh);

    indicators[ind.key] = { group: indGroup, lightMesh, lightMat, complete: isComplete };
    boardGroup.add(indGroup);
  }

  group.add(boardGroup);
  group.add(consoleGroup);

  // ── Logbook on the console ───────────────────────────────────────
  const logbookGroup = new THREE.Group();

  // Book body
  const bookGeo = new THREE.BoxGeometry(0.35, 0.04, 0.5);
  const bookMat = new THREE.MeshStandardMaterial({ color: 0x3a2518, roughness: 0.9, metalness: 0.0 });
  const book = new THREE.Mesh(bookGeo, bookMat);
  book.castShadow = true;
  logbookGroup.add(book);

  // Page surface
  const pageGeo = new THREE.PlaneGeometry(0.3, 0.44);
  const pageMat = new THREE.MeshStandardMaterial({ color: 0xd4c9a8, roughness: 1.0, metalness: 0.0 });
  const page = new THREE.Mesh(pageGeo, pageMat);
  page.position.set(0, 0.025, 0);
  page.rotation.x = -Math.PI / 2;
  logbookGroup.add(page);

  // Small emissive marker (so player notices it)
  const markerGeo = new THREE.BoxGeometry(0.36, 0.005, 0.01);
  const markerMat = Materials.emissive(0x4ecdc4, 1.5);
  const marker = new THREE.Mesh(markerGeo, markerMat);
  marker.position.set(0, 0.025, -0.24);
  logbookGroup.add(marker);

  logbookGroup.position.set(0.9, 0.98, -1.5);
  logbookGroup.rotation.y = -0.15;
  group.add(logbookGroup);

  // Register logbook as interactive
  engine.registerInteractive(book, {
    type: 'click',
    prompt: 'Read Logbook / Lire le journal',
    icon: '\u{1F4D6}',
    onInteract: () => {
      engine.playEffect('click');
      engine.showNarrative('Emergency Log / Journal de bord', LOGBOOK_HTML);
    }
  });

  // ── Doors ────────────────────────────────────────────────────────
  // Door A: Le Miroir (left wall)
  const doorA = createDoor(1.2, 2.4, 0x2a4a6a);
  doorA.group.position.set(-ROOM_W / 2 + 0.04, 0, -1.5);
  doorA.group.rotation.y = Math.PI / 2;
  // Set status light green if complete
  if (gameState.completedRooms.has('mirror')) {
    doorA.statusLight.material = Materials.emissiveOk(0x2a9d8f, 3);
  } else {
    doorA.statusLight.material = Materials.emissive(0x4ecdc4, 2);
  }
  group.add(doorA.group);

  // Door A label
  const labelA = createTextPlane('A: LE MIROIR / THE MIRROR', 1.0, 0.2, 14, '#4ecdc4', 'rgba(10,22,40,0.85)');
  labelA.position.set(-ROOM_W / 2 + 0.06, 2.75, -1.5);
  labelA.rotation.y = Math.PI / 2;
  group.add(labelA);

  // Door B: La Pression (right wall)
  const doorB = createDoor(1.2, 2.4, 0x2a4a6a);
  doorB.group.position.set(ROOM_W / 2 - 0.04, 0, -1.5);
  doorB.group.rotation.y = -Math.PI / 2;
  if (gameState.completedRooms.has('pressure')) {
    doorB.statusLight.material = Materials.emissiveOk(0x2a9d8f, 3);
  } else {
    doorB.statusLight.material = Materials.emissive(0x4ecdc4, 2);
  }
  group.add(doorB.group);

  // Door B label
  const labelB = createTextPlane('B: LA PRESSION / THE PRESSURE ROOM', 1.2, 0.2, 14, '#4ecdc4', 'rgba(10,22,40,0.85)');
  labelB.position.set(ROOM_W / 2 - 0.06, 2.75, -1.5);
  labelB.rotation.y = -Math.PI / 2;
  group.add(labelB);

  // Door C: Les Archives (back wall, center)
  const doorC = createDoor(1.4, 2.6, 0x1e3048);
  doorC.group.position.set(0, 0, -ROOM_D / 2 + 0.04);
  archiveDoorRef = doorC;

  // Archive door is locked until A+B complete
  const bothComplete = gameState.completedRooms.has('mirror') && gameState.completedRooms.has('pressure');
  if (bothComplete) {
    archiveUnlocked = true;
    archiveDoorOpenT = 1;
    doorC.statusLight.material = Materials.emissiveOk(0x2a9d8f, 3);
    doorC.doorPanel.position.x = -1.0; // slid open
  } else {
    doorC.statusLight.material = Materials.emissiveWarn(0xe63946, 3);
  }
  group.add(doorC.group);

  // Door C label
  const labelC = createTextPlane('C: LES ARCHIVES / THE ARCHIVE', 1.2, 0.2, 14, '#e63946', 'rgba(10,22,40,0.85)');
  labelC.position.set(0, 3.1, -ROOM_D / 2 + 0.06);
  group.add(labelC);

  // Archive lock label (changes dynamically)
  const lockLabel = createTextPlane(
    bothComplete ? 'DEVERROUILLE / UNLOCKED' : 'VERROUILLE / LOCKED',
    1.0, 0.15, 12,
    bothComplete ? '#2a9d8f' : '#e63946',
    'rgba(10,22,40,0.85)'
  );
  lockLabel.position.set(0, 2.85, -ROOM_D / 2 + 0.06);
  group.add(lockLabel);

  // Heavy lock bars on archive door (visual reinforcement)
  const lockBarMat = Materials.metal(0x44556a);
  const lockBars = [];
  for (let i = 0; i < 2; i++) {
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 0.06, 0.06),
      lockBarMat
    );
    bar.position.set(0, 0.8 + i * 0.9, -ROOM_D / 2 + 0.12);
    bar.castShadow = true;
    group.add(bar);
    lockBars.push(bar);
  }

  if (bothComplete) {
    lockBars.forEach(b => { b.visible = false; });
  }

  // Register door interactives
  engine.registerInteractive(doorA.doorPanel, {
    type: 'click',
    prompt: 'Enter Le Miroir / The Mirror Room',
    icon: '\u{1F6AA}',
    onInteract: () => {
      engine.playEffect('clunk');
      doors.mirror.onInteract();
    }
  });

  engine.registerInteractive(doorB.doorPanel, {
    type: 'click',
    prompt: 'Enter La Pression / The Pressure Room',
    icon: '\u{1F6AA}',
    onInteract: () => {
      engine.playEffect('clunk');
      doors.pressure.onInteract();
    }
  });

  engine.registerInteractive(doorC.doorPanel, {
    type: 'click',
    prompt: archiveUnlocked
      ? 'Enter Les Archives / The Archive'
      : 'Locked \u2014 Restore Mirror & Pressure first',
    icon: archiveUnlocked ? '\u{1F6AA}' : '\u{1F512}',
    onInteract: () => {
      if (archiveUnlocked) {
        engine.playEffect('clunk');
        doors.archive.onInteract();
      } else {
        engine.playEffect('click');
        engine.showObjective('Restore Le Miroir and La Pression to unlock Les Archives.');
      }
    }
  });

  // ── Decorative elements ──────────────────────────────────────────

  // Pipes along ceiling
  const pipeMat = Materials.metal(0x3a4a5a);
  for (let i = 0; i < 3; i++) {
    const pipe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, ROOM_W, 8),
      pipeMat
    );
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(0, ROOM_H - 0.15 - i * 0.12, -ROOM_D / 2 + 0.4 + i * 3);
    group.add(pipe);
  }

  // Pipe brackets
  for (let x = -4; x <= 4; x += 4) {
    for (let i = 0; i < 3; i++) {
      const bracket = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.2, 0.08),
        pipeMat
      );
      bracket.position.set(x, ROOM_H - 0.25, -ROOM_D / 2 + 0.4 + i * 3);
      group.add(bracket);
    }
  }

  // Wall panels / trim (adds visual interest to walls)
  const trimMat = Materials.metal(0x1e2e3e);
  // Left wall panels
  for (let z = -3; z <= 3; z += 3) {
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 3, 2),
      trimMat
    );
    panel.position.set(-ROOM_W / 2 + 0.04, 1.8, z);
    group.add(panel);
  }
  // Right wall panels
  for (let z = -3; z <= 3; z += 3) {
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 3, 2),
      trimMat
    );
    panel.position.set(ROOM_W / 2 - 0.04, 1.8, z);
    group.add(panel);
  }

  // Ventilation grates on walls
  const grateMat = new THREE.MeshStandardMaterial({
    color: 0x2a3a4a, roughness: 0.6, metalness: 0.5,
    transparent: true, opacity: 0.9
  });
  for (const xSign of [-1, 1]) {
    const grate = new THREE.Mesh(
      new THREE.PlaneGeometry(0.6, 0.4),
      grateMat
    );
    grate.position.set(xSign * (ROOM_W / 2 - 0.03), 3.8, 2);
    grate.rotation.y = xSign > 0 ? -Math.PI / 2 : Math.PI / 2;
    group.add(grate);
  }

  // Small equipment cabinets near the entrance (back of room = +z)
  const cabinetMat = Materials.metal(0x1a2838);
  for (const xOff of [-3.5, 3.5]) {
    const cabinet = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 1.8, 0.5),
      cabinetMat
    );
    cabinet.position.set(xOff, 0.9, ROOM_D / 2 - 0.4);
    cabinet.castShadow = true;
    group.add(cabinet);

    // Cabinet status light
    const cLight = new THREE.Mesh(
      new THREE.SphereGeometry(0.025, 8, 8),
      Materials.emissiveWarn(0xe63946, 2)
    );
    cLight.position.set(xOff, 1.6, ROOM_D / 2 - 0.14);
    group.add(cLight);
  }

  // Station name plaque on the back wall (the one the player faces on spawn)
  const plaque = createTextPlane('STATION LUMIERE', 2.5, 0.35, 28, '#c0d0e0', 'rgba(10,20,35,0.92)');
  plaque.position.set(0, 3.8, -ROOM_D / 2 + 0.06);
  group.add(plaque);

  const subPlaque = createTextPlane('SALLE DE CONTROLE / CONTROL ROOM', 2.2, 0.2, 14, '#5a7a9a', 'rgba(0,0,0,0)');
  subPlaque.position.set(0, 3.5, -ROOM_D / 2 + 0.06);
  group.add(subPlaque);

  // ── Warning stripes near archive door ────────────────────────────
  const stripeCanvas = document.createElement('canvas');
  stripeCanvas.width = 256;
  stripeCanvas.height = 64;
  const sCtx = stripeCanvas.getContext('2d');
  sCtx.fillStyle = '#111';
  sCtx.fillRect(0, 0, 256, 64);
  for (let i = -4; i < 12; i++) {
    sCtx.fillStyle = i % 2 === 0 ? '#e6394688' : '#00000000';
    sCtx.beginPath();
    sCtx.moveTo(i * 32, 0);
    sCtx.lineTo(i * 32 + 32, 0);
    sCtx.lineTo(i * 32 + 16, 64);
    sCtx.lineTo(i * 32 - 16, 64);
    sCtx.fill();
  }
  const stripeTex = new THREE.CanvasTexture(stripeCanvas);
  stripeTex.wrapS = THREE.RepeatWrapping;
  stripeTex.repeat.x = 2;
  const stripeMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 0.15),
    new THREE.MeshStandardMaterial({ map: stripeTex, roughness: 0.7, metalness: 0.3 })
  );
  stripeMesh.position.set(0, 0.075, -ROOM_D / 2 + 0.5);
  stripeMesh.rotation.x = -Math.PI / 2;
  group.add(stripeMesh);

  // ── Blinking warning lights on ceiling ───────────────────────────
  const warnLights = [];
  for (const pos of [
    new THREE.Vector3(-4, ROOM_H - 0.1, -3),
    new THREE.Vector3(4, ROOM_H - 0.1, -3),
    new THREE.Vector3(-4, ROOM_H - 0.1, 3),
    new THREE.Vector3(4, ROOM_H - 0.1, 3),
  ]) {
    const warnGeo = new THREE.SphereGeometry(0.06, 8, 8);
    const warnMat = Materials.emissiveWarn(0xe63946, 2);
    const warnMesh = new THREE.Mesh(warnGeo, warnMat);
    warnMesh.position.copy(pos);
    group.add(warnMesh);

    // Small housing
    const housing = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 0.05, 8),
      Materials.metal(0x333333)
    );
    housing.position.copy(pos);
    housing.position.y += 0.05;
    group.add(housing);

    warnLights.push({ mesh: warnMesh, mat: warnMat, phase: Math.random() * Math.PI * 2 });
  }

  // ── Lighting ─────────────────────────────────────────────────────

  // Hemisphere light: cool blue above, warm amber below
  const hemi = new THREE.HemisphereLight(0x1a2a4a, 0x2a1a0a, 0.3);
  group.add(hemi);

  // Ambient fill (very low)
  const ambient = new THREE.AmbientLight(0x0a1628, 0.15);
  group.add(ambient);

  // Spotlight on the console
  addSpotlight(engine.scene, new THREE.Vector3(0, ROOM_H - 0.2, -0.5), new THREE.Vector3(0, 0.9, -1.5), 0xdde8f4, 4, 0.6);

  // Spotlight on the status board
  addSpotlight(engine.scene, new THREE.Vector3(0, ROOM_H - 0.2, -3), new THREE.Vector3(0, 2.8, -ROOM_D / 2), 0xc0d8ee, 2, 0.4);

  // Point lights near doors
  const doorLightA = addPointLight(engine.scene, new THREE.Vector3(-ROOM_W / 2 + 0.5, 2.5, -1.5), 0x4ecdc4, 1.5, 5);
  const doorLightB = addPointLight(engine.scene, new THREE.Vector3(ROOM_W / 2 - 0.5, 2.5, -1.5), 0x4ecdc4, 1.5, 5);
  const doorLightC = addPointLight(engine.scene, new THREE.Vector3(0, 2.8, -ROOM_D / 2 + 0.5), 0xe63946, 1.0, 4);

  // Faint glow near the back of the room (player spawn area)
  addPointLight(engine.scene, new THREE.Vector3(0, 2, ROOM_D / 2 - 1), 0x1a3a6a, 0.5, 6);

  // ── Door objects for room transitions ────────────────────────────
  const doors = {
    mirror: {
      position: new THREE.Vector3(-ROOM_W / 2, 0, -1.5),
      onInteract: () => {
        engine.playEffect('clunk');
      }
    },
    pressure: {
      position: new THREE.Vector3(ROOM_W / 2, 0, -1.5),
      onInteract: () => {
        engine.playEffect('clunk');
      }
    },
    archive: {
      position: new THREE.Vector3(0, 0, -ROOM_D / 2),
      onInteract: () => {
        if (!archiveUnlocked) {
          engine.playEffect('click');
          engine.showObjective('Restore Le Miroir and La Pression to unlock Les Archives.');
          return false;
        }
        engine.playEffect('clunk');
        return true;
      }
    }
  };

  // ── onRoomComplete ───────────────────────────────────────────────
  function onRoomComplete(roomName) {
    const ind = indicators[roomName];
    if (!ind || ind.complete) return;

    ind.complete = true;

    // Animate indicator to green
    const newMat = Materials.emissiveOk(0x2a9d8f, 3);
    ind.lightMesh.material.dispose();
    ind.lightMesh.material = newMat;
    ind.lightMat = newMat;

    // Update matching door status light
    if (roomName === 'mirror') {
      doorA.statusLight.material.dispose();
      doorA.statusLight.material = Materials.emissiveOk(0x2a9d8f, 3);
    }
    if (roomName === 'pressure') {
      doorB.statusLight.material.dispose();
      doorB.statusLight.material = Materials.emissiveOk(0x2a9d8f, 3);
    }

    engine.playEffect('success');

    // Check if archive should unlock
    if (indicators.mirror.complete && indicators.pressure.complete && !archiveUnlocked) {
      // Delay the archive unlock for dramatic effect
      setTimeout(() => {
        unlockArchive();
      }, 1500);
    }
  }

  function unlockArchive() {
    archiveUnlocked = true;

    engine.playEffect('powerup');

    // Update archive indicator
    const archInd = indicators.archive;
    // Change to a ready state (teal glow)
    archInd.lightMesh.material.dispose();
    archInd.lightMesh.material = Materials.emissive(0x4ecdc4, 3);

    // Update door status light
    doorC.statusLight.material.dispose();
    doorC.statusLight.material = Materials.emissiveOk(0x2a9d8f, 3);

    // Update door light from red to teal
    doorLightC.color.set(0x2a9d8f);

    // Hide lock bars with animation (handled in update loop via archiveDoorOpenT)
    // Re-register door interactive with new prompt
    engine.unregisterInteractive(doorC.doorPanel);
    engine.registerInteractive(doorC.doorPanel, {
      type: 'click',
      prompt: 'Enter Les Archives / The Archive',
      icon: '\u{1F6AA}',
      onInteract: () => {
        engine.playEffect('clunk');
        doors.archive.onInteract();
      }
    });

    // Update lock label
    lockLabel.material.dispose();
    const newLabelMesh = createTextPlane(
      'DEVERROUILLE / UNLOCKED', 1.0, 0.15, 12, '#2a9d8f', 'rgba(10,22,40,0.85)'
    );
    lockLabel.material = newLabelMesh.material;
    lockLabel.geometry.dispose();
    lockLabel.geometry = newLabelMesh.geometry;

    // Update archive label color
    labelC.material.dispose();
    const newLabelC = createTextPlane('C: LES ARCHIVES / THE ARCHIVE', 1.2, 0.2, 14, '#2a9d8f', 'rgba(10,22,40,0.85)');
    labelC.material = newLabelC.material;
    labelC.geometry.dispose();
    labelC.geometry = newLabelC.geometry;

    engine.showObjective('Les Archives are now unlocked. Proceed to the Archive.');
  }

  // ── Enter / Exit ─────────────────────────────────────────────────
  function enter() {
    engine.showRoomTitle('Salle de Controle', 'Control Room - Station Lumiere');

    engine.setRoomBounds(-ROOM_W / 2 + 0.5, ROOM_W / 2 - 0.5, -ROOM_D / 2 + 0.5, ROOM_D / 2 - 0.5);

    // Dust particles
    engine.addDust({
      minX: -ROOM_W / 2,
      maxX: ROOM_W / 2,
      minZ: -ROOM_D / 2,
      maxZ: ROOM_D / 2,
      height: ROOM_H
    });

    // Ambient hum
    engine.playAmbient(55, 'sine', 0.06);
    engine.playAmbient(82.5, 'triangle', 0.02);

    // Set initial objective
    const mirrorDone = gameState.completedRooms.has('mirror');
    const pressureDone = gameState.completedRooms.has('pressure');

    if (mirrorDone && pressureDone && gameState.completedRooms.has('archive')) {
      engine.showObjective('All systems restored. Station Lumiere is back online.');
    } else if (mirrorDone && pressureDone) {
      engine.showObjective('Les Archives are unlocked. Proceed to the Archive.');
    } else if (mirrorDone || pressureDone) {
      const remaining = !mirrorDone ? 'Le Miroir' : 'La Pression';
      engine.showObjective(`Restore ${remaining} to unlock Les Archives.`);
    } else {
      engine.showObjective('Read the logbook. Restore Le Miroir and La Pression.');
    }
  }

  function exit() {
    engine.stopAmbient();
    engine.clearParticles();
    engine.hideObjective();
  }

  // ── Update (per frame) ──────────────────────────────────────────
  function update(delta) {
    elapsed += delta;

    // Blinking warning lights
    for (const wl of warnLights) {
      const blink = Math.sin(elapsed * 3.0 + wl.phase);
      const intensity = blink > 0.3 ? 2.0 : 0.2;
      wl.mat.emissiveIntensity = intensity;
    }

    // Subtle pulsing on incomplete indicators
    for (const key of Object.keys(indicators)) {
      const ind = indicators[key];
      if (!ind.complete) {
        const pulse = 1.5 + Math.sin(elapsed * 2.5 + (key === 'pressure' ? 1 : key === 'archive' ? 2 : 0)) * 0.8;
        ind.lightMesh.material.emissiveIntensity = pulse;
      }
    }

    // Console screen flicker
    const flicker = 0.4 + Math.sin(elapsed * 8) * 0.05 + Math.sin(elapsed * 13) * 0.03;
    screenMat.emissiveIntensity = flicker;

    // Logbook marker glow
    markerMat.emissiveIntensity = 1.0 + Math.sin(elapsed * 2) * 0.5;

    // Archive door opening animation
    if (archiveUnlocked && archiveDoorOpenT < 1) {
      archiveDoorOpenT = Math.min(1, archiveDoorOpenT + delta * 0.5);
      const t = easeOutCubic(archiveDoorOpenT);

      // Slide door panel left
      doorC.doorPanel.position.x = -t * 1.0;

      // Fade out lock bars
      for (const bar of lockBars) {
        bar.position.y -= delta * 0.8;
        bar.material.opacity = 1 - t;
        bar.material.transparent = true;
        if (t >= 1) bar.visible = false;
      }
    }

    // Subtle camera-aware door light pulsing (gives atmosphere)
    doorLightA.intensity = 1.5 + Math.sin(elapsed * 1.2) * 0.3;
    doorLightB.intensity = 1.5 + Math.sin(elapsed * 1.2 + 1) * 0.3;
  }

  // ── Return ───────────────────────────────────────────────────────
  return {
    group,
    enter,
    exit,
    update,
    doors,
    onRoomComplete
  };
}

// ── Utility ──────────────────────────────────────────────────────────
function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}
