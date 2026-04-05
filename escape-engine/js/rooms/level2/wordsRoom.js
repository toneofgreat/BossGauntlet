import * as THREE from 'three';
import {
  Engine, Materials, createRoom, createDoor, createTextPlane,
  addSpotlight, addPointLight
} from '../../engine.js';

// ─── Room: Les Mots Perdus ──────────────────────────────────────────────
// An underwater library where five vocabulary words must be matched to
// sentences with blanks.  Language Arts / context-clues puzzle for Level 2.
// Players find glowing word tiles around the room, pick them up, then
// place them on the correct pedestal.

// ── Data ────────────────────────────────────────────────────────────────

const WORDS = [
  {
    english: 'significant',
    french:  'significatif',
    sentence: 'The scientist\'s research made a _____ contribution to our understanding of ocean ecosystems.',
    context:  '— Dr. Moreau\'s Journal, Entry 42: "Years of data collection finally paid off. The breakthrough changed everything we thought we knew about deep-sea coral."',
    tilePos: new THREE.Vector3(2.8, 0.85, 3.5),   // on desk near entrance
    pedestalPos: new THREE.Vector3(-3.0, 0, -1.5),
    pedestalLabel: 'Piédestal I'
  },
  {
    english: 'infer',
    french:  'déduire',
    sentence: 'She could _____ from the evidence that the ruins were over a thousand years old.',
    context:  '— Dr. Moreau\'s Journal, Entry 78: "The carbon dating results were incomplete, but the artifacts and sediment layers told a story of their own. A careful reader could draw the right conclusion."',
    tilePos: new THREE.Vector3(-4.2, 2.2, -2.0),   // on a high shelf
    pedestalPos: new THREE.Vector3(3.0, 0, -1.5),
    pedestalLabel: 'Pedestal II'
  },
  {
    english: 'flourish',
    french:  's\'épanouir',
    sentence: 'The coral reef began to _____ once the water temperature was restored to normal.',
    context:  '— Dr. Moreau\'s Journal, Entry 103: "Within weeks of the cooling system\'s repair, new growth appeared. Colors returned. Life was thriving again in every direction."',
    tilePos: new THREE.Vector3(4.2, 1.4, 0.5),     // near porthole
    pedestalPos: new THREE.Vector3(0, 0, -3.8),
    pedestalLabel: 'Piédestal III'
  },
  {
    english: 'perspective',
    french:  'perspective',
    sentence: 'Each team member had a unique _____ on how to solve the flooding problem.',
    context:  '— Dr. Moreau\'s Journal, Entry 115: "The engineer saw pipes; the biologist saw ecosystems. Everyone\'s viewpoint mattered — and the solution came from combining them all."',
    tilePos: new THREE.Vector3(-1.0, 0.92, 1.5),   // on the map table
    pedestalPos: new THREE.Vector3(-1.8, 0, 1.5),
    pedestalLabel: 'Pedestal IV'
  },
  {
    english: 'elaborate',
    french:  'élaborer',
    sentence: 'The captain asked the crew to _____ on their findings in greater detail.',
    context:  '— Dr. Moreau\'s Journal, Entry 131: "A brief summary was not enough. The captain wanted every detail — more description, more explanation, a thorough expansion of our report."',
    tilePos: new THREE.Vector3(1.5, 0.6, -3.8),    // near the exit area
    pedestalPos: new THREE.Vector3(1.8, 0, 1.5),
    pedestalLabel: 'Piédestal V'
  }
];

// ── Helpers ──────────────────────────────────────────────────────────────

function place(parent, geo, mat, x, y, z) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

/** Create a canvas-based sentence display for a pedestal. */
function createSentenceDisplay(sentence, context, label, width, height) {
  const canvas = document.createElement('canvas');
  const scale = 2;
  canvas.width = width * 200 * scale;
  canvas.height = height * 200 * scale;
  const ctx = canvas.getContext('2d');

  function draw(state) {
    // state: 'blank' | 'correct' | 'wrong'
    const bgColor = state === 'correct' ? 'rgba(8,40,20,0.95)'
                  : state === 'wrong'   ? 'rgba(50,10,10,0.95)'
                  : 'rgba(10,18,35,0.92)';
    const textColor = state === 'correct' ? '#44ff88'
                    : state === 'wrong'   ? '#ff4444'
                    : '#aaddff';
    const accentColor = state === 'correct' ? '#66ffaa' : '#ffcc44';

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Border
    ctx.strokeStyle = state === 'correct' ? '#44ff88'
                    : state === 'wrong'   ? '#ff4444'
                    : '#335577';
    ctx.lineWidth = 4 * scale;
    ctx.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);

    // Label at top
    ctx.fillStyle = accentColor;
    ctx.font = `bold ${12 * scale}px Courier New`;
    ctx.textAlign = 'center';
    ctx.fillText(label, canvas.width / 2, 28 * scale);

    // Sentence (word-wrapped)
    ctx.fillStyle = textColor;
    ctx.font = `${13 * scale}px Courier New`;
    const words = sentence.split(' ');
    const lines = [];
    let currentLine = '';
    const maxWidth = canvas.width * 0.85;
    for (const word of words) {
      const testLine = currentLine ? currentLine + ' ' + word : word;
      if (ctx.measureText(testLine).width > maxWidth) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    lines.push(currentLine);

    const lineHeight = 15 * scale;
    const sentenceStartY = 50 * scale;
    lines.forEach((line, i) => {
      ctx.fillText(line, canvas.width / 2, sentenceStartY + i * lineHeight);
    });

    // Context clue (smaller, dimmer)
    ctx.fillStyle = 'rgba(150,170,200,0.6)';
    ctx.font = `italic ${9 * scale}px Courier New`;
    const ctxWords = context.split(' ');
    const ctxLines = [];
    let ctxLine = '';
    const ctxMaxWidth = canvas.width * 0.8;
    for (const word of ctxWords) {
      const testLine = ctxLine ? ctxLine + ' ' + word : word;
      if (ctx.measureText(testLine).width > ctxMaxWidth) {
        ctxLines.push(ctxLine);
        ctxLine = word;
      } else {
        ctxLine = testLine;
      }
    }
    ctxLines.push(ctxLine);

    const ctxStartY = sentenceStartY + lines.length * lineHeight + 18 * scale;
    const ctxLineH = 11 * scale;
    ctxLines.forEach((line, i) => {
      ctx.fillText(line, canvas.width / 2, ctxStartY + i * ctxLineH);
    });
  }

  draw('blank');

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    emissive: new THREE.Color(0x4488bb),
    emissiveMap: texture,
    emissiveIntensity: 0.25,
    roughness: 0.3,
    metalness: 0.1
  });

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  mesh.userData._draw = draw;
  mesh.userData._texture = texture;
  mesh.userData._material = material;
  return mesh;
}

// ── Main builder ────────────────────────────────────────────────────────

export function buildWordsRoom(engine, gameState) {
  const WIDTH = 10, HEIGHT = 4, DEPTH = 10;
  const group = new THREE.Group();

  // ── State ───────────────────────────────────────────────────────────
  const state = {
    heldWord: null,       // index of currently held word, or null
    placed: [false, false, false, false, false],
    solved: false,
    time: 0
  };

  // ── Room shell ──────────────────────────────────────────────────────
  const wallColor = 0x0c2a3e;
  const floorColor = 0x0a1520;
  const ceilColor = 0x0e2838;
  const room = createRoom(
    WIDTH, HEIGHT, DEPTH,
    Materials.wall(wallColor),
    Materials.floor(floorColor),
    Materials.wall(ceilColor)
  );
  group.add(room.group);

  // ── Lighting — brighter underwater library ──────────────────────────
  // Main overhead lights — warm blue-white
  addPointLight(room.group, new THREE.Vector3(0, 3.6, 0), 0x88ccff, 2.2, 14);
  addPointLight(room.group, new THREE.Vector3(-3, 3.5, -2), 0x66aadd, 1.6, 10);
  addPointLight(room.group, new THREE.Vector3(3, 3.5, -2), 0x66aadd, 1.6, 10);
  addPointLight(room.group, new THREE.Vector3(-3, 3.5, 2), 0x77bbee, 1.2, 9);
  addPointLight(room.group, new THREE.Vector3(3, 3.5, 2), 0x77bbee, 1.2, 9);

  // Warm reading-nook spotlights
  addPointLight(room.group, new THREE.Vector3(-2.5, 2.5, 3.5), 0xffe8c0, 1.0, 6);
  addPointLight(room.group, new THREE.Vector3(2.5, 2.5, -3.5), 0xffe8c0, 1.0, 6);

  // Bioluminescent accent — soft cyan from floor
  addPointLight(room.group, new THREE.Vector3(0, 0.2, 0), 0x22ffcc, 0.8, 8);

  // Ambient fill
  const ambientLight = new THREE.AmbientLight(0x334466, 0.5);
  room.group.add(ambientLight);

  // ── Water floor (translucent plane) ────────────────────────────────
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x1a5577,
    emissive: 0x0a3355,
    emissiveIntensity: 0.3,
    roughness: 0.1,
    metalness: 0.2,
    transparent: true,
    opacity: 0.35,
    side: THREE.DoubleSide
  });
  const waterPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(WIDTH - 0.1, DEPTH - 0.1),
    waterMat
  );
  waterPlane.rotation.x = -Math.PI / 2;
  waterPlane.position.y = 0.02;
  group.add(waterPlane);

  // ── Bookshelves (underwater library walls) ──────────────────────────
  function createBookshelf(w, h, d) {
    const shelf = new THREE.Group();
    const woodMat = new THREE.MeshStandardMaterial({
      color: 0x1e3a4a, roughness: 0.8, metalness: 0.1
    });

    // Back panel
    place(shelf, new THREE.BoxGeometry(w, h, 0.04), woodMat, 0, h / 2, -d / 2 + 0.02);
    // Bottom
    place(shelf, new THREE.BoxGeometry(w, 0.04, d), woodMat, 0, 0.02, 0);
    // Top
    place(shelf, new THREE.BoxGeometry(w, 0.04, d), woodMat, 0, h, 0);
    // Sides
    [-1, 1].forEach(side => {
      place(shelf, new THREE.BoxGeometry(0.04, h, d), woodMat, side * (w / 2 - 0.02), h / 2, 0);
    });

    // Shelves
    const shelfCount = Math.floor(h / 0.6);
    for (let i = 1; i < shelfCount; i++) {
      place(shelf, new THREE.BoxGeometry(w - 0.08, 0.03, d - 0.04), woodMat, 0, i * (h / shelfCount), 0);
    }

    // Books (ocean-themed colors)
    const bookColors = [0x1a4a6b, 0x0a5555, 0x2a5544, 0x1a3a6b, 0x335566, 0x224455, 0x3a6677];
    for (let i = 0; i < shelfCount; i++) {
      const y = i * (h / shelfCount) + 0.04;
      let x = -w / 2 + 0.12;
      while (x < w / 2 - 0.1) {
        const bw = 0.03 + Math.random() * 0.04;
        const bh = 0.18 + Math.random() * 0.15;
        const bd = d * 0.7;
        const bookMat = new THREE.MeshStandardMaterial({
          color: bookColors[Math.floor(Math.random() * bookColors.length)],
          roughness: 0.85, metalness: 0.05
        });
        const book = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), bookMat);
        book.position.set(x, y + bh / 2, 0);
        book.rotation.z = (Math.random() - 0.5) * 0.08;
        shelf.add(book);
        x += bw + 0.005;
      }
    }

    return shelf;
  }

  // Left wall bookshelves
  for (let i = 0; i < 3; i++) {
    const bs = createBookshelf(2.0, 3.2, 0.4);
    bs.position.set(-4.7, 0, -3.5 + i * 3.2);
    bs.rotation.y = Math.PI / 2;
    group.add(bs);
  }

  // Right wall bookshelves
  for (let i = 0; i < 3; i++) {
    const bs = createBookshelf(1.8, 2.8, 0.38);
    bs.position.set(4.7, 0, -3.5 + i * 3.2);
    bs.rotation.y = -Math.PI / 2;
    group.add(bs);
  }

  // Back wall partial shelves (flanking the exit area)
  const bsBackL = createBookshelf(1.6, 2.5, 0.35);
  bsBackL.position.set(-3.5, 0, -4.7);
  group.add(bsBackL);

  const bsBackR = createBookshelf(1.6, 2.5, 0.35);
  bsBackR.position.set(3.5, 0, -4.7);
  group.add(bsBackR);

  // ── Desk near entrance (front-right) ───────────────────────────────
  const deskGroup = new THREE.Group();
  const deskMat = new THREE.MeshStandardMaterial({ color: 0x1e3040, roughness: 0.75, metalness: 0.15 });
  // Tabletop
  place(deskGroup, new THREE.BoxGeometry(1.4, 0.06, 0.7), deskMat, 0, 0.78, 0);
  // Legs
  [[-0.62, -0.28], [-0.62, 0.28], [0.62, -0.28], [0.62, 0.28]].forEach(([x, z]) => {
    place(deskGroup, new THREE.BoxGeometry(0.06, 0.78, 0.06), deskMat, x, 0.39, z);
  });
  deskGroup.position.set(2.8, 0, 3.5);
  group.add(deskGroup);

  // ── Map table (center-left area) ───────────────────────────────────
  const mapTableGroup = new THREE.Group();
  const tableMat = new THREE.MeshStandardMaterial({ color: 0x1a2e3e, roughness: 0.7, metalness: 0.2 });
  // Tabletop
  place(mapTableGroup, new THREE.BoxGeometry(1.6, 0.05, 1.0), tableMat, 0, 0.85, 0);
  // Legs
  [[-0.7, -0.4], [-0.7, 0.4], [0.7, -0.4], [0.7, 0.4]].forEach(([x, z]) => {
    place(mapTableGroup, new THREE.BoxGeometry(0.05, 0.85, 0.05), tableMat, x, 0.425, z);
  });
  // Map surface (decorative text plane on top)
  const mapSurface = createTextPlane('CARTE SOUS-MARINE\nStation Lumière — Niveau 2', 1.4, 0.8, 12, '#55aacc', 'rgba(10,25,40,0.85)');
  mapSurface.rotation.x = -Math.PI / 2;
  mapSurface.position.set(0, 0.88, 0);
  mapTableGroup.add(mapSurface);

  mapTableGroup.position.set(-1.0, 0, 1.5);
  group.add(mapTableGroup);

  // ── Portholes on right wall ────────────────────────────────────────
  function createPorthole(radius) {
    const pGroup = new THREE.Group();
    // Outer ring
    const ringMat = Materials.metal(0x556677);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.04, 12, 32), ringMat);
    pGroup.add(ring);
    // Glass
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x1a6688,
      emissive: 0x115577,
      emissiveIntensity: 0.6,
      transparent: true,
      opacity: 0.5,
      roughness: 0.05,
      metalness: 0.1
    });
    const glass = new THREE.Mesh(new THREE.CircleGeometry(radius - 0.02, 32), glassMat);
    glass.position.z = 0.01;
    pGroup.add(glass);
    // Bolts
    for (let b = 0; b < 8; b++) {
      const angle = (b / 8) * Math.PI * 2;
      const bolt = new THREE.Mesh(
        new THREE.CylinderGeometry(0.015, 0.015, 0.03, 8),
        Materials.metal(0x888888)
      );
      bolt.rotation.x = Math.PI / 2;
      bolt.position.set(Math.cos(angle) * (radius + 0.02), Math.sin(angle) * (radius + 0.02), 0.02);
      pGroup.add(bolt);
    }
    return pGroup;
  }

  const porthole1 = createPorthole(0.35);
  porthole1.position.set(4.95, 2.0, 0.5);
  porthole1.rotation.y = -Math.PI / 2;
  group.add(porthole1);

  const porthole2 = createPorthole(0.28);
  porthole2.position.set(4.95, 2.2, -2.5);
  porthole2.rotation.y = -Math.PI / 2;
  group.add(porthole2);

  // Light from portholes
  addPointLight(room.group, new THREE.Vector3(4.5, 2.0, 0.5), 0x44aacc, 1.4, 5);
  addPointLight(room.group, new THREE.Vector3(4.5, 2.2, -2.5), 0x44aacc, 0.9, 4);

  // ── Room sign ──────────────────────────────────────────────────────
  const roomSign = createTextPlane(
    'Les Mots Perdus — Bibliothèque Sous-Marine',
    3.0, 0.35, 16, '#ffcc66', 'rgba(15,25,40,0.9)'
  );
  roomSign.position.set(0, 3.5, 4.95);
  roomSign.rotation.y = Math.PI;
  group.add(roomSign);

  // ── Bilingual dictionary page (readable, on a shelf) ───────────────
  const dictPage = createTextPlane(
    'Dictionnaire / Dictionary\n\n' +
    'significant — significatif\n' +
    'infer — déduire\n' +
    'flourish — s\'épanouir\n' +
    'perspective — perspective\n' +
    'elaborate — élaborer',
    0.7, 0.9, 10, '#ccddee', 'rgba(20,30,45,0.92)'
  );
  dictPage.position.set(-4.48, 1.8, 2.0);
  dictPage.rotation.y = Math.PI / 2;
  group.add(dictPage);

  engine.registerInteractive(dictPage, {
    type: 'click',
    prompt: 'Read Dictionary / Lire le dictionnaire',
    icon: '\uD83D\uDCD6',
    onInteract: () => {
      engine.playEffect('click');
      engine.showNarrative('Dictionnaire Bilingue', `
        <p style="color:#ffcc44;font-weight:bold;margin-bottom:12px;">Vocabulary / Vocabulaire</p>
        <table style="width:100%;border-collapse:collapse;">
          <tr style="border-bottom:1px solid #335;">
            <td style="padding:8px;color:#88ccff;font-weight:bold;">English</td>
            <td style="padding:8px;color:#ffcc44;font-weight:bold;">Français</td>
          </tr>
          <tr style="border-bottom:1px solid #223;">
            <td style="padding:6px;color:#aaddff;">significant</td>
            <td style="padding:6px;color:#eebb88;font-style:italic;">significatif</td>
          </tr>
          <tr style="border-bottom:1px solid #223;">
            <td style="padding:6px;color:#aaddff;">infer</td>
            <td style="padding:6px;color:#eebb88;font-style:italic;">déduire</td>
          </tr>
          <tr style="border-bottom:1px solid #223;">
            <td style="padding:6px;color:#aaddff;">flourish</td>
            <td style="padding:6px;color:#eebb88;font-style:italic;">s'épanouir</td>
          </tr>
          <tr style="border-bottom:1px solid #223;">
            <td style="padding:6px;color:#aaddff;">perspective</td>
            <td style="padding:6px;color:#eebb88;font-style:italic;">perspective</td>
          </tr>
          <tr>
            <td style="padding:6px;color:#aaddff;">elaborate</td>
            <td style="padding:6px;color:#eebb88;font-style:italic;">élaborer</td>
          </tr>
        </table>
        <p style="color:#888;font-size:0.85em;margin-top:14px;">
          Use context clues in each sentence to determine which word fits best.
          Pay attention to the surrounding text on each pedestal for hints.
        </p>
      `);
    }
  });

  // ── Reading nooks (two alcoves with spotlights) ────────────────────
  // Left nook — armchair shape
  const nookChairMat = new THREE.MeshStandardMaterial({ color: 0x1a3344, roughness: 0.85, metalness: 0.05 });
  const nookL = new THREE.Group();
  place(nookL, new THREE.BoxGeometry(0.7, 0.4, 0.6), nookChairMat, 0, 0.2, 0);      // seat
  place(nookL, new THREE.BoxGeometry(0.7, 0.6, 0.08), nookChairMat, 0, 0.55, -0.26); // back
  place(nookL, new THREE.BoxGeometry(0.08, 0.45, 0.6), nookChairMat, -0.35, 0.3, 0); // left arm
  place(nookL, new THREE.BoxGeometry(0.08, 0.45, 0.6), nookChairMat, 0.35, 0.3, 0);  // right arm
  nookL.position.set(-3.2, 0, 3.8);
  group.add(nookL);
  addSpotlight(room.group, new THREE.Vector3(-3.2, 3.5, 3.8), new THREE.Vector3(-3.2, 0.5, 3.8), 0xffe4b5, 1.2, 0.35);

  // Right nook
  const nookR = new THREE.Group();
  place(nookR, new THREE.BoxGeometry(0.7, 0.4, 0.6), nookChairMat, 0, 0.2, 0);
  place(nookR, new THREE.BoxGeometry(0.7, 0.6, 0.08), nookChairMat, 0, 0.55, -0.26);
  place(nookR, new THREE.BoxGeometry(0.08, 0.45, 0.6), nookChairMat, -0.35, 0.3, 0);
  place(nookR, new THREE.BoxGeometry(0.08, 0.45, 0.6), nookChairMat, 0.35, 0.3, 0);
  nookR.position.set(3.2, 0, -3.5);
  nookR.rotation.y = Math.PI;
  group.add(nookR);
  addSpotlight(room.group, new THREE.Vector3(3.2, 3.5, -3.5), new THREE.Vector3(3.2, 0.5, -3.5), 0xffe4b5, 1.0, 0.35);

  // ── Build pedestals ────────────────────────────────────────────────
  const pedestals = [];
  const sentenceDisplays = [];
  const pedestalGlowMats = [];

  WORDS.forEach((wordData, idx) => {
    const pedGroup = new THREE.Group();

    // Stone base
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x2a3a4a, roughness: 0.7, metalness: 0.3 });
    place(pedGroup, new THREE.CylinderGeometry(0.35, 0.45, 0.15, 16), baseMat, 0, 0.075, 0);

    // Column
    const colMat = new THREE.MeshStandardMaterial({ color: 0x334455, roughness: 0.5, metalness: 0.4 });
    place(pedGroup, new THREE.CylinderGeometry(0.2, 0.3, 0.9, 12), colMat, 0, 0.6, 0);

    // Top platform
    place(pedGroup, new THREE.CylinderGeometry(0.4, 0.25, 0.1, 16), baseMat, 0, 1.1, 0);

    // Emissive ring around the top
    const glowMat = Materials.emissive(0x4488bb, 1.5);
    const glowRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.38, 0.015, 8, 32),
      glowMat
    );
    glowRing.rotation.x = -Math.PI / 2;
    glowRing.position.y = 1.16;
    pedGroup.add(glowRing);
    pedestalGlowMats.push(glowMat);

    // Sentence display (angled above the pedestal)
    const display = createSentenceDisplay(
      wordData.sentence,
      wordData.context,
      wordData.pedestalLabel,
      1.1, 0.7
    );
    display.position.set(0, 1.8, 0.15);
    display.rotation.x = -0.2;
    pedGroup.add(display);
    sentenceDisplays.push(display);

    // Spotlight on pedestal
    addSpotlight(
      pedGroup,
      new THREE.Vector3(0, 3.0, 0.5),
      new THREE.Vector3(0, 1.2, 0),
      0x88bbee, 1.5, 0.4
    );

    pedGroup.position.set(wordData.pedestalPos.x, wordData.pedestalPos.y, wordData.pedestalPos.z);
    group.add(pedGroup);
    pedestals.push(pedGroup);

    // Register pedestal as interactive
    const hitZone = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 1.4, 0.9),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    hitZone.position.set(0, 0.9, 0);
    pedGroup.add(hitZone);

    engine.registerInteractive(hitZone, {
      type: 'click',
      prompt: state.heldWord !== null ? 'Place word here' : 'Read sentence',
      icon: '\uD83D\uDCDD',
      onInteract: () => {
        if (state.placed[idx]) {
          // Already solved this pedestal
          engine.playEffect('click');
          return;
        }

        if (state.heldWord === null) {
          // No word held — show sentence as narrative
          engine.playEffect('click');
          engine.showNarrative(wordData.pedestalLabel, `
            <p style="color:#88ccff;font-size:1.1em;line-height:1.7;margin-bottom:14px;">
              "${wordData.sentence}"
            </p>
            <p style="color:#889;font-style:italic;font-size:0.9em;line-height:1.5;">
              ${wordData.context}
            </p>
            <p style="color:#ffcc44;font-size:0.85em;margin-top:12px;">
              Find the correct word tile and click it to pick it up, then return here.
            </p>
          `);
          return;
        }

        // Word is held — check if correct
        if (state.heldWord === idx) {
          // CORRECT placement
          state.placed[idx] = true;
          state.heldWord = null;

          engine.playEffect('success');

          // Update display to correct state
          display.userData._draw('correct');
          display.userData._texture.needsUpdate = true;
          display.userData._material.emissive.set(0x22aa55);
          display.userData._material.emissiveIntensity = 0.5;

          // Turn pedestal glow green
          glowMat.color.set(0x33ff88);
          glowMat.emissive.set(0x33ff88);
          glowMat.emissiveIntensity = 2.5;

          // Hide the tile (already picked up)
          wordTiles[idx].visible = false;

          // Grow coral from the base (simple animated mesh stored for update)
          const coral = createCoralGrowth();
          coral.position.set(0, 0.15, 0);
          coral.scale.set(0.01, 0.01, 0.01);
          pedGroup.add(coral);
          coralGrowths.push({ mesh: coral, targetScale: 1.0, currentScale: 0.01 });

          // Update HUD
          const placedCount = state.placed.filter(Boolean).length;
          if (placedCount === 5) {
            solvePuzzle();
          } else {
            engine.showObjective(`Words placed: ${placedCount}/5 — Find and place the remaining words.`);
          }
        } else {
          // WRONG placement
          engine.playEffect('alarm');

          // Flash red
          display.userData._draw('wrong');
          display.userData._texture.needsUpdate = true;

          // Return word to original position
          const heldIdx = state.heldWord;
          wordTiles[heldIdx].visible = true;
          wordTiles[heldIdx].position.set(
            WORDS[heldIdx].tilePos.x,
            WORDS[heldIdx].tilePos.y,
            WORDS[heldIdx].tilePos.z
          );
          tileGlowMats[heldIdx].emissiveIntensity = 2.0;
          state.heldWord = null;

          // Reset display after brief flash
          setTimeout(() => {
            display.userData._draw('blank');
            display.userData._texture.needsUpdate = true;
          }, 600);

          engine.showObjective('Wrong word! The word has returned to its location. Try reading the context clues.');
        }
      }
    });
  });

  // ── Coral growth helper ─────────────────────────────────────────────
  const coralGrowths = [];

  function createCoralGrowth() {
    const coralGroup = new THREE.Group();
    const coralColors = [0x33aa77, 0x44cc88, 0x55bb99, 0x22dd88];

    // Several small branching coral pieces
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 + Math.random() * 0.5;
      const dist = 0.15 + Math.random() * 0.2;
      const h = 0.15 + Math.random() * 0.25;
      const r = 0.02 + Math.random() * 0.03;

      const coralMat = new THREE.MeshStandardMaterial({
        color: coralColors[Math.floor(Math.random() * coralColors.length)],
        emissive: 0x22aa66,
        emissiveIntensity: 0.6,
        roughness: 0.7,
        metalness: 0.1
      });

      const branch = new THREE.Mesh(
        new THREE.CylinderGeometry(r * 0.4, r, h, 6),
        coralMat
      );
      branch.position.set(Math.cos(angle) * dist, h / 2, Math.sin(angle) * dist);
      branch.rotation.z = (Math.random() - 0.5) * 0.4;
      branch.rotation.x = (Math.random() - 0.5) * 0.4;
      coralGroup.add(branch);

      // Small tip sphere
      const tip = new THREE.Mesh(
        new THREE.SphereGeometry(r * 0.6, 6, 6),
        coralMat
      );
      tip.position.set(
        Math.cos(angle) * dist + (Math.random() - 0.5) * 0.03,
        h,
        Math.sin(angle) * dist + (Math.random() - 0.5) * 0.03
      );
      coralGroup.add(tip);
    }

    return coralGroup;
  }

  // ── Build word tiles ───────────────────────────────────────────────
  const wordTiles = [];
  const tileGlowMats = [];

  WORDS.forEach((wordData, idx) => {
    const tileGroup = new THREE.Group();

    // Tablet base
    const tabletMat = new THREE.MeshStandardMaterial({
      color: 0x2a3020,
      roughness: 0.5,
      metalness: 0.3
    });
    const tablet = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.25, 0.04),
      tabletMat
    );
    tileGroup.add(tablet);

    // Emissive golden glow border
    const tileGlowMat = Materials.emissive(0xffcc44, 2.0);
    tileGlowMats.push(tileGlowMat);

    const bw = 0.4; const bh = 0.25; const t = 0.012;
    [
      { w: bw + t, h: t, x: 0, y:  bh / 2 },
      { w: bw + t, h: t, x: 0, y: -bh / 2 },
      { w: t, h: bh + t, x:  bw / 2, y: 0 },
      { w: t, h: bh + t, x: -bw / 2, y: 0 }
    ].forEach(e => {
      const border = new THREE.Mesh(new THREE.PlaneGeometry(e.w, e.h), tileGlowMat);
      border.position.set(e.x, e.y, 0.022);
      tileGroup.add(border);
    });

    // Word text (English)
    const wordLabel = createTextPlane(
      wordData.english,
      0.35, 0.12, 14, '#ffcc44', 'rgba(0,0,0,0)'
    );
    wordLabel.position.set(0, 0.03, 0.025);
    tileGroup.add(wordLabel);

    // French equivalent (smaller, below)
    const frenchLabel = createTextPlane(
      wordData.french,
      0.35, 0.08, 10, '#aabb88', 'rgba(0,0,0,0)'
    );
    frenchLabel.position.set(0, -0.06, 0.025);
    tileGroup.add(frenchLabel);

    // Position tile
    tileGroup.position.set(wordData.tilePos.x, wordData.tilePos.y, wordData.tilePos.z);

    // Slight tilt for visual interest
    tileGroup.rotation.y = Math.random() * 0.6 - 0.3;
    tileGroup.rotation.x = (Math.random() - 0.5) * 0.15;

    group.add(tileGroup);
    wordTiles.push(tileGroup);

    // Point light near the tile to help it stand out
    addPointLight(group, new THREE.Vector3(
      wordData.tilePos.x,
      wordData.tilePos.y + 0.3,
      wordData.tilePos.z
    ), 0xffcc44, 0.5, 2);

    // Register tile as interactive
    engine.registerInteractive(tileGroup, {
      type: 'click',
      prompt: `Pick up: ${wordData.english}`,
      icon: '\u2728',
      onInteract: () => {
        if (state.placed[idx] || state.solved) return;

        if (state.heldWord !== null) {
          // Already holding a word — swap: put old one back
          const oldIdx = state.heldWord;
          wordTiles[oldIdx].visible = true;
          wordTiles[oldIdx].position.set(
            WORDS[oldIdx].tilePos.x,
            WORDS[oldIdx].tilePos.y,
            WORDS[oldIdx].tilePos.z
          );
          tileGlowMats[oldIdx].emissiveIntensity = 2.0;
        }

        // Pick up this word
        state.heldWord = idx;
        tileGroup.visible = false;
        engine.playEffect('click');
        engine.showObjective(`Holding: "${wordData.english}" (${wordData.french}) — Place it on the correct pedestal.`);
      }
    });
  });

  // ── Door (back to hub / previous room) ──────────────────────────────
  const backDoor = createDoor(1.2, 2.2, 0x1e4466);
  backDoor.group.position.set(0, 0, DEPTH / 2);
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

  // ── Success sequence ──────────────────────────────────────────────
  const successLights = [];
  const beamMeshes = [];

  function solvePuzzle() {
    if (state.solved) return;
    state.solved = true;

    engine.playEffect('success');
    setTimeout(() => engine.playEffect('powerup'), 400);

    // Green accent lights sweep the room
    const greenPositions = [
      new THREE.Vector3(-3, 3.0, 0),
      new THREE.Vector3(3, 3.0, 0),
      new THREE.Vector3(0, 3.2, 3),
      new THREE.Vector3(0, 3.2, -3),
      new THREE.Vector3(-2, 2.5, -3),
      new THREE.Vector3(2, 2.5, -3),
      new THREE.Vector3(-2, 2.5, 3),
      new THREE.Vector3(2, 2.5, 3)
    ];
    greenPositions.forEach(pos => {
      const gl = addPointLight(room.group, pos, 0x33ff88, 1.5, 10);
      successLights.push(gl);
    });

    // Connect all pedestals with light beams
    for (let i = 0; i < WORDS.length; i++) {
      const nextIdx = (i + 1) % WORDS.length;
      const start = WORDS[i].pedestalPos;
      const end = WORDS[nextIdx].pedestalPos;

      const direction = new THREE.Vector3().subVectors(end, start);
      const length = direction.length();
      const midpoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);

      const beamGeo = new THREE.CylinderGeometry(0.02, 0.02, length, 6);
      const beamMat = new THREE.MeshBasicMaterial({
        color: 0x44ffaa,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending
      });
      const beam = new THREE.Mesh(beamGeo, beamMat);
      beam.position.set(midpoint.x, 1.5, midpoint.z);

      // Orient the beam to point from start to end
      beam.lookAt(end.x, 1.5, end.z);
      beam.rotateX(Math.PI / 2);

      group.add(beam);
      beamMeshes.push({ mesh: beam, mat: beamMat });
    }

    // Door status light to green
    backDoor.lightMat.color.set(0x33ff66);
    backDoor.lightMat.emissive.set(0x33ff66);

    // Water becomes slightly luminous
    waterMat.emissive.set(0x115544);
    waterMat.emissiveIntensity = 0.5;

    engine.hideObjective();
    engine.showCompletion('Les Mots Perdus — All Words Placed!');
    engine.showRoomTitle('MISSION ACCOMPLIE', 'The Lost Words have been found');

    if (gameState) {
      gameState.wordsComplete = true;
    }
  }

  // ── Lifecycle ─────────────────────────────────────────────────────
  let dustSystem = null;

  function enter() {
    engine.camera.position.set(0, 1.6, 3.8);
    engine.setRoomBounds(-WIDTH / 2 + 0.3, WIDTH / 2 - 0.3, -DEPTH / 2 + 0.3, DEPTH / 2 - 0.3);

    engine.showRoomTitle('Les Mots Perdus', 'Bibliothèque Sous-Marine — The Lost Words');

    // Ambient sound: deep underwater hum
    engine.playAmbient(48, 'sine', 0.06);
    engine.playAmbient(96, 'triangle', 0.02);

    // Bioluminescent dust particles
    dustSystem = engine.addDust({
      minX: -WIDTH / 2,
      maxX: WIDTH / 2,
      minZ: -DEPTH / 2,
      maxZ: DEPTH / 2,
      height: HEIGHT
    }, 300);

    // Objective
    if (!state.solved) {
      const placedCount = state.placed.filter(Boolean).length;
      if (placedCount === 0) {
        engine.showObjective('Find the five lost word tiles and place each on the correct pedestal.');
      } else {
        engine.showObjective(`Words placed: ${placedCount}/5 — Find and place the remaining words.`);
      }
    }
  }

  function exit() {
    engine.stopAmbient();
    engine.clearParticles();
    engine.hideObjective();
    dustSystem = null;
  }

  function update(delta) {
    state.time += delta;

    // Pulse unfound word tiles (golden glow)
    const tilePulse = 0.8 + Math.sin(state.time * 3.5) * 0.6;
    for (let i = 0; i < 5; i++) {
      if (!state.placed[i] && state.heldWord !== i) {
        tileGlowMats[i].emissiveIntensity = tilePulse * 2.0;

        // Gentle float animation for unplaced tiles
        wordTiles[i].position.y = WORDS[i].tilePos.y + Math.sin(state.time * 2.0 + i * 1.3) * 0.03;
      }
    }

    // Pulse unfilled pedestal rings
    const pedPulse = 0.6 + Math.sin(state.time * 2.0) * 0.4;
    for (let i = 0; i < 5; i++) {
      if (!state.placed[i]) {
        pedestalGlowMats[i].emissiveIntensity = pedPulse * 1.5;
      }
    }

    // Animate coral growth
    for (const coral of coralGrowths) {
      if (coral.currentScale < coral.targetScale) {
        coral.currentScale = Math.min(coral.targetScale, coral.currentScale + delta * 0.8);
        coral.mesh.scale.set(coral.currentScale, coral.currentScale, coral.currentScale);
      }
    }

    // Animate water surface
    waterPlane.position.y = 0.02 + Math.sin(state.time * 0.8) * 0.005;
    waterMat.opacity = 0.3 + Math.sin(state.time * 1.2) * 0.05;

    // Success light animations
    if (state.solved) {
      successLights.forEach((light, i) => {
        light.intensity = 0.8 + Math.sin(state.time * 1.5 + i * 0.8) * 0.6;
      });

      // Pulse beams
      beamMeshes.forEach((b, i) => {
        b.mat.opacity = 0.3 + Math.sin(state.time * 2.0 + i * 1.2) * 0.25;
      });
    }
  }

  // ── Return room interface ─────────────────────────────────────────
  const returnObj = {
    group,
    enter,
    exit,
    update,
    get isComplete() { return state.solved; },
    doors: {
      back: {
        position: new THREE.Vector3(0, 0, DEPTH / 2),
        onInteract: null  // set by main.js
      }
    }
  };
  return returnObj;
}
