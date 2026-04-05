import * as THREE from 'three';
import { Engine, Materials, createRoom, createDoor, createTextPlane, addSpotlight, addPointLight } from '../../engine.js';

// ─── Hub 2: Le Laboratoire Sous-Marin ─────────────────────────────────
// The central underwater laboratory of Les Profondeurs. Players descend
// here after restoring Station Lumiere above. Five passages lead to the
// deep research puzzle rooms; a holographic map table dominates the
// center; Dr. Moreau's logbook establishes the narrative.

const ROOM_W = 14;
const ROOM_H = 5;
const ROOM_D = 12;

// ── Deep-ocean color palette ───────────────────────────────────────────
const COL = {
  deepOcean:   0x0d2137,
  marineBlu:   0x163a4f,
  bioTeal:     0x00e5cc,
  bioTealDim:  0x009e91,
  deepPurple:  0x9b59ff,
  softPurple:  0x6a3dba,
  coral:       0xe07060,
  coralDark:   0x8a3a30,
  sand:        0xd4c9a8,
  waterSurf:   0x0a3858,
  fogCol:      0x061828,
};

// ── Logbook HTML ───────────────────────────────────────────────────────
const LOGBOOK_HTML = `
<p style="color:#00e5cc;font-family:'Courier New',monospace;font-size:0.85em;margin-bottom:0.6em;">
  STATION LUMIERE &mdash; DEEP RESEARCH LOG<br>
  Dr. Eloise Moreau, Marine Archaeologist<br>
  Entry #64 &mdash; 11:47 UTC
</p>

<p>Something <span class="emphasis">significant</span> has happened. We have found ruins
beneath the ocean floor &mdash; real, ancient ruins, right under our laboratory.
I have been a scientist for twenty years and I have never seen anything like
this.</p>

<p>The Franco-American research team was drilling core samples when Tomoko's
sonar picked up a hollow space below the seabed. We sent a camera drone
through the gap, and what we saw took our breath away: carved stone walls,
covered in <span class="emphasis">elaborate</span> symbols that no one on the team
can identify. Not French. Not Latin. Not any language in our databases.</p>

<p><span class="french">&laquo;&nbsp;Il faut analyser chaque symbole avec
soin&nbsp;&raquo;</span> &mdash; we must <span class="emphasis">analyze</span>
each symbol carefully. I told the team this could be the discovery of a
lifetime, but only if we <span class="emphasis">contribute</span> real,
careful science. No guessing. No shortcuts.</p>

<p>I have divided the research into five areas:</p>

<ol style="margin:0.5em 0 0.5em 1.2em;line-height:1.6;">
  <li><strong>L'&Eacute;cosyst&egrave;me</strong> &mdash; The bioluminescent organisms
  growing on the ruins. They seem to react to sound and light. Are they
  natural, or were they placed here?</li>

  <li><strong>Le Circuit</strong> &mdash; The ancient power system we found inside
  the walls. It still works, somehow. We need to understand the circuits to
  power the deeper chambers.</li>

  <li><strong>La Carte</strong> &mdash; The stone maps carved into the main hall.
  They show coastlines that don't match any modern map. Where are these
  places?</li>

  <li><strong>Les Mots Perdus</strong> &mdash; The lost words. Hundreds of symbols
  that might be a complete language. If we can decode them, we can read
  the builders' own story.</li>

  <li><strong>La Chambre des &Eacute;toiles</strong> &mdash; The deepest room, sealed
  behind a massive door. Star patterns are carved on every surface. I believe
  this is the key to everything.</li>
</ol>

<p>The <span class="emphasis">evidence</span> is all around us, waiting to be
understood. Whoever built these ruins wanted them to be found &mdash; the
entrance was not hidden, it was <em>designed</em>.</p>

<p><span class="french">Courage, mes amis.</span> The answers are down here.
We just have to be brave enough to look.</p>

<p style="color:#667;font-size:0.8em;margin-top:1em;">
  &mdash; Dr. E. Moreau, Arch&eacute;ologue marine<br>
  Laboratoire Sous-Marin, Les Profondeurs
</p>
`;

// ─────────────────────────────────────────────────────────────────────
export function buildHub2(engine, gameState) {
  const group = new THREE.Group();

  // Track animation state
  let elapsed = 0;
  const indicators = {};            // populated below
  let starsDoorRef = null;          // populated below
  let starsUnlocked = false;
  let starsDoorOpenT = 0;           // 0 = closed, 1 = open
  let mapUnlocked = false;
  let mapDoorOpenT = 0;
  let wordsUnlocked = false;
  let wordsDoorOpenT = 0;

  // Derive initial lock states from gameState
  const ecoComplete = gameState.completedRooms.has('ecosystem');
  const circuitComplete = gameState.completedRooms.has('circuit');
  const mapComplete = gameState.completedRooms.has('map');
  const wordsComplete = gameState.completedRooms.has('words');
  const starsComplete = gameState.completedRooms.has('stars');

  if (ecoComplete && circuitComplete) {
    mapUnlocked = true;
    mapDoorOpenT = 1;
  }
  if (mapComplete) {
    wordsUnlocked = true;
    wordsDoorOpenT = 1;
  }
  if (ecoComplete && circuitComplete && mapComplete && wordsComplete) {
    starsUnlocked = true;
    starsDoorOpenT = 1;
  }

  // ── Room shell ───────────────────────────────────────────────────
  const room = createRoom(
    ROOM_W, ROOM_H, ROOM_D,
    Materials.wall(COL.deepOcean),
    Materials.floor(0x081a2e),
    Materials.ceiling(COL.marineBlu)
  );
  group.add(room.group);

  // ── Scene fog and background ─────────────────────────────────────
  // (Applied in enter(), reset in exit())

  // ── Water floor overlay ──────────────────────────────────────────
  const waterGeo = new THREE.PlaneGeometry(ROOM_W, ROOM_D);
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x0a4870,
    emissive: 0x042030,
    emissiveIntensity: 0.3,
    transparent: true,
    opacity: 0.25,
    roughness: 0.1,
    metalness: 0.2,
    side: THREE.DoubleSide
  });
  const waterPlane = new THREE.Mesh(waterGeo, waterMat);
  waterPlane.rotation.x = -Math.PI / 2;
  waterPlane.position.y = 0.02;
  group.add(waterPlane);

  // ── Floor grid lines (bioluminescent teal, subtle) ───────────────
  const gridGroup = new THREE.Group();
  const gridMat = new THREE.LineBasicMaterial({
    color: COL.bioTealDim, transparent: true, opacity: 0.2
  });
  for (let x = -ROOM_W / 2; x <= ROOM_W / 2; x += 1) {
    const pts = [
      new THREE.Vector3(x, 0.008, -ROOM_D / 2),
      new THREE.Vector3(x, 0.008, ROOM_D / 2)
    ];
    gridGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gridMat));
  }
  for (let z = -ROOM_D / 2; z <= ROOM_D / 2; z += 1) {
    const pts = [
      new THREE.Vector3(-ROOM_W / 2, 0.008, z),
      new THREE.Vector3(ROOM_W / 2, 0.008, z)
    ];
    gridGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gridMat));
  }
  group.add(gridGroup);

  // ── Central Holographic Map Table ─────────────────────────────────
  const tableGroup = new THREE.Group();
  tableGroup.position.set(0, 0, -1);

  // Table base (octagonal pillar)
  const baseMat = Materials.metal(0x1a3040);
  const baseGeo = new THREE.CylinderGeometry(0.5, 0.6, 0.8, 8);
  const tableBase = new THREE.Mesh(baseGeo, baseMat);
  tableBase.position.y = 0.4;
  tableBase.castShadow = true;
  tableBase.receiveShadow = true;
  tableGroup.add(tableBase);

  // Table surface (larger disc)
  const surfGeo = new THREE.CylinderGeometry(1.4, 1.3, 0.1, 8);
  const surfMat = Materials.metal(0x1e3a50);
  const tableSurf = new THREE.Mesh(surfGeo, surfMat);
  tableSurf.position.y = 0.85;
  tableSurf.castShadow = true;
  tableGroup.add(tableSurf);

  // Holographic projection surface (emissive translucent disc)
  const holoGeo = new THREE.CylinderGeometry(1.2, 1.2, 0.02, 32);
  const holoMat = new THREE.MeshStandardMaterial({
    color: COL.bioTeal,
    emissive: COL.bioTeal,
    emissiveIntensity: 0.8,
    transparent: true,
    opacity: 0.25,
    roughness: 0.0,
    metalness: 0.3,
    side: THREE.DoubleSide
  });
  const holoDisc = new THREE.Mesh(holoGeo, holoMat);
  holoDisc.position.y = 0.92;
  tableGroup.add(holoDisc);

  // Holographic terrain shapes (simple representation of deep levels)
  const holoTerrainGroup = new THREE.Group();
  holoTerrainGroup.position.y = 1.1;

  // Small floating cubes/shapes representing rooms on the map
  const holoShapeMat = new THREE.MeshStandardMaterial({
    color: COL.bioTeal,
    emissive: COL.bioTeal,
    emissiveIntensity: 2.0,
    transparent: true,
    opacity: 0.5,
    roughness: 0.0,
    metalness: 0.5
  });

  const holoNodes = [];
  const nodePositions = [
    { x: -0.5, z: -0.3, label: 'eco' },
    { x:  0.5, z: -0.3, label: 'circ' },
    { x:  0.0, z:  0.0, label: 'map' },
    { x: -0.4, z:  0.3, label: 'words' },
    { x:  0.4, z:  0.4, label: 'stars' },
  ];

  for (const np of nodePositions) {
    const nodeMesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.06, 0),
      holoShapeMat.clone()
    );
    nodeMesh.position.set(np.x, 0, np.z);
    holoTerrainGroup.add(nodeMesh);
    holoNodes.push(nodeMesh);
  }

  // Connecting lines between nodes (holo wireframe)
  const holoLineMat = new THREE.LineBasicMaterial({
    color: COL.bioTeal, transparent: true, opacity: 0.3
  });
  const connections = [[0,2],[1,2],[2,3],[3,4]];
  for (const [a, b] of connections) {
    const pa = nodePositions[a];
    const pb = nodePositions[b];
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(pa.x, 0, pa.z),
      new THREE.Vector3(pb.x, 0, pb.z)
    ]);
    holoTerrainGroup.add(new THREE.Line(lineGeo, holoLineMat));
  }

  tableGroup.add(holoTerrainGroup);

  // Vertical holographic beam from table
  const beamGeo = new THREE.CylinderGeometry(0.01, 0.4, 1.5, 16, 1, true);
  const beamMat = new THREE.MeshBasicMaterial({
    color: COL.bioTeal,
    transparent: true,
    opacity: 0.06,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const holoBeam = new THREE.Mesh(beamGeo, beamMat);
  holoBeam.position.y = 1.65;
  tableGroup.add(holoBeam);

  group.add(tableGroup);

  // ── Status Board (back wall, above Star Chamber door) ─────────────
  const boardGroup = new THREE.Group();
  boardGroup.position.set(0, 3.2, -ROOM_D / 2 + 0.06);

  // Board backing
  const boardBack = new THREE.Mesh(
    new THREE.BoxGeometry(5.0, 1.2, 0.08),
    Materials.metal(0x0e1e2e)
  );
  boardGroup.add(boardBack);

  // Title
  const boardTitle = createTextPlane(
    'ETAT DE LA RECHERCHE / RESEARCH STATUS',
    4.8, 0.25, 16, '#00e5cc', 'rgba(0,0,0,0)'
  );
  boardTitle.position.set(0, 0.4, 0.05);
  boardGroup.add(boardTitle);

  // Five indicator rows
  const indicatorData = [
    { key: 'ecosystem', label: "1: L'ECOSYSTEME",   room: 'ecosystem', x: -1.8 },
    { key: 'circuit',   label: '2: LE CIRCUIT',     room: 'circuit',   x: -0.9 },
    { key: 'map',       label: '3: LA CARTE',       room: 'map',       x:  0.0 },
    { key: 'words',     label: '4: LES MOTS',       room: 'words',     x:  0.9 },
    { key: 'stars',     label: '5: LES ETOILES',    room: 'stars',     x:  1.8 },
  ];

  for (const ind of indicatorData) {
    const indGroup = new THREE.Group();
    indGroup.position.set(ind.x, 0, 0.05);

    // Label
    const lbl = createTextPlane(ind.label, 0.75, 0.18, 11, '#7eaacc', 'rgba(0,0,0,0)');
    lbl.position.set(0, 0.08, 0);
    indGroup.add(lbl);

    // Indicator light
    const isComplete = gameState.completedRooms.has(ind.room);
    const lightMat = isComplete
      ? Materials.emissiveOk(0x2a9d8f, 3)
      : Materials.emissiveWarn(0xe63946, 3);
    const lightMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 16, 16),
      lightMat
    );
    lightMesh.position.set(0, -0.18, 0.02);
    indGroup.add(lightMesh);

    // Outer ring
    const ringMesh = new THREE.Mesh(
      new THREE.RingGeometry(0.08, 0.105, 24),
      Materials.metal(0x3a5566)
    );
    ringMesh.position.set(0, -0.18, 0.03);
    indGroup.add(ringMesh);

    indicators[ind.key] = {
      group: indGroup,
      lightMesh,
      lightMat,
      complete: isComplete
    };
    boardGroup.add(indGroup);
  }

  group.add(boardGroup);

  // ── Logbook on a side shelf ──────────────────────────────────────
  // Shelf near left wall
  const shelfMat = Materials.metal(0x1a2a3a);
  const shelf = new THREE.Mesh(
    new THREE.BoxGeometry(1.0, 0.05, 0.5),
    shelfMat
  );
  shelf.position.set(-ROOM_W / 2 + 1.2, 1.0, -3.5);
  shelf.castShadow = true;
  group.add(shelf);

  // Shelf bracket
  const bracket = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.3, 0.05),
    shelfMat
  );
  bracket.position.set(-ROOM_W / 2 + 1.2, 0.83, -3.3);
  group.add(bracket);

  const logbookGroup = new THREE.Group();

  // Book body
  const bookGeo = new THREE.BoxGeometry(0.35, 0.04, 0.5);
  const bookMat = new THREE.MeshStandardMaterial({
    color: 0x1a3a3a, roughness: 0.9, metalness: 0.0
  });
  const book = new THREE.Mesh(bookGeo, bookMat);
  book.castShadow = true;
  logbookGroup.add(book);

  // Page surface
  const pageGeo = new THREE.PlaneGeometry(0.3, 0.44);
  const pageMat = new THREE.MeshStandardMaterial({
    color: COL.sand, roughness: 1.0, metalness: 0.0
  });
  const page = new THREE.Mesh(pageGeo, pageMat);
  page.position.set(0, 0.025, 0);
  page.rotation.x = -Math.PI / 2;
  logbookGroup.add(page);

  // Emissive marker (so player notices it)
  const markerGeo = new THREE.BoxGeometry(0.36, 0.005, 0.01);
  const markerMat = Materials.emissive(COL.bioTeal, 1.5);
  const marker = new THREE.Mesh(markerGeo, markerMat);
  marker.position.set(0, 0.025, -0.24);
  logbookGroup.add(marker);

  logbookGroup.position.set(-ROOM_W / 2 + 1.2, 1.05, -3.5);
  logbookGroup.rotation.y = 0.2;
  group.add(logbookGroup);

  // Register logbook as interactive
  engine.registerInteractive(book, {
    type: 'click',
    prompt: "Read Dr. Moreau's Logbook / Lire le journal",
    icon: '\u{1F4D6}',
    onInteract: () => {
      engine.playEffect('click');
      engine.showNarrative('Deep Research Log / Journal de recherche', LOGBOOK_HTML);
    }
  });

  // ── Coral Growths (decorative clusters along walls) ───────────────
  function addCoralCluster(x, z, wallSide) {
    const cluster = new THREE.Group();

    // Coral colors: warm pinks, oranges, soft purples
    const coralColors = [0xd4726a, 0xc05a50, 0x9b59ff, 0xe09070, 0x7a44aa];

    const numPieces = 4 + Math.floor(Math.random() * 4);
    for (let i = 0; i < numPieces; i++) {
      const color = coralColors[Math.floor(Math.random() * coralColors.length)];
      const mat = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.3,
        roughness: 0.8,
        metalness: 0.1
      });

      let mesh;
      const type = Math.random();
      if (type < 0.4) {
        // Branching coral (tall thin box)
        mesh = new THREE.Mesh(
          new THREE.BoxGeometry(
            0.04 + Math.random() * 0.06,
            0.15 + Math.random() * 0.3,
            0.04 + Math.random() * 0.06
          ),
          mat
        );
      } else if (type < 0.7) {
        // Brain coral (sphere)
        mesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.06 + Math.random() * 0.1, 8, 8),
          mat
        );
      } else {
        // Fan coral (flat plane-like box)
        mesh = new THREE.Mesh(
          new THREE.BoxGeometry(
            0.02,
            0.12 + Math.random() * 0.2,
            0.1 + Math.random() * 0.15
          ),
          mat
        );
      }

      const spread = 0.3;
      mesh.position.set(
        (Math.random() - 0.5) * spread,
        Math.random() * 0.3,
        (Math.random() - 0.5) * spread
      );
      mesh.rotation.set(
        (Math.random() - 0.5) * 0.3,
        Math.random() * Math.PI,
        (Math.random() - 0.5) * 0.3
      );
      cluster.add(mesh);
    }

    cluster.position.set(x, 0, z);
    group.add(cluster);
  }

  // Left wall coral
  addCoralCluster(-ROOM_W / 2 + 0.2, -4.5, 'left');
  addCoralCluster(-ROOM_W / 2 + 0.15, 1.0, 'left');
  addCoralCluster(-ROOM_W / 2 + 0.2, 4.0, 'left');

  // Right wall coral
  addCoralCluster(ROOM_W / 2 - 0.2, -3.5, 'right');
  addCoralCluster(ROOM_W / 2 - 0.15, 2.0, 'right');
  addCoralCluster(ROOM_W / 2 - 0.2, 5.0, 'right');

  // Back wall coral (flanking the Star Chamber door)
  addCoralCluster(-3.0, -ROOM_D / 2 + 0.2, 'back');
  addCoralCluster(3.0, -ROOM_D / 2 + 0.2, 'back');

  // Ceiling coral (hanging down)
  for (const pos of [
    [-4, ROOM_H - 0.1, -3],
    [3, ROOM_H - 0.1, 2],
    [-2, ROOM_H - 0.1, 4],
    [5, ROOM_H - 0.1, -1],
  ]) {
    const hangCluster = new THREE.Group();
    const numPieces = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < numPieces; i++) {
      const color = [0x00e5cc, 0x9b59ff, 0x0090aa][Math.floor(Math.random() * 3)];
      const mat = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.5,
        roughness: 0.8,
        metalness: 0.1
      });
      const stalactite = new THREE.Mesh(
        new THREE.ConeGeometry(0.03 + Math.random() * 0.04, 0.15 + Math.random() * 0.2, 6),
        mat
      );
      stalactite.rotation.x = Math.PI; // point downward
      stalactite.position.set(
        (Math.random() - 0.5) * 0.3,
        -(Math.random() * 0.1),
        (Math.random() - 0.5) * 0.3
      );
      hangCluster.add(stalactite);
    }
    hangCluster.position.set(pos[0], pos[1], pos[2]);
    group.add(hangCluster);
  }

  // ── Wall panels / structural ribs ──────────────────────────────────
  const ribMat = Materials.metal(0x132838);
  // Left wall ribs
  for (let z = -4; z <= 4; z += 2.5) {
    const rib = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, ROOM_H * 0.8, 0.3),
      ribMat
    );
    rib.position.set(-ROOM_W / 2 + 0.05, ROOM_H * 0.4, z);
    group.add(rib);
  }
  // Right wall ribs
  for (let z = -4; z <= 4; z += 2.5) {
    const rib = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, ROOM_H * 0.8, 0.3),
      ribMat
    );
    rib.position.set(ROOM_W / 2 - 0.05, ROOM_H * 0.4, z);
    group.add(rib);
  }

  // ── Pipes along ceiling (waterlogged look) ─────────────────────────
  const pipeMat = Materials.metal(0x2a4050);
  for (let i = 0; i < 3; i++) {
    const pipe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, ROOM_W, 8),
      pipeMat
    );
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(0, ROOM_H - 0.2 - i * 0.15, -ROOM_D / 2 + 1.5 + i * 4);
    group.add(pipe);
  }

  // Pipe brackets
  for (let x = -5; x <= 5; x += 5) {
    for (let i = 0; i < 3; i++) {
      const pBracket = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.25, 0.1),
        pipeMat
      );
      pBracket.position.set(x, ROOM_H - 0.35, -ROOM_D / 2 + 1.5 + i * 4);
      group.add(pBracket);
    }
  }

  // ── Equipment cabinets / research stations along walls ─────────────
  const cabinetMat = Materials.metal(0x122230);
  // Right wall research station
  const labBench = new THREE.Mesh(
    new THREE.BoxGeometry(2.5, 0.9, 0.7),
    cabinetMat
  );
  labBench.position.set(ROOM_W / 2 - 0.6, 0.45, -3);
  labBench.castShadow = true;
  group.add(labBench);

  // Specimen jars on bench (glowing)
  for (let i = 0; i < 3; i++) {
    const jarMat = Materials.glass();
    const jar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 0.18, 12),
      jarMat
    );
    jar.position.set(
      ROOM_W / 2 - 0.5 + (i - 1) * 0.25,
      1.0,
      -3
    );
    group.add(jar);

    // Glowing specimen inside
    const specColor = [COL.bioTeal, COL.deepPurple, COL.coral][i];
    const specMat = Materials.emissive(specColor, 2);
    const spec = new THREE.Mesh(
      new THREE.SphereGeometry(0.03, 8, 8),
      specMat
    );
    spec.position.set(
      ROOM_W / 2 - 0.5 + (i - 1) * 0.25,
      1.0,
      -3
    );
    group.add(spec);
  }

  // Left wall equipment locker
  const locker = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 2.0, 0.5),
    cabinetMat
  );
  locker.position.set(-ROOM_W / 2 + 0.4, 1.0, 3.0);
  locker.castShadow = true;
  group.add(locker);

  // ── Station Name Plaque ────────────────────────────────────────────
  const plaque = createTextPlane(
    'LES PROFONDEURS',
    3.0, 0.35, 28, '#00e5cc', 'rgba(8,18,32,0.92)'
  );
  plaque.position.set(0, 4.2, -ROOM_D / 2 + 0.06);
  group.add(plaque);

  const subPlaque = createTextPlane(
    'LABORATOIRE SOUS-MARIN / UNDERWATER LABORATORY',
    3.5, 0.2, 13, '#5a8aaa', 'rgba(0,0,0,0)'
  );
  subPlaque.position.set(0, 3.9, -ROOM_D / 2 + 0.06);
  group.add(subPlaque);

  // ── Doors ──────────────────────────────────────────────────────────

  // Door 1: L'Ecosysteme (left wall, front)
  const door1 = createDoor(1.2, 2.4, 0x1a4050);
  door1.group.position.set(-ROOM_W / 2 + 0.04, 0, 2.5);
  door1.group.rotation.y = Math.PI / 2;
  door1.statusLight.material = ecoComplete
    ? Materials.emissiveOk(0x2a9d8f, 3)
    : Materials.emissive(COL.bioTeal, 2);
  group.add(door1.group);

  const label1 = createTextPlane(
    "1: L'ECOSYSTEME / THE ECOSYSTEM",
    1.2, 0.2, 13, '#00e5cc', 'rgba(8,18,32,0.85)'
  );
  label1.position.set(-ROOM_W / 2 + 0.06, 2.7, 2.5);
  label1.rotation.y = Math.PI / 2;
  group.add(label1);

  // Door 2: Le Circuit (right wall, front)
  const door2 = createDoor(1.2, 2.4, 0x1a4050);
  door2.group.position.set(ROOM_W / 2 - 0.04, 0, 2.5);
  door2.group.rotation.y = -Math.PI / 2;
  door2.statusLight.material = circuitComplete
    ? Materials.emissiveOk(0x2a9d8f, 3)
    : Materials.emissive(COL.bioTeal, 2);
  group.add(door2.group);

  const label2 = createTextPlane(
    '2: LE CIRCUIT / THE CIRCUIT',
    1.1, 0.2, 13, '#00e5cc', 'rgba(8,18,32,0.85)'
  );
  label2.position.set(ROOM_W / 2 - 0.06, 2.7, 2.5);
  label2.rotation.y = -Math.PI / 2;
  group.add(label2);

  // Door 3: La Carte (left wall, rear)
  const door3 = createDoor(1.2, 2.4, 0x163050);
  door3.group.position.set(-ROOM_W / 2 + 0.04, 0, -3.5);
  door3.group.rotation.y = Math.PI / 2;
  if (mapUnlocked) {
    door3.statusLight.material = mapComplete
      ? Materials.emissiveOk(0x2a9d8f, 3)
      : Materials.emissive(COL.bioTeal, 2);
    if (mapDoorOpenT >= 1) {
      door3.doorPanel.position.x = -1.0;
    }
  } else {
    door3.statusLight.material = Materials.emissiveWarn(0xe63946, 3);
  }
  group.add(door3.group);

  const label3 = createTextPlane(
    '3: LA CARTE / THE MAP',
    1.0, 0.2, 13,
    mapUnlocked ? '#00e5cc' : '#e63946',
    'rgba(8,18,32,0.85)'
  );
  label3.position.set(-ROOM_W / 2 + 0.06, 2.7, -3.5);
  label3.rotation.y = Math.PI / 2;
  group.add(label3);

  // Lock indicator for Door 3
  const lock3Label = createTextPlane(
    mapUnlocked ? 'OUVERT / OPEN' : 'VERROUILLE / LOCKED',
    0.8, 0.13, 10,
    mapUnlocked ? '#2a9d8f' : '#e63946',
    'rgba(8,18,32,0.85)'
  );
  lock3Label.position.set(-ROOM_W / 2 + 0.06, 2.45, -3.5);
  lock3Label.rotation.y = Math.PI / 2;
  group.add(lock3Label);

  // Lock bars on Door 3
  const lockBarMat3 = Materials.metal(0x44556a);
  const lockBars3 = [];
  for (let i = 0; i < 2; i++) {
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.06, 1.6),
      lockBarMat3
    );
    bar.position.set(-ROOM_W / 2 + 0.12, 0.8 + i * 0.9, -3.5);
    bar.castShadow = true;
    if (mapUnlocked) bar.visible = false;
    group.add(bar);
    lockBars3.push(bar);
  }

  // Door 4: Les Mots Perdus (right wall, rear)
  const door4 = createDoor(1.2, 2.4, 0x163050);
  door4.group.position.set(ROOM_W / 2 - 0.04, 0, -3.5);
  door4.group.rotation.y = -Math.PI / 2;
  if (wordsUnlocked) {
    door4.statusLight.material = wordsComplete
      ? Materials.emissiveOk(0x2a9d8f, 3)
      : Materials.emissive(COL.bioTeal, 2);
    if (wordsDoorOpenT >= 1) {
      door4.doorPanel.position.x = -1.0;
    }
  } else {
    door4.statusLight.material = Materials.emissiveWarn(0xe63946, 3);
  }
  group.add(door4.group);

  const label4 = createTextPlane(
    '4: LES MOTS PERDUS / THE LOST WORDS',
    1.3, 0.2, 13,
    wordsUnlocked ? '#00e5cc' : '#e63946',
    'rgba(8,18,32,0.85)'
  );
  label4.position.set(ROOM_W / 2 - 0.06, 2.7, -3.5);
  label4.rotation.y = -Math.PI / 2;
  group.add(label4);

  // Lock indicator for Door 4
  const lock4Label = createTextPlane(
    wordsUnlocked ? 'OUVERT / OPEN' : 'VERROUILLE / LOCKED',
    0.8, 0.13, 10,
    wordsUnlocked ? '#2a9d8f' : '#e63946',
    'rgba(8,18,32,0.85)'
  );
  lock4Label.position.set(ROOM_W / 2 - 0.06, 2.45, -3.5);
  lock4Label.rotation.y = -Math.PI / 2;
  group.add(lock4Label);

  // Lock bars on Door 4
  const lockBars4 = [];
  for (let i = 0; i < 2; i++) {
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.06, 1.6),
      Materials.metal(0x44556a)
    );
    bar.position.set(ROOM_W / 2 - 0.12, 0.8 + i * 0.9, -3.5);
    bar.castShadow = true;
    if (wordsUnlocked) bar.visible = false;
    group.add(bar);
    lockBars4.push(bar);
  }

  // Door 5: La Chambre des Etoiles (back wall, center)
  const door5 = createDoor(1.6, 2.8, 0x0e1830);
  door5.group.position.set(0, 0, -ROOM_D / 2 + 0.04);
  starsDoorRef = door5;
  if (starsUnlocked) {
    door5.statusLight.material = starsComplete
      ? Materials.emissiveOk(0x2a9d8f, 3)
      : Materials.emissive(COL.deepPurple, 2);
    if (starsDoorOpenT >= 1) {
      door5.doorPanel.position.x = -1.2;
    }
  } else {
    door5.statusLight.material = Materials.emissiveWarn(0xe63946, 3);
  }
  group.add(door5.group);

  const label5 = createTextPlane(
    "5: LA CHAMBRE DES ETOILES / THE STAR CHAMBER",
    1.8, 0.2, 13,
    starsUnlocked ? '#9b59ff' : '#e63946',
    'rgba(8,18,32,0.85)'
  );
  label5.position.set(0, 3.35, -ROOM_D / 2 + 0.06);
  group.add(label5);

  // Lock indicator for Door 5
  const lock5Label = createTextPlane(
    starsUnlocked ? 'OUVERT / OPEN' : 'VERROUILLE / LOCKED',
    0.8, 0.13, 10,
    starsUnlocked ? '#9b59ff' : '#e63946',
    'rgba(8,18,32,0.85)'
  );
  lock5Label.position.set(0, 3.05, -ROOM_D / 2 + 0.06);
  group.add(lock5Label);

  // Heavy lock bars on Star Chamber door
  const lockBars5 = [];
  for (let i = 0; i < 3; i++) {
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 0.07, 0.07),
      Materials.metal(0x44556a)
    );
    bar.position.set(0, 0.6 + i * 0.7, -ROOM_D / 2 + 0.12);
    bar.castShadow = true;
    if (starsUnlocked) bar.visible = false;
    group.add(bar);
    lockBars5.push(bar);
  }

  // Star engravings around Door 5 frame (decorative emissive dots)
  const starDotMat = Materials.emissive(COL.deepPurple, 1.5);
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    const rx = Math.cos(angle) * 1.3;
    const ry = 1.4 + Math.sin(angle) * 1.3;
    if (ry < 0.1) continue; // skip below floor
    const starDot = new THREE.Mesh(
      new THREE.SphereGeometry(0.025, 6, 6),
      starDotMat
    );
    starDot.position.set(rx, ry, -ROOM_D / 2 + 0.08);
    group.add(starDot);
  }

  // Door 6: Back to Level 1 (front wall, center — hatch going up)
  const door6 = createDoor(1.2, 2.2, 0x2a4a5a);
  door6.group.position.set(0, 0, ROOM_D / 2 - 0.04);
  door6.group.rotation.y = Math.PI;
  door6.statusLight.material = Materials.emissive(0xe6a44c, 2);
  group.add(door6.group);

  const label6 = createTextPlane(
    'RETOUR / BACK TO LEVEL 1',
    1.2, 0.2, 13, '#e6a44c', 'rgba(8,18,32,0.85)'
  );
  label6.position.set(0, 2.55, ROOM_D / 2 - 0.06);
  label6.rotation.y = Math.PI;
  group.add(label6);

  // Upward arrow indicator (shows this goes up to surface)
  const arrowPlane = createTextPlane(
    '\u25B2 SURFACE',
    0.6, 0.15, 12, '#e6a44c', 'rgba(0,0,0,0)'
  );
  arrowPlane.position.set(0, 2.3, ROOM_D / 2 - 0.06);
  arrowPlane.rotation.y = Math.PI;
  group.add(arrowPlane);

  // ── Register door interactives ─────────────────────────────────────

  // Door objects (for main.js to override onInteract)
  const doors = {
    ecosystem: {
      position: new THREE.Vector3(-ROOM_W / 2, 0, 2.5),
      onInteract: () => { engine.playEffect('clunk'); }
    },
    circuit: {
      position: new THREE.Vector3(ROOM_W / 2, 0, 2.5),
      onInteract: () => { engine.playEffect('clunk'); }
    },
    map: {
      position: new THREE.Vector3(-ROOM_W / 2, 0, -3.5),
      onInteract: () => {
        if (!mapUnlocked) {
          engine.playEffect('click');
          engine.showObjective("Complete L'Ecosysteme and Le Circuit to unlock La Carte.");
          return false;
        }
        engine.playEffect('clunk');
        return true;
      }
    },
    words: {
      position: new THREE.Vector3(ROOM_W / 2, 0, -3.5),
      onInteract: () => {
        if (!wordsUnlocked) {
          engine.playEffect('click');
          engine.showObjective('Complete La Carte to unlock Les Mots Perdus.');
          return false;
        }
        engine.playEffect('clunk');
        return true;
      }
    },
    stars: {
      position: new THREE.Vector3(0, 0, -ROOM_D / 2),
      onInteract: () => {
        if (!starsUnlocked) {
          engine.playEffect('click');
          engine.showObjective('Complete all four research areas to unlock La Chambre des Etoiles.');
          return false;
        }
        engine.playEffect('clunk');
        return true;
      }
    },
    backToLevel1: {
      position: new THREE.Vector3(0, 0, ROOM_D / 2),
      onInteract: () => { engine.playEffect('clunk'); }
    }
  };

  // Register click handlers that delegate to doors object
  engine.registerInteractive(door1.doorPanel, {
    type: 'click',
    prompt: "Enter L'Ecosysteme / The Ecosystem",
    icon: '\u{1F6AA}',
    onInteract: () => {
      engine.playEffect('clunk');
      doors.ecosystem.onInteract();
    }
  });

  engine.registerInteractive(door2.doorPanel, {
    type: 'click',
    prompt: 'Enter Le Circuit / The Circuit',
    icon: '\u{1F6AA}',
    onInteract: () => {
      engine.playEffect('clunk');
      doors.circuit.onInteract();
    }
  });

  engine.registerInteractive(door3.doorPanel, {
    type: 'click',
    prompt: mapUnlocked
      ? 'Enter La Carte / The Map'
      : "Locked \u2014 Complete Ecosystem & Circuit first",
    icon: mapUnlocked ? '\u{1F6AA}' : '\u{1F512}',
    onInteract: () => {
      if (mapUnlocked) {
        engine.playEffect('clunk');
        doors.map.onInteract();
      } else {
        engine.playEffect('click');
        engine.showObjective("Complete L'Ecosysteme and Le Circuit to unlock La Carte.");
      }
    }
  });

  engine.registerInteractive(door4.doorPanel, {
    type: 'click',
    prompt: wordsUnlocked
      ? 'Enter Les Mots Perdus / The Lost Words'
      : 'Locked \u2014 Complete The Map first',
    icon: wordsUnlocked ? '\u{1F6AA}' : '\u{1F512}',
    onInteract: () => {
      if (wordsUnlocked) {
        engine.playEffect('clunk');
        doors.words.onInteract();
      } else {
        engine.playEffect('click');
        engine.showObjective('Complete La Carte to unlock Les Mots Perdus.');
      }
    }
  });

  engine.registerInteractive(door5.doorPanel, {
    type: 'click',
    prompt: starsUnlocked
      ? 'Enter La Chambre des Etoiles / The Star Chamber'
      : 'Locked \u2014 Complete all research areas first',
    icon: starsUnlocked ? '\u{1F6AA}' : '\u{1F512}',
    onInteract: () => {
      if (starsUnlocked) {
        engine.playEffect('clunk');
        doors.stars.onInteract();
      } else {
        engine.playEffect('click');
        engine.showObjective('Complete all four research areas to unlock La Chambre des Etoiles.');
      }
    }
  });

  engine.registerInteractive(door6.doorPanel, {
    type: 'click',
    prompt: 'Return to Level 1 / Retour au Niveau 1',
    icon: '\u{1F6AA}',
    onInteract: () => {
      engine.playEffect('clunk');
      doors.backToLevel1.onInteract();
    }
  });

  // ── Lighting ───────────────────────────────────────────────────────

  // Hemisphere light: cool blue above, warmer teal below
  const hemi = new THREE.HemisphereLight(0x1a3a6a, 0x0a4a4a, 0.5);
  group.add(hemi);

  // Ambient fill (brighter than Level 1)
  const ambient = new THREE.AmbientLight(0x334455, 0.6);
  group.add(ambient);

  // Spotlight on holographic table
  addSpotlight(
    engine.scene,
    new THREE.Vector3(0, ROOM_H - 0.2, -0.5),
    new THREE.Vector3(0, 0.9, -1),
    0x88ccdd, 3, 0.6
  );

  // Spotlight on status board
  addSpotlight(
    engine.scene,
    new THREE.Vector3(0, ROOM_H - 0.2, -4.5),
    new THREE.Vector3(0, 3.2, -ROOM_D / 2),
    0x80c0d0, 2, 0.5
  );

  // Point lights near doors (bioluminescent teal glow)
  const doorLight1 = addPointLight(
    engine.scene,
    new THREE.Vector3(-ROOM_W / 2 + 0.8, 2.5, 2.5),
    COL.bioTeal, 1.5, 5
  );
  const doorLight2 = addPointLight(
    engine.scene,
    new THREE.Vector3(ROOM_W / 2 - 0.8, 2.5, 2.5),
    COL.bioTeal, 1.5, 5
  );
  addPointLight(
    engine.scene,
    new THREE.Vector3(-ROOM_W / 2 + 0.8, 2.5, -3.5),
    mapUnlocked ? COL.bioTeal : 0xe63946, 1.0, 4
  );
  addPointLight(
    engine.scene,
    new THREE.Vector3(ROOM_W / 2 - 0.8, 2.5, -3.5),
    wordsUnlocked ? COL.bioTeal : 0xe63946, 1.0, 4
  );

  // Star Chamber door light (purple when unlocked, red when locked)
  const doorLight5 = addPointLight(
    engine.scene,
    new THREE.Vector3(0, 2.8, -ROOM_D / 2 + 0.8),
    starsUnlocked ? COL.deepPurple : 0xe63946, 1.2, 5
  );

  // Back-to-Level-1 door warm light
  addPointLight(
    engine.scene,
    new THREE.Vector3(0, 2.5, ROOM_D / 2 - 0.8),
    0xe6a44c, 0.8, 4
  );

  // Water caustic effect: slowly moving point light creating dancing shadows
  const causticLight = new THREE.PointLight(COL.bioTeal, 1.0, 12);
  causticLight.position.set(0, ROOM_H - 0.5, 0);
  group.add(causticLight);

  // Secondary caustic (offset phase)
  const causticLight2 = new THREE.PointLight(0x0080aa, 0.6, 10);
  causticLight2.position.set(2, ROOM_H - 0.8, -2);
  group.add(causticLight2);

  // Bioluminescent accent lights scattered around room
  const bioLights = [];
  const bioLightPositions = [
    [-5, 1.2, -4],  [4, 0.8, -2],  [-3, 1.5, 3],
    [6, 1.0, 1],    [-6, 2.0, 0],  [2, 0.6, 4],
  ];
  for (const pos of bioLightPositions) {
    const bioGlow = new THREE.Mesh(
      new THREE.SphereGeometry(0.04, 8, 8),
      Materials.emissive(
        Math.random() > 0.5 ? COL.bioTeal : COL.deepPurple,
        2.5
      )
    );
    bioGlow.position.set(pos[0], pos[1], pos[2]);
    group.add(bioGlow);
    bioLights.push(bioGlow);
  }

  // ── onRoomComplete ─────────────────────────────────────────────────
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
    if (roomName === 'ecosystem') {
      door1.statusLight.material.dispose();
      door1.statusLight.material = Materials.emissiveOk(0x2a9d8f, 3);
    }
    if (roomName === 'circuit') {
      door2.statusLight.material.dispose();
      door2.statusLight.material = Materials.emissiveOk(0x2a9d8f, 3);
    }
    if (roomName === 'map') {
      door3.statusLight.material.dispose();
      door3.statusLight.material = Materials.emissiveOk(0x2a9d8f, 3);
    }
    if (roomName === 'words') {
      door4.statusLight.material.dispose();
      door4.statusLight.material = Materials.emissiveOk(0x2a9d8f, 3);
    }
    if (roomName === 'stars') {
      door5.statusLight.material.dispose();
      door5.statusLight.material = Materials.emissiveOk(0x2a9d8f, 3);
    }

    engine.playEffect('success');

    // Check if La Carte should unlock (ecosystem + circuit)
    if (indicators.ecosystem.complete && indicators.circuit.complete && !mapUnlocked) {
      setTimeout(() => unlockDoor('map'), 1500);
    }

    // Check if Les Mots Perdus should unlock (map complete)
    if (indicators.map.complete && !wordsUnlocked) {
      setTimeout(() => unlockDoor('words'), 1500);
    }

    // Check if La Chambre des Etoiles should unlock (all four)
    if (indicators.ecosystem.complete && indicators.circuit.complete &&
        indicators.map.complete && indicators.words.complete && !starsUnlocked) {
      setTimeout(() => unlockDoor('stars'), 2000);
    }
  }

  function unlockDoor(doorName) {
    engine.playEffect('powerup');

    if (doorName === 'map') {
      mapUnlocked = true;

      // Update door 3 status
      door3.statusLight.material.dispose();
      door3.statusLight.material = Materials.emissive(COL.bioTeal, 2);

      // Re-register interactive with unlocked prompt
      engine.unregisterInteractive(door3.doorPanel);
      engine.registerInteractive(door3.doorPanel, {
        type: 'click',
        prompt: 'Enter La Carte / The Map',
        icon: '\u{1F6AA}',
        onInteract: () => {
          engine.playEffect('clunk');
          doors.map.onInteract();
        }
      });

      // Update labels
      updateLabel(lock3Label, 'OUVERT / OPEN', '#2a9d8f');
      updateLabel(label3, '3: LA CARTE / THE MAP', '#00e5cc');

      engine.showObjective('La Carte is now unlocked. Explore the ancient maps.');
    }

    if (doorName === 'words') {
      wordsUnlocked = true;

      door4.statusLight.material.dispose();
      door4.statusLight.material = Materials.emissive(COL.bioTeal, 2);

      engine.unregisterInteractive(door4.doorPanel);
      engine.registerInteractive(door4.doorPanel, {
        type: 'click',
        prompt: 'Enter Les Mots Perdus / The Lost Words',
        icon: '\u{1F6AA}',
        onInteract: () => {
          engine.playEffect('clunk');
          doors.words.onInteract();
        }
      });

      updateLabel(lock4Label, 'OUVERT / OPEN', '#2a9d8f');
      updateLabel(label4, '4: LES MOTS PERDUS / THE LOST WORDS', '#00e5cc');

      engine.showObjective('Les Mots Perdus is now unlocked. Decode the lost language.');
    }

    if (doorName === 'stars') {
      starsUnlocked = true;

      door5.statusLight.material.dispose();
      door5.statusLight.material = Materials.emissive(COL.deepPurple, 2);

      doorLight5.color.set(COL.deepPurple);

      engine.unregisterInteractive(door5.doorPanel);
      engine.registerInteractive(door5.doorPanel, {
        type: 'click',
        prompt: 'Enter La Chambre des Etoiles / The Star Chamber',
        icon: '\u{1F6AA}',
        onInteract: () => {
          engine.playEffect('clunk');
          doors.stars.onInteract();
        }
      });

      updateLabel(lock5Label, 'OUVERT / OPEN', '#9b59ff');
      updateLabel(label5, "5: LA CHAMBRE DES ETOILES / THE STAR CHAMBER", '#9b59ff');

      engine.showObjective('La Chambre des Etoiles is now unlocked. Enter the deepest chamber.');
    }
  }

  // Helper to swap a text plane's material/geometry
  function updateLabel(mesh, text, color) {
    const newLabel = createTextPlane(
      text,
      mesh.geometry.parameters ? mesh.geometry.parameters.width || 1.0 : 1.0,
      mesh.geometry.parameters ? mesh.geometry.parameters.height || 0.15 : 0.15,
      12, color, 'rgba(8,18,32,0.85)'
    );
    mesh.material.dispose();
    mesh.material = newLabel.material;
    mesh.geometry.dispose();
    mesh.geometry = newLabel.geometry;
  }

  // ── Enter / Exit ───────────────────────────────────────────────────
  function enter() {
    engine.showRoomTitle('Le Laboratoire Sous-Marin', 'Underwater Laboratory - Les Profondeurs');

    engine.setRoomBounds(
      -ROOM_W / 2 + 0.5, ROOM_W / 2 - 0.5,
      -ROOM_D / 2 + 0.5, ROOM_D / 2 - 0.5
    );

    // Set underwater fog
    engine.scene.fog = new THREE.FogExp2(COL.fogCol, 0.02);
    engine.scene.background = new THREE.Color(COL.fogCol);

    // Bioluminescent dust particles (cyan/teal)
    engine.addDust({
      minX: -ROOM_W / 2,
      maxX: ROOM_W / 2,
      minZ: -ROOM_D / 2,
      maxZ: ROOM_D / 2,
      height: ROOM_H
    });

    // Deep ambient drone — lower, more oceanic than Level 1
    engine.playAmbient(40, 'sine', 0.07);
    engine.playAmbient(60, 'triangle', 0.03);

    // Set objective based on progress
    const eco = gameState.completedRooms.has('ecosystem');
    const circ = gameState.completedRooms.has('circuit');
    const mp = gameState.completedRooms.has('map');
    const wrd = gameState.completedRooms.has('words');
    const str = gameState.completedRooms.has('stars');

    if (str) {
      engine.showObjective('All research areas complete. The deep ruins are unlocked.');
    } else if (eco && circ && mp && wrd) {
      engine.showObjective('La Chambre des Etoiles is unlocked. Enter the Star Chamber.');
    } else if (eco && circ && mp) {
      engine.showObjective('Decode Les Mots Perdus to unlock the Star Chamber.');
    } else if (eco && circ) {
      engine.showObjective('La Carte is unlocked. Map the ancient ruins.');
    } else if (eco || circ) {
      const remaining = !eco ? "L'Ecosysteme" : 'Le Circuit';
      engine.showObjective(`Complete ${remaining} to unlock La Carte.`);
    } else {
      engine.showObjective("Read Dr. Moreau's logbook. Begin with L'Ecosysteme or Le Circuit.");
    }
  }

  function exit() {
    engine.stopAmbient();
    engine.clearParticles();
    engine.hideObjective();
    // Restore default fog
    engine.scene.fog = new THREE.FogExp2(0x0a1628, 0.025);
    engine.scene.background = new THREE.Color(0x0a1628);
  }

  // ── Update (per frame) ────────────────────────────────────────────
  function update(delta) {
    elapsed += delta;

    // Water floor animation — gentle opacity wave
    waterMat.opacity = 0.2 + Math.sin(elapsed * 0.8) * 0.08 + Math.sin(elapsed * 1.3) * 0.04;

    // Water caustic light movement — creates dancing shadow patterns
    causticLight.position.x = Math.sin(elapsed * 0.4) * 3;
    causticLight.position.z = Math.cos(elapsed * 0.3) * 4 - 1;
    causticLight.intensity = 0.8 + Math.sin(elapsed * 1.5) * 0.3;

    causticLight2.position.x = Math.cos(elapsed * 0.35) * 4;
    causticLight2.position.z = Math.sin(elapsed * 0.25) * 3 + 1;
    causticLight2.intensity = 0.5 + Math.sin(elapsed * 1.2 + 1.5) * 0.2;

    // Holographic table animations
    holoMat.opacity = 0.2 + Math.sin(elapsed * 1.5) * 0.06;
    holoMat.emissiveIntensity = 0.6 + Math.sin(elapsed * 2.0) * 0.3;

    // Holographic nodes float and pulse
    for (let i = 0; i < holoNodes.length; i++) {
      const node = holoNodes[i];
      node.position.y = Math.sin(elapsed * 1.2 + i * 1.3) * 0.05;
      node.rotation.y = elapsed * 0.5 + i;
      node.rotation.x = elapsed * 0.3 + i * 0.5;
      // Pulse brighter if the room is complete
      const roomKeys = ['ecosystem', 'circuit', 'map', 'words', 'stars'];
      const isComp = indicators[roomKeys[i]] && indicators[roomKeys[i]].complete;
      node.material.emissiveIntensity = isComp
        ? 3.0 + Math.sin(elapsed * 2 + i) * 0.5
        : 1.5 + Math.sin(elapsed * 2 + i) * 0.5;
      node.material.opacity = isComp ? 0.8 : 0.4;
    }

    // Holographic beam pulse
    beamMat.opacity = 0.04 + Math.sin(elapsed * 0.7) * 0.02;

    // Holographic terrain group slow rotation
    holoTerrainGroup.rotation.y = elapsed * 0.08;

    // Pulsing on incomplete indicators
    for (const key of Object.keys(indicators)) {
      const ind = indicators[key];
      if (!ind.complete) {
        const phase = key === 'circuit' ? 1 : key === 'map' ? 2 : key === 'words' ? 3 : key === 'stars' ? 4 : 0;
        const pulse = 1.5 + Math.sin(elapsed * 2.5 + phase) * 0.8;
        ind.lightMesh.material.emissiveIntensity = pulse;
      }
    }

    // Bioluminescent accent light pulsing
    for (let i = 0; i < bioLights.length; i++) {
      const glow = bioLights[i];
      glow.material.emissiveIntensity = 1.8 + Math.sin(elapsed * 1.5 + i * 1.7) * 1.2;
    }

    // Logbook marker glow
    markerMat.emissiveIntensity = 1.0 + Math.sin(elapsed * 2) * 0.5;

    // Door light gentle pulsing (atmospheric)
    doorLight1.intensity = 1.5 + Math.sin(elapsed * 1.1) * 0.3;
    doorLight2.intensity = 1.5 + Math.sin(elapsed * 1.1 + 1.0) * 0.3;

    // Door 3 (La Carte) opening animation
    if (mapUnlocked && mapDoorOpenT < 1) {
      mapDoorOpenT = Math.min(1, mapDoorOpenT + delta * 0.5);
      const t = easeOutCubic(mapDoorOpenT);
      door3.doorPanel.position.x = -t * 1.0;
      for (const bar of lockBars3) {
        bar.position.x -= delta * 0.4;
        bar.material.opacity = 1 - t;
        bar.material.transparent = true;
        if (t >= 1) bar.visible = false;
      }
    }

    // Door 4 (Les Mots Perdus) opening animation
    if (wordsUnlocked && wordsDoorOpenT < 1) {
      wordsDoorOpenT = Math.min(1, wordsDoorOpenT + delta * 0.5);
      const t = easeOutCubic(wordsDoorOpenT);
      door4.doorPanel.position.x = -t * 1.0;
      for (const bar of lockBars4) {
        bar.position.x += delta * 0.4;
        bar.material.opacity = 1 - t;
        bar.material.transparent = true;
        if (t >= 1) bar.visible = false;
      }
    }

    // Door 5 (Star Chamber) opening animation
    if (starsUnlocked && starsDoorOpenT < 1) {
      starsDoorOpenT = Math.min(1, starsDoorOpenT + delta * 0.5);
      const t = easeOutCubic(starsDoorOpenT);
      door5.doorPanel.position.x = -t * 1.2;
      for (const bar of lockBars5) {
        bar.position.y -= delta * 0.6;
        bar.material.opacity = 1 - t;
        bar.material.transparent = true;
        if (t >= 1) bar.visible = false;
      }
    }
  }

  // ── Return ─────────────────────────────────────────────────────────
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
