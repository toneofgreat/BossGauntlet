import * as THREE from 'three';
import {
  Engine, Materials, createRoom, createDoor, createTextPlane,
  addSpotlight, addPointLight
} from '../../engine.js';

// ─── Room 6: La Chambre des Etoiles ────────────────────────────────────
// The Star Chamber — final synthesis puzzle for Level 2. A grand
// planetarium-dome room where the player activates five control stations
// (one per previous room theme) to align a star projector and reveal
// the coordinates of the ancient ruins.
//
// Educational integration:
//   Science    — ecosystems, circuits / binary
//   Math       — binary numbers, compass headings
//   French     — number words, sentence completion
//   ELA        — vocabulary synthesis, contextual word choice
//
// Dimensions: 12 x 6 x 12 m (the biggest room in the game)

const ROOM_W = 12;
const ROOM_H = 6;
const ROOM_D = 12;
const DOME_RADIUS = 6;      // half-sphere dome above the room
const STAR_COUNT = 220;      // stars on the dome when fully lit
const STATION_COUNT = 5;

// ── French number words for the combination lock ────────────────────────
const FRENCH_NUMBERS = [
  'ZERO', 'UN', 'DEUX', 'TROIS', 'QUATRE',
  'CINQ', 'SIX', 'SEPT', 'HUIT', 'NEUF'
];

// Station theme colors
const STATION_COLORS = [
  0x22dd66, // Station 1 — Ecosystem (green)
  0x44aaff, // Station 2 — Circuit (blue)
  0xffaa22, // Station 3 — Map (amber)
  0xdd44ff, // Station 4 — Vocabulary (purple)
  0xff4466, // Station 5 — French synthesis (rose)
];

// ── Canvas-texture helpers ──────────────────────────────────────────────

/** Draw a word drum — vertical strip showing the current word with neighbors. */
function createWordDrum(words, initialIndex, highlightColor) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 192;

  function draw(index) {
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#080c14';
    ctx.fillRect(0, 0, 256, 192);

    // Border
    ctx.strokeStyle = highlightColor || '#44aaff';
    ctx.lineWidth = 2;
    ctx.strokeRect(3, 3, 250, 186);

    // Previous word (dim)
    const prev = (index - 1 + words.length) % words.length;
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.font = '18px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText(words[prev], 128, 42);

    // Current word (bright center)
    ctx.fillStyle = highlightColor || '#44aaff';
    ctx.font = 'bold 28px Courier New';
    ctx.fillText(words[index], 128, 100);

    // Next word (dim)
    const next = (index + 1) % words.length;
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.font = '18px Courier New';
    ctx.fillText(words[next], 128, 156);

    // Arrows
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.font = '22px sans-serif';
    ctx.fillText('\u25B2', 128, 18);
    ctx.fillText('\u25BC', 128, 184);
  }

  draw(initialIndex);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshStandardMaterial({
    map: texture,
    emissive: new THREE.Color(highlightColor || 0x44aaff),
    emissiveMap: texture,
    emissiveIntensity: 0.3,
    roughness: 0.15,
    metalness: 0.3
  });

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.3), mat);
  mesh.userData._drumCanvas = canvas;
  mesh.userData._drumDraw = draw;
  mesh.userData._drumTexture = texture;
  return mesh;
}

/** Simple helper to place a mesh. */
function place(parent, geo, mat, x, y, z) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

// ── Main builder ────────────────────────────────────────────────────────

export function buildStarRoom(engine, gameState) {
  const group = new THREE.Group();

  // ── Puzzle state ──────────────────────────────────────────────────────
  const state = {
    stationsActive: [false, false, false, false, false],
    // Station 1: biome selector (0=Desert, 1=MarineReef, 2=Tundra)
    biomeChoice: -1,
    // Station 2: binary switches [false,false,false,false]
    switches: [false, false, false, false],
    // Station 3: compass index (0=N, 1=NE, 2=E, 3=SE, 4=S, 5=SW, 6=W, 7=NW)
    compassIndex: 0,
    // Station 4: vocabulary drum index
    vocabIndex: 0,
    // Station 5: three French-number drums
    lockDigits: [0, 0, 0],
    solved: false,
    time: 0,
    winAnimTime: 0,
    starsRevealed: 0, // 0-1, how many dome stars are lit
    projectorIntensity: 0,
    beamOpacities: [0, 0, 0, 0, 0],
  };

  const TARGET_LOCK = [7, 2, 4]; // SEPT-DEUX-QUATRE

  // ── Room shell (floor + walls, no flat ceiling — dome replaces it) ──
  const wallMat = Materials.wall(0x0a0e1a);
  const floorMat = Materials.floor(0x06080e);
  const room = createRoom(ROOM_W, ROOM_H, ROOM_D, wallMat, floorMat, wallMat);
  // Hide the default flat ceiling — we replace it with a dome
  room.ceil.visible = false;
  group.add(room.group);

  // ── Dome ceiling (half-sphere, rendered from inside) ──────────────────
  const domeGeo = new THREE.SphereGeometry(DOME_RADIUS, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2);
  const domeMat = new THREE.MeshStandardMaterial({
    color: 0x040610,
    roughness: 1.0,
    metalness: 0.0,
    side: THREE.BackSide
  });
  const dome = new THREE.Mesh(domeGeo, domeMat);
  dome.position.set(0, 0, 0);
  group.add(dome);

  // ── Stars on the dome (small emissive spheres placed on surface) ──────
  const starsGroup = new THREE.Group();
  const starMeshes = [];
  const starBaseMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveIntensity: 0,
    roughness: 0.0,
    metalness: 0.0,
    transparent: true,
    opacity: 0
  });

  for (let i = 0; i < STAR_COUNT; i++) {
    // Random point on upper hemisphere
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * (Math.PI / 2) * 0.85; // keep off very bottom edge
    const r = DOME_RADIUS - 0.05;
    const x = r * Math.sin(phi) * Math.cos(theta);
    const y = r * Math.cos(phi);
    const z = r * Math.sin(phi) * Math.sin(theta);

    const size = 0.015 + Math.random() * 0.03;
    const starMat = starBaseMat.clone();
    const star = new THREE.Mesh(new THREE.SphereGeometry(size, 6, 6), starMat);
    star.position.set(x, y, z);
    starMeshes.push({ mesh: star, mat: starMat, phase: Math.random() * Math.PI * 2 });
    starsGroup.add(star);
  }
  group.add(starsGroup);

  // ── Central star projector ────────────────────────────────────────────
  const projectorGroup = new THREE.Group();

  // Pedestal
  const pedestalMat = Materials.metal(0x2a3040);
  place(projectorGroup, new THREE.CylinderGeometry(0.5, 0.6, 0.3, 24), pedestalMat, 0, 0.15, 0);
  place(projectorGroup, new THREE.CylinderGeometry(0.2, 0.3, 1.2, 16), pedestalMat, 0, 0.9, 0);

  // Main sphere
  const projSphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.45, 32, 32),
    new THREE.MeshStandardMaterial({
      color: 0x3a4a5a,
      emissive: 0x223344,
      emissiveIntensity: 0.3,
      roughness: 0.15,
      metalness: 0.9
    })
  );
  projSphere.position.set(0, 1.8, 0);
  projectorGroup.add(projSphere);

  // Emissive points on projector sphere (tiny glowing spots)
  const projDots = [];
  for (let i = 0; i < 40; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI;
    const r = 0.46;
    const dx = r * Math.sin(phi) * Math.cos(theta);
    const dy = r * Math.cos(phi);
    const dz = r * Math.sin(phi) * Math.sin(theta);
    const dotMat = Materials.emissive(0x88aaff, 0.5);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.015, 4, 4), dotMat);
    dot.position.set(dx, 1.8 + dy, dz);
    projectorGroup.add(dot);
    projDots.push(dotMat);
  }

  // Projector top ring
  const projRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.35, 0.03, 8, 32),
    Materials.metal(0x667788)
  );
  projRing.position.set(0, 2.3, 0);
  projRing.rotation.x = Math.PI / 2;
  projectorGroup.add(projRing);

  // Projector light (off initially)
  const projLight = new THREE.PointLight(0x88aaff, 0, 12);
  projLight.position.set(0, 2.0, 0);
  projectorGroup.add(projLight);

  projectorGroup.position.set(0, 0, 0);
  group.add(projectorGroup);

  // ── Light beams from stations to projector (thin emissive cylinders) ──
  const beams = [];
  const stationPositions = getStationPositions();

  for (let i = 0; i < STATION_COUNT; i++) {
    const sPos = stationPositions[i];
    const beamStart = new THREE.Vector3(sPos.x, 1.5, sPos.z);
    const beamEnd = new THREE.Vector3(0, 1.8, 0);

    const dir = new THREE.Vector3().subVectors(beamEnd, beamStart);
    const len = dir.length();
    dir.normalize();

    const beamGeo = new THREE.CylinderGeometry(0.02, 0.02, len, 8, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({
      color: STATION_COLORS[i],
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    const beamMesh = new THREE.Mesh(beamGeo, beamMat);

    // Position at midpoint between start and end
    beamMesh.position.lerpVectors(beamStart, beamEnd, 0.5);

    // Orient along direction
    const up = new THREE.Vector3(0, 1, 0);
    const quat = new THREE.Quaternion();
    quat.setFromUnitVectors(up, dir);
    beamMesh.quaternion.copy(quat);

    beamMesh.visible = false;
    group.add(beamMesh);

    // Glow halo around beam
    const glowGeo = new THREE.CylinderGeometry(0.06, 0.06, len, 8, 1, true);
    const glowMat = new THREE.MeshBasicMaterial({
      color: STATION_COLORS[i],
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const glowMesh = new THREE.Mesh(glowGeo, glowMat);
    glowMesh.position.copy(beamMesh.position);
    glowMesh.quaternion.copy(beamMesh.quaternion);
    glowMesh.visible = false;
    group.add(glowMesh);

    beams.push({ mesh: beamMesh, mat: beamMat, glow: glowMesh, glowMat });
  }

  // ── Final discovery beam (points upward through dome) ─────────────────
  const discoveryBeamMat = new THREE.MeshBasicMaterial({
    color: 0xffeedd,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const discoveryBeam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.02, DOME_RADIUS + 1, 12, 1, true),
    discoveryBeamMat
  );
  discoveryBeam.position.set(0, 2.0 + (DOME_RADIUS + 1) / 2, 0);
  discoveryBeam.visible = false;
  group.add(discoveryBeam);

  // ── Coordinate display (appears after win) ────────────────────────────
  const coordLabel = createTextPlane(
    'COORDONNEES DES RUINES ANCIENNES\n--- VERROUILLEES ---',
    2.4, 0.5, 16, '#ff4466', 'rgba(5,5,15,0.92)'
  );
  coordLabel.position.set(0, 4.5, -ROOM_D / 2 + 0.08);
  group.add(coordLabel);

  // ── Build the five stations ───────────────────────────────────────────

  function getStationPositions() {
    // Five stations spread around the perimeter in an arc
    const positions = [];
    const radius = ROOM_W / 2 - 1.2;
    for (let i = 0; i < STATION_COUNT; i++) {
      const angle = (Math.PI * 0.2) + (i / (STATION_COUNT - 1)) * (Math.PI * 0.6);
      positions.push({
        x: -Math.cos(angle) * radius,
        z: -Math.sin(angle) * radius + 1.0
      });
    }
    return positions;
  }

  const stationGroups = [];
  const stationLights = [];

  for (let i = 0; i < STATION_COUNT; i++) {
    const pos = stationPositions[i];
    const sg = buildStation(i, pos);
    stationGroups.push(sg);
    group.add(sg.group);

    // Colored point light at each station
    const sl = addPointLight(group, new THREE.Vector3(pos.x, 2.2, pos.z), STATION_COLORS[i], 0.6, 4);
    stationLights.push(sl);
  }

  // ── Station builders ──────────────────────────────────────────────────

  function buildStation(index, pos) {
    const sg = new THREE.Group();
    sg.position.set(pos.x, 0, pos.z);

    // Face the projector at center
    sg.lookAt(new THREE.Vector3(0, 0, 0));
    sg.rotation.x = 0; // keep upright
    sg.rotation.z = 0;

    const color = STATION_COLORS[index];

    // Console body
    const consoleMat = Materials.metal(0x1a2030);
    place(sg, new THREE.BoxGeometry(1.4, 1.0, 0.6), consoleMat, 0, 0.5, 0);

    // Top surface
    const topMat = Materials.metal(0x2a3040);
    place(sg, new THREE.BoxGeometry(1.4, 0.06, 0.65), topMat, 0, 1.03, 0);

    // Side trim (emissive, station color)
    const trimMat = Materials.emissive(color, 1.0);
    place(sg, new THREE.BoxGeometry(1.42, 0.03, 0.02), trimMat, 0, 1.06, 0.32);
    place(sg, new THREE.BoxGeometry(1.42, 0.03, 0.02), trimMat, 0, 1.06, -0.32);

    // Status indicator (off = red, on = station color)
    const indicatorMat = Materials.emissiveWarn(0x662222, 0.8);
    const indicator = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 12), indicatorMat);
    indicator.position.set(0.55, 1.12, 0);
    sg.add(indicator);

    // Back panel / vertical display
    const panelMat = Materials.metal(0x121820);
    place(sg, new THREE.BoxGeometry(1.2, 1.0, 0.1), panelMat, 0, 1.6, -0.25);

    // Build station-specific controls
    switch (index) {
      case 0: buildStation1_Ecosystem(sg, color); break;
      case 1: buildStation2_Circuit(sg, color); break;
      case 2: buildStation3_Map(sg, color); break;
      case 3: buildStation4_Vocabulary(sg, color); break;
      case 4: buildStation5_French(sg, color); break;
    }

    return { group: sg, indicator, indicatorMat, trimMat };
  }

  // ── Station 1: Ecosystem (Biome Selector) ─────────────────────────────
  function buildStation1_Ecosystem(sg, color) {
    // Label
    const label = createTextPlane("STATION 1: L'ECOSYSTEME", 1.1, 0.18, 13, '#22dd66', 'rgba(0,0,0,0.85)');
    label.position.set(0, 2.2, -0.19);
    sg.add(label);

    // Description
    const desc = createTextPlane('Selectionnez le biome correct', 1.0, 0.12, 10, '#aaccaa', 'rgba(0,0,0,0)');
    desc.position.set(0, 2.0, -0.19);
    sg.add(desc);

    // Three biome icons as clickable panels
    const biomes = ['DESERT', 'RECIF MARIN', 'TOUNDRA'];
    const biomeIcons = ['\u{1F3DC}', '\u{1F41F}', '\u{2744}'];
    const biomeColors = ['#cc8833', '#22aadd', '#aaccee'];

    biomes.forEach((biome, bi) => {
      const bx = -0.4 + bi * 0.4;
      const panel = createTextPlane(biome, 0.35, 0.3, 9, biomeColors[bi], 'rgba(10,15,20,0.9)');
      panel.position.set(bx, 1.55, -0.19);
      sg.add(panel);

      engine.registerInteractive(panel, {
        type: 'click',
        prompt: `Select: ${biome}`,
        icon: biomeIcons[bi],
        onInteract: () => {
          if (state.stationsActive[0] || state.solved) return;
          state.biomeChoice = bi;
          engine.playEffect('click');
          if (bi === 1) { // Marine Reef is correct
            activateStation(0);
          } else {
            engine.showObjective('Incorrect biome. Recall the lesson from L\'Ecosysteme -- which ecosystem thrives beneath the waves?');
          }
        }
      });
    });
  }

  // ── Station 2: Circuit (Binary Switches) ──────────────────────────────
  function buildStation2_Circuit(sg, color) {
    const label = createTextPlane('STATION 2: LE CIRCUIT', 1.1, 0.18, 13, '#44aaff', 'rgba(0,0,0,0.85)');
    label.position.set(0, 2.2, -0.19);
    sg.add(label);

    const desc = createTextPlane('Entrez le code binaire (11 constellations)', 1.0, 0.12, 9, '#88aacc', 'rgba(0,0,0,0)');
    desc.position.set(0, 2.0, -0.19);
    sg.add(desc);

    // Four switches
    const switchMeshes = [];
    const switchLabels = [];

    for (let si = 0; si < 4; si++) {
      const sx = -0.3 + si * 0.2;

      // Switch background (dark groove)
      const groove = place(sg, new THREE.BoxGeometry(0.1, 0.25, 0.04), Materials.metal(0x0a0e14), sx, 1.55, -0.17);

      // Switch handle (starts in OFF/down position)
      const handleMat = Materials.emissiveWarn(0x443333, 1.0);
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.06), handleMat);
      handle.position.set(sx, 1.48, -0.13);
      sg.add(handle);
      switchMeshes.push({ mesh: handle, mat: handleMat });

      // Bit label
      const bitLabel = createTextPlane('0', 0.08, 0.08, 12, '#446688', 'rgba(0,0,0,0)');
      bitLabel.position.set(sx, 1.35, -0.19);
      sg.add(bitLabel);
      switchLabels.push(bitLabel);

      engine.registerInteractive(handle, {
        type: 'click',
        prompt: `Toggle Switch ${si + 1}`,
        icon: '\u{26A1}',
        onInteract: () => {
          if (state.stationsActive[1] || state.solved) return;
          state.switches[si] = !state.switches[si];
          engine.playEffect('click');

          // Update visual
          if (state.switches[si]) {
            handle.position.set(sx, 1.62, -0.13);
            handleMat.color.set(0x44aaff);
            handleMat.emissive.set(0x44aaff);
            handleMat.emissiveIntensity = 2.0;
          } else {
            handle.position.set(sx, 1.48, -0.13);
            handleMat.color.set(0x443333);
            handleMat.emissive.set(0x443333);
            handleMat.emissiveIntensity = 1.0;
          }

          // Update bit label
          updateSwitchLabel(si, switchLabels[si]);

          // Check: 1011 = ON,OFF,ON,ON
          const pattern = [true, false, true, true];
          const allCorrect = state.switches.every((v, idx) => v === pattern[idx]);
          if (allCorrect) {
            activateStation(1);
          }
        }
      });
    }

    function updateSwitchLabel(si, labelMesh) {
      const val = state.switches[si] ? '1' : '0';
      const col = state.switches[si] ? '#44aaff' : '#446688';
      const newLabel = createTextPlane(val, 0.08, 0.08, 12, col, 'rgba(0,0,0,0)');
      labelMesh.material.dispose();
      labelMesh.geometry.dispose();
      labelMesh.material = newLabel.material;
      labelMesh.geometry = newLabel.geometry;
    }
  }

  // ── Station 3: Map (Compass Heading) ──────────────────────────────────
  function buildStation3_Map(sg, color) {
    const label = createTextPlane('STATION 3: LA CARTE', 1.1, 0.18, 13, '#ffaa22', 'rgba(0,0,0,0.85)');
    label.position.set(0, 2.2, -0.19);
    sg.add(label);

    const desc = createTextPlane('Selectionnez le cap correct', 1.0, 0.12, 10, '#ccaa88', 'rgba(0,0,0,0)');
    desc.position.set(0, 2.0, -0.19);
    sg.add(desc);

    const headings = ['NORD', 'NORD-EST', 'EST', 'SUD-EST', 'SUD', 'SUD-OUEST', 'OUEST', 'NORD-OUEST'];
    const drumColor = '#ffaa22';

    const drum = createWordDrum(headings, state.compassIndex, drumColor);
    drum.position.set(0, 1.55, -0.14);
    sg.add(drum);

    // Up arrow hit zone
    const upZone = new THREE.Mesh(
      new THREE.PlaneGeometry(0.4, 0.12),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    upZone.position.set(0, 1.72, -0.12);
    sg.add(upZone);

    // Down arrow hit zone
    const downZone = new THREE.Mesh(
      new THREE.PlaneGeometry(0.4, 0.12),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    downZone.position.set(0, 1.38, -0.12);
    sg.add(downZone);

    engine.registerInteractive(upZone, {
      type: 'click',
      prompt: 'Previous heading \u25B2',
      icon: '\u{1F9ED}',
      onInteract: () => {
        if (state.stationsActive[2] || state.solved) return;
        state.compassIndex = (state.compassIndex - 1 + headings.length) % headings.length;
        drum.userData._drumDraw(state.compassIndex);
        drum.userData._drumTexture.needsUpdate = true;
        engine.playEffect('click');
      }
    });

    engine.registerInteractive(downZone, {
      type: 'click',
      prompt: 'Next heading \u25BC',
      icon: '\u{1F9ED}',
      onInteract: () => {
        if (state.stationsActive[2] || state.solved) return;
        state.compassIndex = (state.compassIndex + 1) % headings.length;
        drum.userData._drumDraw(state.compassIndex);
        drum.userData._drumTexture.needsUpdate = true;
        engine.playEffect('click');
      }
    });

    // Confirm button
    const confirmBtn = place(sg, new THREE.BoxGeometry(0.3, 0.1, 0.08),
      Materials.emissive(0xffaa22, 1.5), 0, 1.2, -0.13);
    const confirmLabel = createTextPlane('CONFIRMER', 0.28, 0.08, 10, '#ffffff', 'rgba(0,0,0,0)');
    confirmLabel.position.set(0, 1.2, -0.08);
    sg.add(confirmLabel);

    engine.registerInteractive(confirmBtn, {
      type: 'click',
      prompt: 'Confirm heading',
      icon: '\u2713',
      onInteract: () => {
        if (state.stationsActive[2] || state.solved) return;
        engine.playEffect('click');
        if (state.compassIndex === 7) { // NORD-OUEST
          activateStation(2);
        } else {
          engine.showObjective('Incorrect heading. Remember the bearing from La Carte -- Nord-Ouest!');
        }
      }
    });
  }

  // ── Station 4: Vocabulary (Word Drum) ─────────────────────────────────
  function buildStation4_Vocabulary(sg, color) {
    const label = createTextPlane('STATION 4: LE VOCABULAIRE', 1.1, 0.18, 13, '#dd44ff', 'rgba(0,0,0,0.85)');
    label.position.set(0, 2.2, -0.19);
    sg.add(label);

    // Sentence on the panel
    const sentence = createTextPlane('"The expedition set out to _____ what lay beneath the waves."', 1.1, 0.2, 9, '#ccaaee', 'rgba(5,5,15,0.85)');
    sentence.position.set(0, 1.95, -0.19);
    sg.add(sentence);

    const words = ['ELABORATE', 'NAVIGATE', 'DISCOVER', 'PERSPECTIVE', 'SIGNIFICANT'];
    // Correct answer is DISCOVER (index 2)

    const drum = createWordDrum(words, state.vocabIndex, '#dd44ff');
    drum.position.set(0, 1.55, -0.14);
    sg.add(drum);

    // Up hit zone
    const upZone = new THREE.Mesh(
      new THREE.PlaneGeometry(0.4, 0.12),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    upZone.position.set(0, 1.72, -0.12);
    sg.add(upZone);

    // Down hit zone
    const downZone = new THREE.Mesh(
      new THREE.PlaneGeometry(0.4, 0.12),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    downZone.position.set(0, 1.38, -0.12);
    sg.add(downZone);

    engine.registerInteractive(upZone, {
      type: 'click',
      prompt: 'Previous word \u25B2',
      icon: '\u{1F4D6}',
      onInteract: () => {
        if (state.stationsActive[3] || state.solved) return;
        state.vocabIndex = (state.vocabIndex - 1 + words.length) % words.length;
        drum.userData._drumDraw(state.vocabIndex);
        drum.userData._drumTexture.needsUpdate = true;
        engine.playEffect('click');
      }
    });

    engine.registerInteractive(downZone, {
      type: 'click',
      prompt: 'Next word \u25BC',
      icon: '\u{1F4D6}',
      onInteract: () => {
        if (state.stationsActive[3] || state.solved) return;
        state.vocabIndex = (state.vocabIndex + 1) % words.length;
        drum.userData._drumDraw(state.vocabIndex);
        drum.userData._drumTexture.needsUpdate = true;
        engine.playEffect('click');
      }
    });

    // Confirm button
    const confirmBtn = place(sg, new THREE.BoxGeometry(0.3, 0.1, 0.08),
      Materials.emissive(0xdd44ff, 1.5), 0, 1.2, -0.13);
    const confirmLabel = createTextPlane('CONFIRMER', 0.28, 0.08, 10, '#ffffff', 'rgba(0,0,0,0)');
    confirmLabel.position.set(0, 1.2, -0.08);
    sg.add(confirmLabel);

    engine.registerInteractive(confirmBtn, {
      type: 'click',
      prompt: 'Confirm word / Decouvrir',
      icon: '\u2713',
      onInteract: () => {
        if (state.stationsActive[3] || state.solved) return;
        engine.playEffect('click');
        if (state.vocabIndex === 2) { // DISCOVER
          activateStation(3);
        } else {
          engine.showObjective('Not quite. Which word means to find something new? Think: DECOUVRIR.');
        }
      }
    });
  }

  // ── Station 5: French Number Combination Lock ─────────────────────────
  function buildStation5_French(sg, color) {
    const label = createTextPlane('STATION 5: LA SYNTHESE', 1.1, 0.18, 13, '#ff4466', 'rgba(0,0,0,0.85)');
    label.position.set(0, 2.2, -0.19);
    sg.add(label);

    const desc = createTextPlane('Code en francais: SEPT - ? - ?', 1.0, 0.12, 10, '#cc8899', 'rgba(0,0,0,0)');
    desc.position.set(0, 2.0, -0.19);
    sg.add(desc);

    // Three drums, each showing French number words
    for (let di = 0; di < 3; di++) {
      const dx = -0.35 + di * 0.35;
      const drum = createWordDrum(FRENCH_NUMBERS, state.lockDigits[di], '#ff4466');
      drum.position.set(dx, 1.55, -0.14);
      sg.add(drum);

      // Up zone
      const upZone = new THREE.Mesh(
        new THREE.PlaneGeometry(0.3, 0.1),
        new THREE.MeshBasicMaterial({ visible: false })
      );
      upZone.position.set(dx, 1.72, -0.12);
      sg.add(upZone);

      // Down zone
      const downZone = new THREE.Mesh(
        new THREE.PlaneGeometry(0.3, 0.1),
        new THREE.MeshBasicMaterial({ visible: false })
      );
      downZone.position.set(dx, 1.38, -0.12);
      sg.add(downZone);

      const drumIdx = di; // closure capture

      engine.registerInteractive(upZone, {
        type: 'click',
        prompt: `Drum ${drumIdx + 1} \u25B2`,
        icon: '\u{1F522}',
        onInteract: () => {
          if (state.stationsActive[4] || state.solved) return;
          state.lockDigits[drumIdx] = (state.lockDigits[drumIdx] - 1 + FRENCH_NUMBERS.length) % FRENCH_NUMBERS.length;
          drum.userData._drumDraw(state.lockDigits[drumIdx]);
          drum.userData._drumTexture.needsUpdate = true;
          engine.playEffect('click');
        }
      });

      engine.registerInteractive(downZone, {
        type: 'click',
        prompt: `Drum ${drumIdx + 1} \u25BC`,
        icon: '\u{1F522}',
        onInteract: () => {
          if (state.stationsActive[4] || state.solved) return;
          state.lockDigits[drumIdx] = (state.lockDigits[drumIdx] + 1) % FRENCH_NUMBERS.length;
          drum.userData._drumDraw(state.lockDigits[drumIdx]);
          drum.userData._drumTexture.needsUpdate = true;
          engine.playEffect('click');
        }
      });
    }

    // Confirm button
    const confirmBtn = place(sg, new THREE.BoxGeometry(0.3, 0.1, 0.08),
      Materials.emissive(0xff4466, 1.5), 0, 1.2, -0.13);
    const confirmLabel = createTextPlane('CONFIRMER', 0.28, 0.08, 10, '#ffffff', 'rgba(0,0,0,0)');
    confirmLabel.position.set(0, 1.2, -0.08);
    sg.add(confirmLabel);

    engine.registerInteractive(confirmBtn, {
      type: 'click',
      prompt: 'Enter combination',
      icon: '\u{1F510}',
      onInteract: () => {
        if (state.stationsActive[4] || state.solved) return;
        engine.playEffect('click');
        const correct = state.lockDigits[0] === TARGET_LOCK[0] &&
                         state.lockDigits[1] === TARGET_LOCK[1] &&
                         state.lockDigits[2] === TARGET_LOCK[2];
        if (correct) {
          activateStation(4);
        } else {
          engine.showObjective('Incorrect code. Clues: 7 from Lafayette (1777), 2 from the cipher, 4 from the frequency.');
        }
      }
    });
  }

  // ── Station activation logic ──────────────────────────────────────────
  function activateStation(index) {
    if (state.stationsActive[index]) return;
    state.stationsActive[index] = true;

    engine.playEffect('success');

    // Update station indicator to green/lit
    const sg = stationGroups[index];
    sg.indicatorMat.color.set(STATION_COLORS[index]);
    sg.indicatorMat.emissive.set(STATION_COLORS[index]);
    sg.indicatorMat.emissiveIntensity = 3.0;

    // Brighten station light
    stationLights[index].intensity = 2.5;

    // Reveal beam
    beams[index].mesh.visible = true;
    beams[index].glow.visible = true;
    state.beamOpacities[index] = 0.01; // will animate up in update

    // Sparks at station
    const pos = stationPositions[index];
    engine.addSparks(new THREE.Vector3(pos.x, 1.5, pos.z));

    // Partially light the dome
    state.starsRevealed = state.stationsActive.filter(Boolean).length / STATION_COUNT;

    // Show progress
    const activeCount = state.stationsActive.filter(Boolean).length;
    if (activeCount < STATION_COUNT) {
      engine.showObjective(`Stations activated: ${activeCount}/${STATION_COUNT} -- Continue aligning the projector.`);
    }

    // Check win
    if (activeCount === STATION_COUNT) {
      setTimeout(() => triggerWin(), 800);
    }
  }

  // ── Win sequence ──────────────────────────────────────────────────────
  function triggerWin() {
    if (state.solved) return;
    state.solved = true;
    state.winAnimTime = 0;

    engine.playEffect('powerup');
    setTimeout(() => engine.playEffect('success'), 600);
    setTimeout(() => engine.playEffect('powerup'), 1200);

    // Sparks from projector
    engine.addSparks(new THREE.Vector3(0, 2.0, 0), 60);
    setTimeout(() => engine.addSparks(new THREE.Vector3(0, 2.5, 0), 40), 400);
    setTimeout(() => engine.addSparks(new THREE.Vector3(0, 3.0, 0), 40), 800);

    // Show the discovery beam
    discoveryBeam.visible = true;

    // Update coordinate label
    setTimeout(() => {
      group.remove(coordLabel);
      const newCoord = createTextPlane(
        'COORDONNEES DES RUINES ANCIENNES\n--- DEVERROUILLEES! ---\n47.3N  32.8W  Profondeur: 2,400m',
        2.4, 0.6, 14, '#44ffaa', 'rgba(5,10,15,0.92)'
      );
      newCoord.position.set(0, 4.5, -ROOM_D / 2 + 0.08);
      group.add(newCoord);
    }, 1500);

    engine.hideObjective();

    setTimeout(() => {
      engine.showCompletion('Les Etoiles sont alignees -- Ruines localisees!');
    }, 500);

    setTimeout(() => {
      engine.showNarrative('La Chambre des Etoiles -- Mission Accomplie', `
        <p style="color:#44ffaa;font-family:'Courier New',monospace;font-size:0.9em;margin-bottom:0.8em;">
          STAR PROJECTOR -- FULLY ALIGNED<br>
          ANCIENT RUINS COORDINATES -- UNLOCKED
        </p>

        <p>The five beams converge on the star projector. With a deep harmonic hum,
        the dome erupts into a brilliant field of constellations. A single beam of
        white light lances upward through the dome, tracing a path across the
        projected sky.</p>

        <p>The coordinates appear on the observatory display:
        <span style="color:#ffcc44;">47.3&deg;N, 32.8&deg;W -- Depth: 2,400 meters.</span></p>

        <p>You have done what no one thought possible. Using your knowledge of
        <em style="color:#22dd66;">ecosystems</em>,
        <em style="color:#44aaff;">circuits</em>,
        <em style="color:#ffaa22;">navigation</em>,
        <em style="color:#dd44ff;">vocabulary</em>, and
        <em style="color:#ff4466;">French</em>,
        you have unlocked the location of the ancient ruins hidden
        beneath the Atlantic.</p>

        <p style="color:#88aacc;font-style:italic;">
        "To <em>discover</em> is to see what everyone has seen and think what no one
        has thought." The <em>significant</em> findings of this expedition will
        offer a new <em>perspective</em> on the <em>elaborate</em> civilizations
        that once <em>navigated</em> these deep waters.</p>

        <p style="color:#ffcc44;font-weight:bold;margin-top:1em;">
        F&eacute;licitations! The deep-sea beacon is activated.
        <br>The expedition to the ruins can begin.</p>

        <p style="color:#667;font-size:0.8em;margin-top:1em;">
          &mdash; Observatoire Sous-Marin, La Chambre des &Eacute;toiles<br>
          Niveau 2 -- Les Profondeurs -- COMPL&Eacute;T&Eacute;
        </p>
      `);
    }, 3000);

    // Update game state
    if (gameState) {
      gameState.starRoomComplete = true;
      if (gameState.completedRooms) {
        gameState.completedRooms.add('starRoom');
      }
    }
  }

  // ── Wall inscriptions and decorative elements ─────────────────────────

  // Room title plaque (above back door, facing inward)
  const titlePlaque = createTextPlane('LA CHAMBRE DES ETOILES', 2.8, 0.35, 22, '#aabbdd', 'rgba(5,8,18,0.92)');
  titlePlaque.position.set(0, 3.5, ROOM_D / 2 - 0.06);
  titlePlaque.rotation.y = Math.PI;
  group.add(titlePlaque);

  const subtitlePlaque = createTextPlane('OBSERVATOIRE SOUS-MARIN', 2.2, 0.2, 14, '#667799', 'rgba(0,0,0,0)');
  subtitlePlaque.position.set(0, 3.2, ROOM_D / 2 - 0.06);
  subtitlePlaque.rotation.y = Math.PI;
  group.add(subtitlePlaque);

  // Wall inscriptions referencing vocabulary
  const inscriptions = [
    { text: 'ECOSYSTEM / ECOSYSTEME', x: -ROOM_W / 2 + 0.06, z: -2, ry: Math.PI / 2, color: '#22dd66' },
    { text: 'CIRCUIT / LE CIRCUIT', x: -ROOM_W / 2 + 0.06, z: 2, ry: Math.PI / 2, color: '#44aaff' },
    { text: 'NAVIGATE / NAVIGUER', x: ROOM_W / 2 - 0.06, z: -2, ry: -Math.PI / 2, color: '#ffaa22' },
    { text: 'DISCOVER / DECOUVRIR', x: ROOM_W / 2 - 0.06, z: 2, ry: -Math.PI / 2, color: '#dd44ff' },
    { text: 'ELABORATE / ELABORER', x: -3, z: -ROOM_D / 2 + 0.06, ry: 0, color: '#88aacc' },
    { text: 'PERSPECTIVE', x: 0, z: -ROOM_D / 2 + 0.06, ry: 0, color: '#88aacc' },
    { text: 'SIGNIFICANT / SIGNIFICATIF', x: 3, z: -ROOM_D / 2 + 0.06, ry: 0, color: '#88aacc' },
  ];

  inscriptions.forEach(ins => {
    const tp = createTextPlane(ins.text, 1.4, 0.18, 11, ins.color, 'rgba(5,8,18,0.7)');
    tp.position.set(ins.x, 4.2, ins.z);
    tp.rotation.y = ins.ry;
    group.add(tp);
  });

  // ── Floor details (circular pattern around projector) ─────────────────
  const ringGeo = new THREE.RingGeometry(1.0, 1.05, 48);
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0x223344,
    emissive: 0x223344,
    emissiveIntensity: 0.4,
    roughness: 0.5,
    metalness: 0.5,
    side: THREE.DoubleSide
  });
  const floorRing = new THREE.Mesh(ringGeo, ringMat);
  floorRing.rotation.x = -Math.PI / 2;
  floorRing.position.set(0, 0.01, 0);
  group.add(floorRing);

  // Outer ring
  const outerRingGeo = new THREE.RingGeometry(2.5, 2.55, 48);
  const outerRing = new THREE.Mesh(outerRingGeo, ringMat.clone());
  outerRing.rotation.x = -Math.PI / 2;
  outerRing.position.set(0, 0.01, 0);
  group.add(outerRing);

  // Radial lines from projector to each station
  const radialMat = new THREE.LineBasicMaterial({ color: 0x1a2a3a, transparent: true, opacity: 0.6 });
  stationPositions.forEach(sp => {
    const pts = [new THREE.Vector3(0, 0.01, 0), new THREE.Vector3(sp.x, 0.01, sp.z)];
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), radialMat);
    group.add(line);
  });

  // ── Decorative pipes along walls ──────────────────────────────────────
  const pipeMat = Materials.metal(0x2a3444);
  for (let i = 0; i < 4; i++) {
    const pipe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, ROOM_W, 8),
      pipeMat
    );
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(0, ROOM_H - 0.3 - i * 0.08, -ROOM_D / 2 + 0.3);
    group.add(pipe);
  }

  // ── Lighting ──────────────────────────────────────────────────────────
  // Very dim ambient — dome should feel dark and dramatic
  const ambient = new THREE.AmbientLight(0x060810, 0.15);
  group.add(ambient);

  const hemi = new THREE.HemisphereLight(0x0a1020, 0x000000, 0.2);
  group.add(hemi);

  // Spotlight on projector
  addSpotlight(engine.scene, new THREE.Vector3(0, ROOM_H - 0.5, 0), new THREE.Vector3(0, 1.8, 0), 0x88aacc, 2.0, 0.5);

  // Dim blue fill from the dome
  addPointLight(group, new THREE.Vector3(0, DOME_RADIUS - 0.5, 0), 0x112244, 0.8, DOME_RADIUS);

  // Faint warm light near entrance
  addPointLight(group, new THREE.Vector3(0, 2, ROOM_D / 2 - 1), 0x1a2a4a, 0.5, 5);

  // ── Door (back to Level 2 hub) ────────────────────────────────────────
  const backDoor = createDoor(1.4, 2.4, 0x1e2844);
  backDoor.group.position.set(0, 0, ROOM_D / 2);
  backDoor.group.rotation.y = Math.PI;
  group.add(backDoor.group);

  engine.registerInteractive(backDoor.doorPanel, {
    type: 'click',
    prompt: 'Return / Retourner',
    icon: '\uD83D\uDEAA',
    onInteract: () => {
      engine.playEffect('clunk');
      if (returnObj.doors.back.onInteract) {
        returnObj.doors.back.onInteract();
      }
    }
  });

  // ── Lifecycle ─────────────────────────────────────────────────────────

  function enter() {
    engine.camera.position.set(0, 1.6, ROOM_D / 2 - 1.5);
    engine.setRoomBounds(-ROOM_W / 2 + 0.5, ROOM_W / 2 - 0.5, -ROOM_D / 2 + 0.5, ROOM_D / 2 - 0.5);

    engine.showRoomTitle('La Chambre des Etoiles', 'Observatoire Sous-Marin -- Level 2 Finale');

    // Deep ambient hum (planetarium feel)
    engine.playAmbient(40, 'sine', 0.07);
    engine.playAmbient(80, 'triangle', 0.025);
    engine.playAmbient(120, 'sine', 0.015);

    // Dust / mote particles
    engine.addDust({
      minX: -ROOM_W / 2,
      maxX: ROOM_W / 2,
      minZ: -ROOM_D / 2,
      maxZ: ROOM_D / 2,
      height: ROOM_H
    });

    // Objective
    if (!state.solved) {
      const activeCount = state.stationsActive.filter(Boolean).length;
      if (activeCount === 0) {
        engine.showObjective('Activate all 5 stations to align the star projector.');
      } else {
        engine.showObjective(`Stations activated: ${activeCount}/${STATION_COUNT} -- Continue aligning the projector.`);
      }
    } else {
      engine.showObjective('Star projector aligned. The ruins have been located.');
    }
  }

  function exit() {
    engine.stopAmbient();
    engine.clearParticles();
    engine.hideObjective();
  }

  function update(delta) {
    state.time += delta;

    // ── Projector rotation ──────────────────────────────────────────────
    projSphere.rotation.y += delta * 0.3;
    projRing.rotation.z += delta * 0.15;

    // Projector dot pulsing
    const dotPulse = 0.3 + Math.sin(state.time * 2.0) * 0.2;
    const activeCount = state.stationsActive.filter(Boolean).length;
    const dotTarget = 0.5 + (activeCount / STATION_COUNT) * 3.5;
    projDots.forEach((mat, i) => {
      mat.emissiveIntensity = dotPulse + (activeCount / STATION_COUNT) * 1.0 + Math.sin(state.time * 3 + i) * 0.2;
    });

    // Projector main light intensity scales with progress
    const projTarget = activeCount * 1.0;
    projLight.intensity += (projTarget - projLight.intensity) * delta * 2;

    // Projector sphere emissive ramp
    const sphereTarget = 0.3 + (activeCount / STATION_COUNT) * 2.0;
    projSphere.material.emissiveIntensity += (sphereTarget - projSphere.material.emissiveIntensity) * delta * 2;
    if (activeCount > 0) {
      projSphere.material.emissive.set(0x88aaff);
    }

    // ── Beam animations ─────────────────────────────────────────────────
    for (let i = 0; i < STATION_COUNT; i++) {
      if (state.stationsActive[i]) {
        const targetOpacity = 0.55 + Math.sin(state.time * 2.5 + i * 1.2) * 0.15;
        state.beamOpacities[i] += (targetOpacity - state.beamOpacities[i]) * delta * 3;
        beams[i].mat.opacity = state.beamOpacities[i];
        beams[i].glowMat.opacity = state.beamOpacities[i] * 0.25;
      }
    }

    // ── Station light pulsing ───────────────────────────────────────────
    for (let i = 0; i < STATION_COUNT; i++) {
      if (!state.stationsActive[i]) {
        // Subtle idle pulse
        stationLights[i].intensity = 0.4 + Math.sin(state.time * 1.5 + i * 1.3) * 0.2;

        // Pulse station indicator
        const sg = stationGroups[i];
        sg.indicatorMat.emissiveIntensity = 0.5 + Math.sin(state.time * 2.0 + i) * 0.3;
      } else {
        // Active: bright steady glow with subtle pulse
        stationLights[i].intensity = 2.0 + Math.sin(state.time * 3.0 + i * 0.8) * 0.5;
      }
    }

    // ── Dome star reveal ────────────────────────────────────────────────
    const starTarget = state.solved ? 1.0 : state.starsRevealed;
    const revealSpeed = state.solved ? 0.5 : 2.0;
    // Smoothly animate star reveal
    const currentReveal = starMeshes.filter(s => s.mat.opacity > 0.05).length / STAR_COUNT;

    starMeshes.forEach((starData, i) => {
      const threshold = i / STAR_COUNT;
      if (threshold <= starTarget) {
        // Should be visible
        const fadeTarget = 0.5 + Math.sin(state.time * 1.5 + starData.phase) * 0.3;
        starData.mat.opacity += (fadeTarget - starData.mat.opacity) * delta * revealSpeed;
        starData.mat.emissiveIntensity += (2.0 + Math.sin(state.time * 2 + starData.phase) * 1.0 - starData.mat.emissiveIntensity) * delta * revealSpeed;
      } else {
        // Should be hidden
        starData.mat.opacity += (0 - starData.mat.opacity) * delta * 4;
        starData.mat.emissiveIntensity += (0 - starData.mat.emissiveIntensity) * delta * 4;
      }
    });

    // ── Win animation ───────────────────────────────────────────────────
    if (state.solved) {
      state.winAnimTime += delta;

      // Discovery beam fades in and pulses
      const beamAlpha = Math.min(1, state.winAnimTime * 0.5);
      discoveryBeamMat.opacity = beamAlpha * (0.5 + Math.sin(state.time * 4) * 0.15);

      // Dome brightens
      domeMat.color.lerp(new THREE.Color(0x0a1428), delta * 0.5);

      // All station beams brighten
      for (let i = 0; i < STATION_COUNT; i++) {
        const peak = 0.7 + Math.sin(state.time * 3.0 + i * 0.8) * 0.2;
        beams[i].mat.opacity += (peak - beams[i].mat.opacity) * delta * 2;
        beams[i].glowMat.opacity += (peak * 0.3 - beams[i].glowMat.opacity) * delta * 2;
      }

      // Projector goes brilliant
      projLight.intensity += (8.0 - projLight.intensity) * delta * 1.5;
      projLight.color.lerp(new THREE.Color(0xffeedd), delta * 2);
      projSphere.material.emissiveIntensity += (5.0 - projSphere.material.emissiveIntensity) * delta * 1.5;

      // Floor ring glows
      ringMat.emissiveIntensity += (2.0 - ringMat.emissiveIntensity) * delta * 2;
      ringMat.emissive.lerp(new THREE.Color(0x44ffaa), delta * 2);

      // Back door status light to green
      if (state.winAnimTime > 1.0) {
        backDoor.statusLight.material.color.lerp(new THREE.Color(0x44ffaa), delta * 3);
        backDoor.statusLight.material.emissive.lerp(new THREE.Color(0x44ffaa), delta * 3);
        backDoor.statusLight.material.emissiveIntensity = 3.0;
      }
    }

    // ── Idle dome ambient twinkle (even before any stations lit) ─────────
    if (!state.solved && activeCount === 0) {
      // Very faint twinkle on a few random stars to hint at what's coming
      for (let i = 0; i < 8; i++) {
        const idx = Math.floor(i * STAR_COUNT / 8);
        const starData = starMeshes[idx];
        const twinkle = Math.sin(state.time * 0.8 + starData.phase * 4) * 0.5 + 0.5;
        starData.mat.opacity = twinkle * 0.06;
        starData.mat.emissiveIntensity = twinkle * 0.3;
      }
    }
  }

  // ── Return room interface ─────────────────────────────────────────────
  const returnObj = {
    group,
    enter,
    exit,
    update,
    get isComplete() { return state.solved; },
    doors: {
      back: {
        position: new THREE.Vector3(0, 0, ROOM_D / 2),
        onInteract: null  // set by main.js or level2 hub
      }
    }
  };
  return returnObj;
}
