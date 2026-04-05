import * as THREE from 'three';
import {
  Engine, Materials, createRoom, createDoor, createValveWheel,
  createGauge, createTextPlane, addSpotlight, addPointLight
} from '../engine.js';

// ─── Room 2: La Pression ──────────────────────────────────────────────
// Life support center. Equalize pressure between two chambers by turning
// a valve at a safe rate. Math (rates, proportional reasoning), Science
// (pressure, gases), French, Social Studies / Language Arts.

export function buildPressureRoom(engine, gameState) {

  // ── Constants ──────────────────────────────────────────────────────
  const ROOM_W = 10;
  const ROOM_H = 4;
  const ROOM_D = 8;

  const PRESSURE_A_START = 4.0;
  const PRESSURE_B_START = 1.0;
  const PRESSURE_TARGET  = 2.5;      // midpoint
  const PRESSURE_MAX     = 5.0;      // gauge full scale
  const WIN_TOLERANCE    = 0.3;      // |A-B| < 0.3
  const MAX_FLOW_RATE    = 2.0;      // atm / min
  const ALARM_FLOW_RATE  = 2.5;      // atm / min (seal failure threshold)

  // ── State ──────────────────────────────────────────────────────────
  let pressureA       = PRESSURE_A_START;
  let pressureB       = PRESSURE_B_START;
  let valveOpenness   = 0;           // 0 = closed, 1 = fully open
  let valveRotation   = 0;           // accumulated rotation (radians)
  let flowRate        = 0;           // current atm/min
  let alarmActive     = false;
  let alarmCooldown   = 0;
  let solved          = false;
  let timeInRoom      = 0;
  let hintStage       = 0;           // 0=none, 1=label, 2=intercom, 3=diagram
  let valveCreakTimer = 0;
  let bulkheadOpen    = false;

  const result = {
    group: new THREE.Group(),
    isComplete: false,
    doors: {},
    enter,
    exit,
    update
  };

  const group = result.group;

  // ── Room Shell ─────────────────────────────────────────────────────
  const room = createRoom(ROOM_W, ROOM_H, ROOM_D);
  group.add(room.group);

  // ── Bulkhead (central dividing wall) ──────────────────────────────
  // Partial wall separating Chamber A (left, -x) from Chamber B (right, +x).
  // A gap at the top lets us see both gauges. The valve sits in the center
  // opening at floor level.
  const bulkheadMat = Materials.metal(0x3a4a5a);

  // Left section of bulkhead (above the opening)
  const bulkheadLeft = new THREE.Mesh(
    new THREE.BoxGeometry(0.15, ROOM_H, ROOM_D * 0.35),
    bulkheadMat
  );
  bulkheadLeft.position.set(0, ROOM_H / 2, -ROOM_D * 0.325);
  bulkheadLeft.castShadow = true;
  bulkheadLeft.receiveShadow = true;
  group.add(bulkheadLeft);

  const bulkheadRight = new THREE.Mesh(
    new THREE.BoxGeometry(0.15, ROOM_H, ROOM_D * 0.35),
    bulkheadMat
  );
  bulkheadRight.position.set(0, ROOM_H / 2, ROOM_D * 0.325);
  bulkheadRight.castShadow = true;
  bulkheadRight.receiveShadow = true;
  group.add(bulkheadRight);

  // Upper section over the central opening
  const bulkheadTop = new THREE.Mesh(
    new THREE.BoxGeometry(0.15, ROOM_H - 2.5, ROOM_D * 0.30),
    bulkheadMat
  );
  bulkheadTop.position.set(0, ROOM_H - (ROOM_H - 2.5) / 2, 0);
  bulkheadTop.castShadow = true;
  group.add(bulkheadTop);

  // "Cloison" label on bulkhead
  const cloisonLabel = createTextPlane('CLOISON', 0.6, 0.15, 14, '#8899aa', 'rgba(30,40,55,0.95)');
  cloisonLabel.position.set(0.09, 3.2, 0);
  cloisonLabel.rotation.y = -Math.PI / 2;
  group.add(cloisonLabel);

  // ── Pipe network along walls ──────────────────────────────────────
  const pipes = [];
  const pipeMat = Materials.metal(0x556677);
  const pipeGlowMats = [];

  function addPipe(start, end, radius = 0.04) {
    const dir = new THREE.Vector3().subVectors(end, start);
    const length = dir.length();
    const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);

    const pipeGeo = new THREE.CylinderGeometry(radius, radius, length, 8);
    const pipe = new THREE.Mesh(pipeGeo, pipeMat);
    pipe.position.copy(mid);

    // Orient pipe along direction
    const up = new THREE.Vector3(0, 1, 0);
    const quat = new THREE.Quaternion().setFromUnitVectors(up, dir.normalize());
    pipe.quaternion.copy(quat);
    pipe.castShadow = true;
    group.add(pipe);
    pipes.push(pipe);

    // Glow sleeve (inner emissive ring visible when gas flows)
    const glowMat = Materials.emissive(0x44aacc, 0);
    const glowGeo = new THREE.CylinderGeometry(radius + 0.005, radius + 0.005, length, 8);
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.position.copy(mid);
    glow.quaternion.copy(quat);
    group.add(glow);
    pipeGlowMats.push(glowMat);

    return pipe;
  }

  // Horizontal run along left wall at height 2.5
  addPipe(new THREE.Vector3(-4.8, 2.5, -3.0), new THREE.Vector3(-4.8, 2.5, 3.0));
  // Down from left wall to valve area
  addPipe(new THREE.Vector3(-4.8, 2.5, 0), new THREE.Vector3(-0.5, 1.2, 0), 0.05);
  // Horizontal run along right wall
  addPipe(new THREE.Vector3(4.8, 2.5, -3.0), new THREE.Vector3(4.8, 2.5, 3.0));
  // From valve to right wall
  addPipe(new THREE.Vector3(0.5, 1.2, 0), new THREE.Vector3(4.8, 2.5, 0), 0.05);
  // Vertical drops on left side
  addPipe(new THREE.Vector3(-4.8, 0.2, -2.5), new THREE.Vector3(-4.8, 2.5, -2.5));
  addPipe(new THREE.Vector3(-4.8, 0.2,  2.5), new THREE.Vector3(-4.8, 2.5,  2.5));
  // Vertical drops on right side
  addPipe(new THREE.Vector3(4.8, 0.2, -2.5), new THREE.Vector3(4.8, 2.5, -2.5));
  addPipe(new THREE.Vector3(4.8, 0.2,  2.5), new THREE.Vector3(4.8, 2.5,  2.5));

  // "Conduit" labels on pipes
  const conduitLabelL = createTextPlane('CONDUIT', 0.5, 0.12, 12, '#6688aa', 'rgba(20,30,45,0.9)');
  conduitLabelL.position.set(-4.75, 2.8, 0);
  conduitLabelL.rotation.y = Math.PI / 2;
  group.add(conduitLabelL);

  const conduitLabelR = createTextPlane('CONDUIT', 0.5, 0.12, 12, '#6688aa', 'rgba(20,30,45,0.9)');
  conduitLabelR.position.set(4.75, 2.8, 0);
  conduitLabelR.rotation.y = -Math.PI / 2;
  group.add(conduitLabelR);

  // ── Valve Wheel ────────────────────────────────────────────────────
  const valve = createValveWheel(0.25);
  valve.group.position.set(0, 1.2, 0);
  // Orient wheel to face the player (who will be in chamber A at -x)
  valve.group.rotation.y = Math.PI / 2;
  group.add(valve.group);

  // Valve mount / housing
  const valveHousing = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.12, 0.2, 16),
    Materials.metal(0x445566)
  );
  valveHousing.position.set(0, 1.2, 0);
  valveHousing.rotation.x = Math.PI / 2;
  group.add(valveHousing);

  // "Vanne" label near valve
  const vanneLabel = createTextPlane('VANNE', 0.35, 0.12, 14, '#f4a261', 'rgba(20,30,45,0.95)');
  vanneLabel.position.set(0, 0.7, 0.25);
  group.add(vanneLabel);

  // ── Max rate label (hint stage 1 - starts dim) ────────────────────
  const maxRateLabel = createTextPlane(
    'MAX 2.0 atm/min', 0.6, 0.15, 14, '#e63946', 'rgba(20,10,10,0.9)'
  );
  maxRateLabel.position.set(0, 1.65, 0.25);
  maxRateLabel.material.opacity = 0.15;
  maxRateLabel.material.transparent = true;
  group.add(maxRateLabel);

  // ── Gauges ─────────────────────────────────────────────────────────
  // Chamber A gauge on left wall
  const gaugeA = createGauge(0.25, 'Chambre A');
  gaugeA.group.position.set(-4.95, 2.0, -1.0);
  gaugeA.group.rotation.y = Math.PI / 2;
  group.add(gaugeA.group);

  const gaugeLabelA = createTextPlane(
    'Chambre A / Pression', 0.7, 0.18, 16, '#4ecdc4', 'rgba(10,22,40,0.95)'
  );
  gaugeLabelA.position.set(-4.95, 1.55, -1.0);
  gaugeLabelA.rotation.y = Math.PI / 2;
  group.add(gaugeLabelA);

  // Digital readout for A
  const readoutA = createDigitalReadout();
  readoutA.mesh.position.set(-4.95, 2.45, -1.0);
  readoutA.mesh.rotation.y = Math.PI / 2;
  group.add(readoutA.mesh);

  // Chamber B gauge on right wall
  const gaugeB = createGauge(0.25, 'Chambre B');
  gaugeB.group.position.set(4.95, 2.0, -1.0);
  gaugeB.group.rotation.y = -Math.PI / 2;
  group.add(gaugeB.group);

  const gaugeLabelB = createTextPlane(
    'Chambre B / Pression', 0.7, 0.18, 16, '#4ecdc4', 'rgba(10,22,40,0.95)'
  );
  gaugeLabelB.position.set(4.95, 1.55, -1.0);
  gaugeLabelB.rotation.y = -Math.PI / 2;
  group.add(gaugeLabelB);

  // Digital readout for B
  const readoutB = createDigitalReadout();
  readoutB.mesh.position.set(4.95, 2.45, -1.0);
  readoutB.mesh.rotation.y = -Math.PI / 2;
  group.add(readoutB.mesh);

  // ── Warning sign ──────────────────────────────────────────────────
  const warningSign = createTextPlane(
    'ATTENTION: Debit maximum 2.0 atm/min',
    1.4, 0.3, 18, '#e63946', 'rgba(40,10,10,0.95)'
  );
  warningSign.position.set(0, 3.3, -ROOM_D / 2 + 0.05);
  group.add(warningSign);

  // ── Warning lights (one per chamber side) ─────────────────────────
  const warningLightMats = [];

  function addWarningLight(pos) {
    const geo = new THREE.SphereGeometry(0.06, 12, 12);
    const mat = Materials.emissiveWarn(0xe63946, 0);
    const light = new THREE.Mesh(geo, mat);
    light.position.copy(pos);
    group.add(light);
    warningLightMats.push(mat);
    return light;
  }

  addWarningLight(new THREE.Vector3(-3.0, 3.6, -ROOM_D / 2 + 0.1));
  addWarningLight(new THREE.Vector3( 3.0, 3.6, -ROOM_D / 2 + 0.1));
  addWarningLight(new THREE.Vector3(-3.0, 3.6,  ROOM_D / 2 - 0.1));
  addWarningLight(new THREE.Vector3( 3.0, 3.6,  ROOM_D / 2 - 0.1));

  // ── Bulkhead Door (opens on success) ──────────────────────────────
  const bulkheadDoor = createDoor(1.0, 2.4, 0x2a3a4a);
  bulkheadDoor.group.position.set(0, 0, 0);
  // Place in the bulkhead opening. It slides up when solved.
  group.add(bulkheadDoor.group);

  // ── Exit door (back wall, returns to previous room) ───────────────
  const exitDoor = createDoor(1.2, 2.2, 0x2d4a6f);
  exitDoor.group.position.set(-2.5, 0, -ROOM_D / 2 + 0.05);
  group.add(exitDoor.group);

  result.doors.back = {
    position: new THREE.Vector3(-2.5, 1.1, -ROOM_D / 2 + 0.05),
    onInteract: null   // set by main.js
  };

  // ── Historical Logbook ────────────────────────────────────────────
  const logbookMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.4, 0.05),
    new THREE.MeshStandardMaterial({ color: 0x5a3a20, roughness: 0.8, metalness: 0.1 })
  );
  logbookMesh.position.set(-3.5, 1.0, -ROOM_D / 2 + 0.4);
  logbookMesh.rotation.x = -0.3;
  logbookMesh.castShadow = true;
  group.add(logbookMesh);

  // Logbook table
  const logbookTable = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 0.05, 0.5),
    Materials.metal(0x4a3a2a)
  );
  logbookTable.position.set(-3.5, 0.78, -ROOM_D / 2 + 0.45);
  logbookTable.castShadow = true;
  logbookTable.receiveShadow = true;
  group.add(logbookTable);

  // Table legs
  for (const dx of [-0.35, 0.35]) {
    for (const dz of [-0.2, 0.2]) {
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.02, 0.78, 6),
        Materials.metal(0x4a3a2a)
      );
      leg.position.set(-3.5 + dx, 0.39, -ROOM_D / 2 + 0.45 + dz);
      group.add(leg);
    }
  }

  // ── Historical Plaque (wall-mounted) ──────────────────────────────
  const plaqueMesh = createTextPlane(
    'Station Lumiere - Fondee en 2024 - Cooperation Franco-Americaine',
    1.2, 0.25, 14, '#d4a574', 'rgba(40,25,15,0.95)'
  );
  plaqueMesh.position.set(-4.95, 1.6, 2.0);
  plaqueMesh.rotation.y = Math.PI / 2;
  group.add(plaqueMesh);

  // ── Monitor (for hint stage 3 diagram) ────────────────────────────
  // Monitor housing
  const monitorHousing = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 0.6, 0.08),
    Materials.metal(0x2a2a3a)
  );
  monitorHousing.position.set(3.5, 1.8, -ROOM_D / 2 + 0.1);
  group.add(monitorHousing);

  // Screen (starts dark, shows diagram at hint stage 3)
  const monitorScreen = createMonitorScreen(false);
  monitorScreen.position.set(3.5, 1.8, -ROOM_D / 2 + 0.15);
  group.add(monitorScreen);

  // Monitor shelf
  const monitorShelf = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.04, 0.15),
    Materials.metal(0x3a3a4a)
  );
  monitorShelf.position.set(3.5, 1.45, -ROOM_D / 2 + 0.12);
  group.add(monitorShelf);

  // ── Intercom speaker (for hint stage 2) ───────────────────────────
  const intercomBox = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.25, 0.06),
    Materials.metal(0x3a3a3a)
  );
  intercomBox.position.set(-2.0, 2.8, -ROOM_D / 2 + 0.06);
  group.add(intercomBox);

  // Intercom grille (small dots pattern)
  const intercomGrille = new THREE.Mesh(
    new THREE.PlaneGeometry(0.16, 0.18),
    new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 })
  );
  intercomGrille.position.set(-2.0, 2.8, -ROOM_D / 2 + 0.1);
  group.add(intercomGrille);

  // Intercom text (appears at hint stage 2)
  let intercomText = null;

  // ── Atmospheric details ───────────────────────────────────────────
  // Floor grating strips
  for (let z = -3; z <= 3; z += 1.5) {
    const grate = new THREE.Mesh(
      new THREE.BoxGeometry(ROOM_W - 0.5, 0.02, 0.3),
      Materials.metal(0x2a3040)
    );
    grate.position.set(0, 0.01, z);
    grate.receiveShadow = true;
    group.add(grate);
  }

  // Pressure tanks along walls (Chamber A side)
  for (let i = 0; i < 3; i++) {
    const tank = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.15, 1.0, 12),
      Materials.metal(0x556b7a)
    );
    tank.position.set(-4.2, 0.5, -2.5 + i * 2.5);
    tank.castShadow = true;
    group.add(tank);

    // Tank cap
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      Materials.metal(0x667788)
    );
    cap.position.set(-4.2, 1.0, -2.5 + i * 2.5);
    group.add(cap);
  }

  // Pressure tanks (Chamber B side)
  for (let i = 0; i < 3; i++) {
    const tank = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.15, 1.0, 12),
      Materials.metal(0x556b7a)
    );
    tank.position.set(4.2, 0.5, -2.5 + i * 2.5);
    tank.castShadow = true;
    group.add(tank);

    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      Materials.metal(0x667788)
    );
    cap.position.set(4.2, 1.0, -2.5 + i * 2.5);
    group.add(cap);
  }

  // ── Lighting ──────────────────────────────────────────────────────
  // Main overhead lights
  addSpotlight(group, new THREE.Vector3(-2.5, 3.9, 0), new THREE.Vector3(-2.5, 0, 0), 0xddeeff, 2.5, 0.6);
  addSpotlight(group, new THREE.Vector3( 2.5, 3.9, 0), new THREE.Vector3( 2.5, 0, 0), 0xddeeff, 2.5, 0.6);

  // Accent lights near gauges
  addPointLight(group, new THREE.Vector3(-4.5, 2.5, -1.0), 0x4ecdc4, 0.8, 3);
  addPointLight(group, new THREE.Vector3( 4.5, 2.5, -1.0), 0x4ecdc4, 0.8, 3);

  // Red accent near warning sign
  addPointLight(group, new THREE.Vector3(0, 3.5, -ROOM_D / 2 + 0.5), 0xe63946, 0.5, 4);

  // Warm light near logbook
  addPointLight(group, new THREE.Vector3(-3.5, 1.8, -ROOM_D / 2 + 0.6), 0xffddaa, 0.6, 3);

  // Valve area accent light
  const valveLight = addPointLight(group, new THREE.Vector3(0, 2.0, 0.5), 0xf4a261, 0.4, 3);

  // ── Steam particles ───────────────────────────────────────────────
  let steamLeft = null;
  let steamRight = null;

  // ── Digital Readout Helper ────────────────────────────────────────
  function createDigitalReadout() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;

    const mat = new THREE.MeshStandardMaterial({
      map: texture,
      emissive: new THREE.Color(0x00ff88),
      emissiveIntensity: 0.3,
      emissiveMap: texture,
      roughness: 0.2,
      metalness: 0.3
    });

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.1), mat);

    function setValue(val) {
      ctx.fillStyle = '#0a1a0a';
      ctx.fillRect(0, 0, 256, 64);
      ctx.fillStyle = '#00ff88';
      ctx.font = 'bold 40px Courier New';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(val.toFixed(2) + ' atm', 128, 32);
      texture.needsUpdate = true;
    }

    setValue(0);
    return { mesh, setValue };
  }

  // ── Monitor Screen Helper ─────────────────────────────────────────
  function createMonitorScreen(showDiagram) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 384;
    const ctx = canvas.getContext('2d');

    if (showDiagram) {
      // Draw flow diagram
      ctx.fillStyle = '#0a1520';
      ctx.fillRect(0, 0, 512, 384);

      // Title
      ctx.fillStyle = '#4ecdc4';
      ctx.font = 'bold 20px Courier New';
      ctx.textAlign = 'center';
      ctx.fillText('SCHEMA DE DEBIT', 256, 30);

      // Draw chambers
      ctx.strokeStyle = '#4ecdc4';
      ctx.lineWidth = 2;

      // Chamber A box
      ctx.strokeRect(40, 80, 160, 200);
      ctx.fillStyle = '#335566';
      ctx.fillRect(42, 82, 156, 196);
      ctx.fillStyle = '#4ecdc4';
      ctx.font = '16px Courier New';
      ctx.textAlign = 'center';
      ctx.fillText('Chambre A', 120, 110);
      ctx.fillText('4.0 atm', 120, 140);

      // Arrow showing pressure direction
      ctx.fillStyle = '#f4a261';
      ctx.font = 'bold 24px Courier New';
      ctx.fillText('>>>', 256, 180);
      ctx.font = '14px Courier New';
      ctx.fillStyle = '#e63946';
      ctx.fillText('MAX 2.0 atm/min', 256, 210);

      // Chamber B box
      ctx.strokeStyle = '#4ecdc4';
      ctx.strokeRect(312, 80, 160, 200);
      ctx.fillStyle = '#223344';
      ctx.fillRect(314, 82, 156, 196);
      ctx.fillStyle = '#4ecdc4';
      ctx.font = '16px Courier New';
      ctx.textAlign = 'center';
      ctx.fillText('Chambre B', 392, 110);
      ctx.fillText('1.0 atm', 392, 140);

      // Valve in center
      ctx.beginPath();
      ctx.arc(256, 180, 20, 0, Math.PI * 2);
      ctx.strokeStyle = '#f4a261';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = '#f4a261';
      ctx.font = '12px Courier New';
      ctx.fillText('VANNE', 256, 240);

      // Target info
      ctx.fillStyle = '#2a9d8f';
      ctx.font = 'bold 16px Courier New';
      ctx.fillText('OBJECTIF: 2.5 atm = 2.5 atm', 256, 320);
      ctx.font = '14px Courier New';
      ctx.fillText('Egaliser la pression', 256, 345);
    } else {
      // Dark screen
      ctx.fillStyle = '#060a0e';
      ctx.fillRect(0, 0, 512, 384);
      // Subtle scan lines
      ctx.strokeStyle = 'rgba(30,50,60,0.3)';
      for (let y = 0; y < 384; y += 4) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(512, y);
        ctx.stroke();
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;

    const mat = new THREE.MeshStandardMaterial({
      map: texture,
      emissive: new THREE.Color(showDiagram ? 0x1a3040 : 0x050808),
      emissiveIntensity: showDiagram ? 0.5 : 0.1,
      emissiveMap: texture,
      roughness: 0.1,
      metalness: 0.3
    });

    return new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.54), mat);
  }

  // ── Flow Rate Display (on bulkhead near valve) ────────────────────
  const flowDisplay = createDigitalFlowDisplay();
  flowDisplay.mesh.position.set(-0.09, 1.8, 0);
  flowDisplay.mesh.rotation.y = Math.PI / 2;
  group.add(flowDisplay.mesh);

  function createDigitalFlowDisplay() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;

    const mat = new THREE.MeshStandardMaterial({
      map: texture,
      emissive: new THREE.Color(0x44aacc),
      emissiveIntensity: 0.3,
      emissiveMap: texture,
      roughness: 0.2,
      metalness: 0.3
    });

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.13), mat);

    function setValue(rate, isWarning) {
      ctx.fillStyle = '#0a1218';
      ctx.fillRect(0, 0, 256, 96);

      ctx.font = '12px Courier New';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#6688aa';
      ctx.fillText('DEBIT', 128, 20);

      const color = isWarning ? '#e63946' : '#00ff88';
      ctx.fillStyle = color;
      ctx.font = 'bold 32px Courier New';
      ctx.fillText(rate.toFixed(2), 128, 55);

      ctx.fillStyle = '#6688aa';
      ctx.font = '12px Courier New';
      ctx.fillText('atm/min', 128, 80);

      texture.needsUpdate = true;
    }

    setValue(0, false);
    return { mesh, setValue };
  }

  // ── Register Interactives ─────────────────────────────────────────
  function registerAll() {
    // Valve wheel - drag to rotate
    engine.registerInteractive(valve.group, {
      type: 'adjust',
      prompt: 'Drag to turn valve / Tourner la vanne',
      icon: '\u2699\uFE0F',
      onAdjust(dx, dy) {
        if (solved || alarmActive) return;

        // Map horizontal mouse movement to valve rotation
        const rotDelta = dx * 0.01;
        valveRotation += rotDelta;

        // Clamp rotation: 0 to 2*PI (one full turn = fully open)
        valveRotation = Math.max(0, Math.min(Math.PI * 2, valveRotation));
        valveOpenness = valveRotation / (Math.PI * 2);

        // Visually rotate the valve wheel
        valve.group.rotation.z = valveRotation;

        // Play valve creak sound at intervals
        valveCreakTimer += Math.abs(rotDelta);
        if (valveCreakTimer > 0.3) {
          engine.playEffect('valve');
          valveCreakTimer = 0;
        }
      }
    });

    // Logbook - click to read
    engine.registerInteractive(logbookMesh, {
      type: 'click',
      prompt: 'Read logbook / Lire le journal',
      icon: '\uD83D\uDCD6',
      onInteract() {
        engine.showNarrative('Journal de Station Lumiere', LOGBOOK_HTML);
      }
    });

    // Historical plaque
    engine.registerInteractive(plaqueMesh, {
      type: 'click',
      prompt: 'Read plaque / Lire la plaque',
      icon: '\uD83D\uDCD6',
      onInteract() {
        engine.showNarrative('Station Lumiere', PLAQUE_HTML);
      }
    });

    // Exit door
    engine.registerInteractive(exitDoor.group, {
      type: 'click',
      prompt: 'Return / Retourner',
      icon: '\uD83D\uDEAA',
      onInteract() {
        if (result.doors.back.onInteract) {
          result.doors.back.onInteract();
        }
      }
    });
  }

  // ── Enter / Exit ──────────────────────────────────────────────────
  function enter() {
    engine.showRoomTitle('La Pression', 'Room 2 - The Pressure Room');

    engine.setRoomBounds(-ROOM_W / 2, ROOM_W / 2, -ROOM_D / 2, ROOM_D / 2);
    engine.camera.position.set(-2.5, 1.6, 2.5);

    // Ambient hum of life support
    engine.playAmbient(55, 'sine', 0.06);
    engine.playAmbient(110, 'triangle', 0.03);

    // Dust particles
    engine.addDust({
      minX: -ROOM_W / 2, maxX: ROOM_W / 2,
      minZ: -ROOM_D / 2, maxZ: ROOM_D / 2,
      height: ROOM_H
    });

    // Steam particles (from valve area, directed left and right)
    steamLeft = engine.addSteam(
      new THREE.Vector3(-0.3, 1.2, 0),
      new THREE.Vector3(-1, 0.3, 0)
    );
    steamRight = engine.addSteam(
      new THREE.Vector3(0.3, 1.2, 0),
      new THREE.Vector3(1, 0.3, 0)
    );

    // Initialize gauges
    gaugeA.setValue(pressureA / PRESSURE_MAX);
    gaugeB.setValue(pressureB / PRESSURE_MAX);
    readoutA.setValue(pressureA);
    readoutB.setValue(pressureB);

    // Objective
    engine.showObjective('Equalize pressure between chambers A and B');

    registerAll();
  }

  function exit() {
    engine.stopAmbient();
    engine.clearParticles();
    engine.hideObjective();
    steamLeft = null;
    steamRight = null;
  }

  // ── Update Loop ───────────────────────────────────────────────────
  function update(delta) {
    if (solved) {
      // Animate bulkhead door sliding up if just solved
      if (!bulkheadOpen) {
        bulkheadDoor.doorPanel.position.y += delta * 1.5;
        if (bulkheadDoor.doorPanel.position.y > 3.5) {
          bulkheadOpen = true;
        }
      }
      return;
    }

    timeInRoom += delta;

    // ── Alarm cooldown ──────────────────────────────────────────────
    if (alarmActive) {
      alarmCooldown -= delta;
      if (alarmCooldown <= 0) {
        alarmActive = false;
        valveOpenness = 0;
        valveRotation = 0;
        valve.group.rotation.z = 0;
      }
      // Flash warning lights during alarm
      const flash = Math.sin(timeInRoom * 12) > 0 ? 3.0 : 0.5;
      for (const mat of warningLightMats) {
        mat.emissiveIntensity = flash;
      }
      // Cut steam during alarm
      if (steamLeft) steamLeft.setIntensity(0);
      if (steamRight) steamRight.setIntensity(0);
      flowDisplay.setValue(0, true);
      return;
    }

    // Reset warning lights when no alarm
    for (const mat of warningLightMats) {
      mat.emissiveIntensity = 0;
    }

    // ── Pressure physics ────────────────────────────────────────────
    flowRate = valveOpenness * MAX_FLOW_RATE; // atm/min

    if (flowRate > 0 && pressureA > pressureB) {
      const flowPerSec = flowRate / 60;
      const transfer = flowPerSec * delta;

      // Don't let pressures cross over
      const maxTransfer = (pressureA - pressureB) / 2;
      const actualTransfer = Math.min(transfer, maxTransfer);

      pressureA -= actualTransfer;
      pressureB += actualTransfer;

      // Clamp to physical bounds
      pressureA = Math.max(0, Math.min(PRESSURE_MAX, pressureA));
      pressureB = Math.max(0, Math.min(PRESSURE_MAX, pressureB));
    }

    // ── Check for excessive flow rate ───────────────────────────────
    if (flowRate > ALARM_FLOW_RATE) {
      alarmActive = true;
      alarmCooldown = 2.0; // seconds to cool down
      engine.playEffect('alarm');
      engine.playEffect('hiss');

      // Flash warning lights
      for (const mat of warningLightMats) {
        mat.emissiveIntensity = 4.0;
      }
    }

    // ── Update gauges and readouts ──────────────────────────────────
    gaugeA.setValue(pressureA / PRESSURE_MAX);
    gaugeB.setValue(pressureB / PRESSURE_MAX);
    readoutA.setValue(pressureA);
    readoutB.setValue(pressureB);

    // Flow rate display
    const isWarningRate = flowRate > MAX_FLOW_RATE * 0.8;
    flowDisplay.setValue(flowRate, isWarningRate);

    // ── Update pipe glow ────────────────────────────────────────────
    const glowIntensity = flowRate / MAX_FLOW_RATE;
    const pulse = 0.8 + 0.2 * Math.sin(timeInRoom * 4);
    for (const mat of pipeGlowMats) {
      mat.emissiveIntensity = glowIntensity * pulse * 2;
    }

    // ── Update steam ────────────────────────────────────────────────
    const steamIntensity = flowRate / MAX_FLOW_RATE;
    if (steamLeft) steamLeft.setIntensity(steamIntensity);
    if (steamRight) steamRight.setIntensity(steamIntensity);

    // Hiss sound while flowing
    if (flowRate > 0.05 && Math.random() < delta * 2) {
      engine.playEffect('hiss');
    }

    // ── Valve area light intensity ──────────────────────────────────
    valveLight.intensity = 0.4 + glowIntensity * 1.5;
    valveLight.color.setHex(isWarningRate ? 0xe63946 : 0xf4a261);

    // ── Warning light pulse when approaching limit ──────────────────
    if (flowRate > MAX_FLOW_RATE * 0.8) {
      const warnPulse = Math.sin(timeInRoom * 8) > 0 ? 2.0 : 0.3;
      for (const mat of warningLightMats) {
        mat.emissiveIntensity = warnPulse;
      }
    }

    // ── Hint system ─────────────────────────────────────────────────
    updateHints();

    // ── Win condition ───────────────────────────────────────────────
    const pressureDiff = Math.abs(pressureA - pressureB);
    if (pressureDiff < WIN_TOLERANCE) {
      onSolved();
    }
  }

  // ── Hint System ───────────────────────────────────────────────────
  function updateHints() {
    // Stage 1: After 30s, make the max rate label more visible
    if (timeInRoom > 30 && hintStage < 1) {
      hintStage = 1;
      maxRateLabel.material.opacity = 0.9;
    }

    // Stage 2: After 60s, show intercom message
    if (timeInRoom > 60 && hintStage < 2) {
      hintStage = 2;

      if (!intercomText) {
        intercomText = createTextPlane(
          'The seals can handle two atmospheres per minute. Keep it steady.',
          1.6, 0.2, 14, '#44ddcc', 'rgba(10,25,35,0.95)'
        );
        intercomText.position.set(-2.0, 2.4, -ROOM_D / 2 + 0.1);
        group.add(intercomText);
      }

      engine.playEffect('click');
      // Fade out after 8 seconds
      setTimeout(() => {
        if (intercomText) {
          intercomText.material.opacity = 0;
          intercomText.material.transparent = true;
        }
      }, 8000);
    }

    // Stage 3: After 90s, turn on the monitor with the diagram
    if (timeInRoom > 90 && hintStage < 3) {
      hintStage = 3;

      // Replace the dark monitor screen with the diagram version
      const diagramScreen = createMonitorScreen(true);
      diagramScreen.position.copy(monitorScreen.position);
      monitorScreen.geometry.dispose();
      monitorScreen.material.dispose();
      group.remove(monitorScreen);
      group.add(diagramScreen);

      engine.playEffect('powerup');
    }
  }

  // ── Solve ─────────────────────────────────────────────────────────
  function onSolved() {
    solved = true;
    result.isComplete = true;

    // Play satisfying clunk + success chord
    engine.playEffect('clunk');
    setTimeout(() => engine.playEffect('success'), 400);

    // Update bulkhead door light to green
    bulkheadDoor.lightMat.color.setHex(0x2a9d8f);
    bulkheadDoor.lightMat.emissive.setHex(0x2a9d8f);

    // Update exit door light to green too
    exitDoor.lightMat.color.setHex(0x2a9d8f);
    exitDoor.lightMat.emissive.setHex(0x2a9d8f);

    // Pipe glow turns green
    for (const mat of pipeGlowMats) {
      mat.color.setHex(0x2a9d8f);
      mat.emissive.setHex(0x2a9d8f);
      mat.emissiveIntensity = 1.5;
    }

    // Gauge rings turn green
    gaugeA.ring.material.color.setHex(0x2a9d8f);
    gaugeA.ring.material.emissive.setHex(0x2a9d8f);
    gaugeB.ring.material.color.setHex(0x2a9d8f);
    gaugeB.ring.material.emissive.setHex(0x2a9d8f);

    // Stop steam
    if (steamLeft) steamLeft.setIntensity(0);
    if (steamRight) steamRight.setIntensity(0);

    engine.hideObjective();
    engine.showCompletion('Pressure Equalized! / Pression egalisee!');

    // Notify game state
    if (gameState && gameState.onRoomComplete) {
      gameState.onRoomComplete('pressure');
    }
  }

  return result;
}

// ─── Narrative Content ──────────────────────────────────────────────────
// Historical logbook and plaque text. Social Studies + Language Arts
// integration: reading comprehension, Franco-American cooperation.

const LOGBOOK_HTML = `
<div style="font-family: 'Courier New', monospace; line-height: 1.7; color: #c8d8e8;">

<p style="color: #f4a261; font-weight: bold; border-bottom: 1px solid #334;">
  JOURNAL DE BORD - Station Lumiere<br>
  <span style="font-size: 0.85em; color: #8899aa;">Logbook - Station Lumiere</span>
</p>

<p><strong style="color: #4ecdc4;">Entree 1 - Inauguration</strong><br>
Today we celebrate the opening of <em>Station Lumiere</em>, named for the light
of cooperation between France and the United States. This joint research station
continues a tradition of partnership stretching back centuries.</p>

<p><strong style="color: #4ecdc4;">Entree 2 - Historical Notes</strong><br>
France and America have a long history of working together. In 1778, France
became one of the first nations to recognize American independence. The Marquis
de Lafayette, a young French officer, sailed to America to fight alongside
George Washington during the Revolutionary War. He became a hero in both
countries &mdash; a symbol of friendship across the Atlantic.</p>

<p><strong style="color: #4ecdc4;">Entree 3 - The Gift of Liberty</strong><br>
In 1886, France gave America the Statue of Liberty &mdash; <em>La Statue de la
Liberte</em> &mdash; as a gift of friendship. Designed by Frederic Auguste Bartholdi
and engineered by Gustave Eiffel (who also built the Eiffel Tower), it was
shipped across the ocean in 350 pieces and reassembled in New York Harbor.
The statue's torch represents <em>lumiere</em> &mdash; light &mdash; guiding
the way to freedom.</p>

<p><strong style="color: #4ecdc4;">Entree 4 - Station Lumiere Today</strong><br>
This station carries on that tradition. Our life support systems were designed
by engineers from both nations. The pressure equalization system you see around
you was built by a team from Toulouse and Boston. When you balance the chambers,
you keep everyone safe &mdash; <em>ensemble</em> (together).</p>

<p style="color: #8899aa; font-style: italic; margin-top: 1.5em; border-top: 1px solid #334; padding-top: 0.5em;">
  <strong>Vocabulaire / Vocabulary:</strong><br>
  <em>la lumiere</em> &mdash; the light<br>
  <em>la liberte</em> &mdash; freedom, liberty<br>
  <em>la pression</em> &mdash; pressure<br>
  <em>ensemble</em> &mdash; together<br>
  <em>la cooperation</em> &mdash; cooperation<br>
  <em>le debit</em> &mdash; flow rate<br>
  <em>la vanne</em> &mdash; valve<br>
  <em>la cloison</em> &mdash; bulkhead, partition<br>
  <em>le conduit</em> &mdash; pipe, conduit
</p>

</div>
`;

const PLAQUE_HTML = `
<div style="font-family: 'Courier New', monospace; line-height: 1.7; color: #d4a574;">

<p style="text-align: center; font-size: 1.1em; font-weight: bold; color: #f4a261;">
  STATION LUMIERE
</p>

<p style="text-align: center;">
  Fondee en 2024<br>
  <em>Founded in 2024</em>
</p>

<p style="text-align: center;">
  Un projet conjoint de cooperation<br>
  franco-americaine dans la tradition de<br>
  Lafayette, Rochambeau et la Statue de la Liberte.
</p>

<p style="text-align: center; color: #8899aa; font-style: italic;">
  A joint Franco-American cooperation project<br>
  in the tradition of Lafayette, Rochambeau,<br>
  and the Statue of Liberty.
</p>

<p style="text-align: center; margin-top: 1em; color: #4ecdc4;">
  "La lumiere guide ceux qui cherchent ensemble."<br>
  <span style="color: #8899aa; font-size: 0.9em;">
    "Light guides those who search together."
  </span>
</p>

</div>
`;
