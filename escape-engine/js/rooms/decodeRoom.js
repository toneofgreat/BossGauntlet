import * as THREE from 'three';
import {
  Engine, Materials, createRoom, createDoor, createTextPlane,
  addSpotlight, addPointLight
} from '../engine.js';

// ─── Room 3: Les Archives ──────────────────────────────────────────────
// The station's navigation archive and communications center.
// Puzzle: Decode a Caesar-shift cipher to find the emergency beacon
// frequency (472), then dial it in on a physical frequency tuner.

// Caesar shift +3  (A->D, B->E, ... W->Z, X->A, Y->B, Z->C)
function caesarEncode(text) {
  return text.split('').map(ch => {
    if (ch >= 'A' && ch <= 'Z') return String.fromCharCode(((ch.charCodeAt(0) - 65 + 3) % 26) + 65);
    if (ch >= 'a' && ch <= 'z') return String.fromCharCode(((ch.charCodeAt(0) - 97 + 3) % 26) + 97);
    return ch;
  }).join('');
}

// ── Canvas-texture helpers ──────────────────────────────────────────────

/** Render a single large digit onto a canvas texture and return the mesh. */
function createDigitDisplay(initialDigit = 0) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 192;

  function draw(digit) {
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0a0e14';
    ctx.fillRect(0, 0, 128, 192);

    // Subtle border
    ctx.strokeStyle = '#1a4a3a';
    ctx.lineWidth = 3;
    ctx.strokeRect(4, 4, 120, 184);

    // Digit
    ctx.fillStyle = '#33ffaa';
    ctx.font = 'bold 110px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(digit), 64, 100);

    // Up / down arrows
    ctx.fillStyle = 'rgba(51,255,170,0.35)';
    ctx.font = '28px sans-serif';
    ctx.fillText('\u25B2', 64, 26);   // up
    ctx.fillText('\u25BC', 64, 172);  // down
  }

  draw(initialDigit);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshStandardMaterial({
    map: texture,
    emissive: new THREE.Color(0x33ffaa),
    emissiveMap: texture,
    emissiveIntensity: 0.35,
    roughness: 0.15,
    metalness: 0.3
  });

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.42), mat);
  mesh.userData._digitCanvas = canvas;
  mesh.userData._digitDraw = draw;
  mesh.userData._digitTexture = texture;
  return mesh;
}

/** Build a pulsing journal-fragment prop. Returns { group, glowMat }. */
function createFragmentProp(label) {
  const group = new THREE.Group();

  // Paper plane
  const paperMat = new THREE.MeshStandardMaterial({
    color: 0xd4c5a0, roughness: 0.95, metalness: 0.0
  });
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.25), paperMat);
  group.add(paper);

  // Emissive border frame (four thin strips)
  const glowMat = Materials.emissive(0xffcc44, 1.8);
  const bw = 0.35; const bh = 0.25; const t = 0.015;
  const edges = [
    { w: bw + t, h: t, x: 0, y:  bh / 2 },
    { w: bw + t, h: t, x: 0, y: -bh / 2 },
    { w: t, h: bh + t, x:  bw / 2, y: 0 },
    { w: t, h: bh + t, x: -bw / 2, y: 0 }
  ];
  edges.forEach(e => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(e.w, e.h), glowMat);
    m.position.set(e.x, e.y, 0.001);
    group.add(m);
  });

  // Small label above
  if (label) {
    const lbl = createTextPlane(label, 0.4, 0.1, 11, '#ffcc44', 'rgba(0,0,0,0)');
    lbl.position.set(0, 0.19, 0.002);
    group.add(lbl);
  }

  return { group, glowMat };
}

/** Place a mesh at (x,y,z) and add it to parent. */
function place(parent, geo, mat, x, y, z) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

// ── Main builder ────────────────────────────────────────────────────────

export function buildDecodeRoom(engine, gameState) {
  const WIDTH = 8, HEIGHT = 4, DEPTH = 10;
  const group = new THREE.Group();

  // Track state
  const state = {
    fragmentsFound: [false, false, false],
    digits: [0, 0, 0],
    solved: false,
    beaconActive: false,
    time: 0
  };

  // Correct frequency
  const TARGET = [4, 7, 2];

  // ── Room shell ──────────────────────────────────────────────────────
  const wallColor = 0x1e3346;
  const floorColor = 0x14100c;
  const room = createRoom(
    WIDTH, HEIGHT, DEPTH,
    Materials.wall(wallColor),
    Materials.floor(floorColor),
    Materials.wall(0x162436)
  );
  group.add(room.group);

  // ── Lighting ────────────────────────────────────────────────────────
  // Warm amber overheads (archive feel)
  addPointLight(room.group, new THREE.Vector3(-2, 3.5, -2), 0xffa54f, 1.8, 10);
  addPointLight(room.group, new THREE.Vector3( 2, 3.5, -2), 0xffa54f, 1.4, 10);
  addPointLight(room.group, new THREE.Vector3( 0, 3.5,  2), 0xffbb66, 1.0, 9);

  // Cold blue from equipment at back wall
  addPointLight(room.group, new THREE.Vector3(0, 2.0, -4.5), 0x4488cc, 1.6, 7);

  // Dim ambient
  const ambientLight = new THREE.AmbientLight(0x223344, 0.4);
  room.group.add(ambientLight);

  // ── Bookshelves (left wall) ─────────────────────────────────────────
  function createBookshelf(w, h, d) {
    const shelf = new THREE.Group();
    const woodMat = new THREE.MeshStandardMaterial({
      color: 0x3d2b1f, roughness: 0.85, metalness: 0.05
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

    // Shelves (internal)
    const shelfCount = Math.floor(h / 0.6);
    for (let i = 1; i < shelfCount; i++) {
      place(shelf, new THREE.BoxGeometry(w - 0.08, 0.03, d - 0.04), woodMat, 0, i * (h / shelfCount), 0);
    }

    // Books (colored blocks on each shelf)
    const bookColors = [0x8b1a1a, 0x1a4a8b, 0x2a6a3a, 0x6b4a2a, 0x4a2a6b, 0x8b6a1a, 0x1a6b6b];
    for (let i = 0; i < shelfCount; i++) {
      const y = i * (h / shelfCount) + 0.04;
      let x = -w / 2 + 0.12;
      while (x < w / 2 - 0.1) {
        const bw = 0.03 + Math.random() * 0.04;
        const bh = 0.18 + Math.random() * 0.15;
        const bd = d * 0.7;
        const bookMat = new THREE.MeshStandardMaterial({
          color: bookColors[Math.floor(Math.random() * bookColors.length)],
          roughness: 0.9, metalness: 0.05
        });
        const book = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), bookMat);
        book.position.set(x, y + bh / 2, 0);
        // Slight random tilt
        book.rotation.z = (Math.random() - 0.5) * 0.08;
        shelf.add(book);
        x += bw + 0.005;
      }
    }

    return shelf;
  }

  // Left-wall bookshelves
  for (let i = 0; i < 3; i++) {
    const bs = createBookshelf(1.8, 3.0, 0.4);
    bs.position.set(-3.7, 0, -3.5 + i * 3.2);
    bs.rotation.y = Math.PI / 2;
    group.add(bs);
  }

  // Right-wall bookshelves (partial - back half only)
  for (let i = 0; i < 2; i++) {
    const bs = createBookshelf(1.6, 2.5, 0.35);
    bs.position.set(3.7, 0, -3.5 + i * 2.8);
    bs.rotation.y = -Math.PI / 2;
    group.add(bs);
  }

  // ── Archive desk (near entrance, front-right) ──────────────────────
  const deskGroup = new THREE.Group();
  const deskMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.8, metalness: 0.1 });
  // Tabletop
  place(deskGroup, new THREE.BoxGeometry(1.6, 0.06, 0.8), deskMat, 0, 0.78, 0);
  // Legs
  [[-0.72, -0.32], [-0.72, 0.32], [0.72, -0.32], [0.72, 0.32]].forEach(([x, z]) => {
    place(deskGroup, new THREE.BoxGeometry(0.06, 0.78, 0.06), deskMat, x, 0.39, z);
  });
  // Desk lamp (simple shape)
  const lampBaseMat = Materials.metal(0x555555);
  place(deskGroup, new THREE.CylinderGeometry(0.08, 0.1, 0.04, 16), lampBaseMat, 0.5, 0.83, -0.2);
  place(deskGroup, new THREE.CylinderGeometry(0.012, 0.012, 0.35, 8), lampBaseMat, 0.5, 1.02, -0.2);
  const lampShade = new THREE.Mesh(
    new THREE.ConeGeometry(0.12, 0.1, 16, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x225533, roughness: 0.7, metalness: 0.2, side: THREE.DoubleSide })
  );
  lampShade.position.set(0.5, 1.19, -0.2);
  lampShade.rotation.x = Math.PI;
  deskGroup.add(lampShade);
  // Desk lamp light
  addPointLight(deskGroup, new THREE.Vector3(0.5, 1.15, -0.2), 0xffe4b5, 1.2, 3);

  deskGroup.position.set(2.0, 0, 3.2);
  group.add(deskGroup);

  // ── Old maps on walls (texture planes) ─────────────────────────────
  const mapLabels = [
    'CARTE DE LA STATION LUMIERE',
    'ATLANTIC ROUTES 1777-1783',
    'FRANCO-AMERICAN COOPERATION',
    'BEACON FREQUENCIES - CLASSIFIED'
  ];
  const mapPositions = [
    { pos: new THREE.Vector3(0, 2.2, -4.95), rot: 0 },
    { pos: new THREE.Vector3(1.8, 2.2, -4.95), rot: 0 },
    { pos: new THREE.Vector3(-3.95, 2.0, 1), rot: Math.PI / 2 },
    { pos: new THREE.Vector3(3.95, 2.2, -1.5), rot: -Math.PI / 2 }
  ];
  mapLabels.forEach((label, i) => {
    const mapPlane = createTextPlane(label, 1.2, 0.8, 14, '#ccaa77', 'rgba(40,30,15,0.85)');
    mapPlane.position.copy(mapPositions[i].pos);
    mapPlane.rotation.y = mapPositions[i].rot;
    group.add(mapPlane);
  });

  // ── Communications console (back wall, center) ─────────────────────
  const consoleGroup = new THREE.Group();
  const consoleMat = Materials.metal(0x3a3f44);
  const consoleDarkMat = new THREE.MeshStandardMaterial({ color: 0x1a1e22, roughness: 0.4, metalness: 0.6 });

  // Main console body
  place(consoleGroup, new THREE.BoxGeometry(3.0, 1.1, 0.7), consoleMat, 0, 0.55, 0);
  // Console top/angled panel
  place(consoleGroup, new THREE.BoxGeometry(3.0, 0.05, 0.8), consoleMat, 0, 1.1, -0.05);
  // Upper panel (instrument rack)
  place(consoleGroup, new THREE.BoxGeometry(3.2, 1.4, 0.15), consoleDarkMat, 0, 1.85, -0.28);
  // Side panels
  [-1, 1].forEach(side => {
    place(consoleGroup, new THREE.BoxGeometry(0.08, 1.4, 0.5), consoleMat, side * 1.55, 1.85, -0.1);
  });

  // Decorative knobs on console
  for (let i = 0; i < 6; i++) {
    const knob = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.03, 0.03, 12),
      Materials.metalAccent(i % 2 === 0 ? 0xcc8844 : 0x888888)
    );
    knob.rotation.x = Math.PI / 2;
    knob.position.set(-1.0 + i * 0.4, 1.15, 0.03);
    consoleGroup.add(knob);
  }

  // Small indicator lights (some red, some green, some off)
  const indicatorColors = [0xff3333, 0x33ff66, 0xff3333, 0x33ff66, 0xffaa00, 0x33ff66, 0xff3333, 0xffaa00];
  indicatorColors.forEach((color, i) => {
    const light = new THREE.Mesh(
      new THREE.SphereGeometry(0.018, 8, 8),
      Materials.emissive(color, 1.5)
    );
    light.position.set(-1.2 + i * 0.35, 2.3, -0.19);
    consoleGroup.add(light);
  });

  // Screen (left side of upper panel)
  const screenMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.8, 0.6),
    Materials.screen(0x0a2a1a)
  );
  screenMesh.position.set(-0.8, 1.9, -0.19);
  consoleGroup.add(screenMesh);

  // Screen text: "BEACON STATUS: OFFLINE"
  const screenLabel = createTextPlane('BEACON STATUS\nOFFLINE', 0.7, 0.5, 18, '#33ff66', 'rgba(5,20,10,0.95)');
  screenLabel.position.set(-0.8, 1.9, -0.185);
  consoleGroup.add(screenLabel);

  // ── Frequency tuner section (right side of console) ─────────────────
  const tunerGroup = new THREE.Group();

  // Tuner label
  const freqLabel = createTextPlane("FR\u00C9QUENCE D'URGENCE", 1.0, 0.15, 14, '#ffcc44', 'rgba(0,0,0,0.8)');
  freqLabel.position.set(0, 0.55, 0.01);
  tunerGroup.add(freqLabel);

  // Create three digit displays
  const digitMeshes = [];
  const digitGroups = [];

  for (let i = 0; i < 3; i++) {
    const dg = new THREE.Group();
    const display = createDigitDisplay(0);
    display.position.set(0, 0, 0.015);
    dg.add(display);

    // Frame around each digit
    const frameMat = Materials.metal(0x556677);
    const fw = 0.34; const fh = 0.48; const ft = 0.025;
    [
      { w: fw, h: ft, y:  fh / 2 },
      { w: fw, h: ft, y: -fh / 2 },
    ].forEach(e => {
      place(dg, new THREE.BoxGeometry(e.w, e.h, 0.04), frameMat, 0, e.y, 0);
    });
    [
      { x:  fw / 2 },
      { x: -fw / 2 },
    ].forEach(e => {
      place(dg, new THREE.BoxGeometry(ft, fh, 0.04), frameMat, e.x, 0, 0);
    });

    dg.position.set(-0.4 + i * 0.4, 0.15, 0);
    tunerGroup.add(dg);
    digitMeshes.push(display);
    digitGroups.push(dg);
  }

  // "Hz" label
  const hzLabel = createTextPlane('Hz', 0.25, 0.12, 16, '#ffcc44', 'rgba(0,0,0,0)');
  hzLabel.position.set(0.72, 0.15, 0.01);
  tunerGroup.add(hzLabel);

  tunerGroup.position.set(0.7, 1.5, -0.19);
  consoleGroup.add(tunerGroup);

  consoleGroup.position.set(0, 0, -4.3);
  group.add(consoleGroup);

  // ── Beacon light (ceiling) ──────────────────────────────────────────
  const beaconGroup = new THREE.Group();
  const beaconBase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.2, 0.1, 16),
    Materials.metal(0x444444)
  );
  beaconBase.position.y = HEIGHT - 0.05;
  beaconGroup.add(beaconBase);

  const beaconLens = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 16, 16),
    new THREE.MeshStandardMaterial({
      color: 0x112211,
      emissive: 0x000000,
      emissiveIntensity: 0,
      roughness: 0.1,
      metalness: 0.4,
      transparent: true,
      opacity: 0.7
    })
  );
  beaconLens.position.y = HEIGHT - 0.15;
  beaconGroup.add(beaconLens);

  const beaconLight = new THREE.PointLight(0x33ff66, 0, 15);
  beaconLight.position.set(0, HEIGHT - 0.2, 0);
  beaconGroup.add(beaconLight);

  group.add(beaconGroup);

  // ── Filing cabinets (right wall, front area) ────────────────────────
  function createFilingCabinet() {
    const cab = new THREE.Group();
    const cabMat = Materials.metal(0x4a5060);
    // Body
    place(cab, new THREE.BoxGeometry(0.5, 1.3, 0.45), cabMat, 0, 0.65, 0);
    // Drawers (4)
    for (let d = 0; d < 4; d++) {
      const drawer = new THREE.Mesh(
        new THREE.BoxGeometry(0.44, 0.26, 0.02),
        new THREE.MeshStandardMaterial({ color: 0x555e6a, roughness: 0.4, metalness: 0.6 })
      );
      drawer.position.set(0, 0.18 + d * 0.3, 0.235);
      cab.add(drawer);
      // Handle
      const handle = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.025, 0.025),
        Materials.metalAccent(0x888888)
      );
      handle.position.set(0, 0.18 + d * 0.3, 0.26);
      cab.add(handle);
    }
    return cab;
  }

  for (let i = 0; i < 3; i++) {
    const cab = createFilingCabinet();
    cab.position.set(3.45, 0, 1.5 + i * 0.7);
    cab.rotation.y = -Math.PI / 2;
    group.add(cab);
  }

  // ── Old radio equipment (left side of console area) ─────────────────
  const radioGroup = new THREE.Group();
  // Radio box
  place(radioGroup, new THREE.BoxGeometry(0.6, 0.4, 0.35), consoleDarkMat, 0, 0.2, 0);
  // Tuning dial face
  const dialFace = new THREE.Mesh(
    new THREE.CircleGeometry(0.1, 24),
    new THREE.MeshStandardMaterial({ color: 0x111a11, roughness: 0.3, metalness: 0.2 })
  );
  dialFace.position.set(-0.12, 0.25, 0.18);
  radioGroup.add(dialFace);
  // Speaker grille
  for (let r = 0; r < 5; r++) {
    const grille = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.008, 0.01),
      Materials.metal(0x333333)
    );
    grille.position.set(0.12, 0.15 + r * 0.04, 0.18);
    radioGroup.add(grille);
  }
  radioGroup.position.set(-2.2, 1.1, -4.35);
  group.add(radioGroup);

  // ── Chair (near desk) ───────────────────────────────────────────────
  const chairGroup = new THREE.Group();
  const chairMat = new THREE.MeshStandardMaterial({ color: 0x2a1a0a, roughness: 0.9, metalness: 0.05 });
  // Seat
  place(chairGroup, new THREE.BoxGeometry(0.45, 0.05, 0.4), chairMat, 0, 0.45, 0);
  // Back
  place(chairGroup, new THREE.BoxGeometry(0.45, 0.5, 0.04), chairMat, 0, 0.72, -0.18);
  // Legs
  [[-0.18, -0.16], [-0.18, 0.16], [0.18, -0.16], [0.18, 0.16]].forEach(([x, z]) => {
    place(chairGroup, new THREE.BoxGeometry(0.035, 0.45, 0.035), chairMat, x, 0.225, z);
  });
  chairGroup.position.set(2.0, 0, 3.8);
  chairGroup.rotation.y = Math.PI + 0.2;
  group.add(chairGroup);

  // ── Misc props ──────────────────────────────────────────────────────
  // Globe on the right-wall shelf area
  const globeGroup = new THREE.Group();
  const globeStand = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.08, 0.02, 12),
    Materials.metal(0x665544)
  );
  globeStand.position.y = 0;
  globeGroup.add(globeStand);
  const globeArm = new THREE.Mesh(
    new THREE.CylinderGeometry(0.008, 0.008, 0.25, 8),
    Materials.metal(0x665544)
  );
  globeArm.position.y = 0.13;
  globeGroup.add(globeArm);
  const globeSphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0x2a5577, roughness: 0.6, metalness: 0.15 })
  );
  globeSphere.position.y = 0.26;
  globeGroup.add(globeSphere);
  globeGroup.position.set(3.0, 1.12, -0.5);
  group.add(globeGroup);

  // ── Fragment 1: Rosetta Stone (on desk) ─────────────────────────────
  const frag1 = createFragmentProp('FRAGMENT #1');
  frag1.group.position.set(1.65, 0.85, 3.1);
  frag1.group.rotation.x = -Math.PI / 2;
  frag1.group.rotation.z = 0.15;
  group.add(frag1.group);

  // Spotlight on the fragment
  addSpotlight(room.group, new THREE.Vector3(1.65, 2.5, 3.1), new THREE.Vector3(1.65, 0.85, 3.1), 0xffe8c0, 1.0, 0.4);

  // ── Fragment 2: On bookshelf (left wall, middle shelf) ──────────────
  const frag2 = createFragmentProp('FRAGMENT #2');
  frag2.group.position.set(-3.45, 1.8, -0.3);
  frag2.group.rotation.y = Math.PI / 2;
  frag2.group.rotation.x = -0.1;
  group.add(frag2.group);

  // ── Fragment 3: Near radio console ──────────────────────────────────
  const frag3 = createFragmentProp('FRAGMENT #3');
  frag3.group.position.set(-1.5, 1.15, -4.25);
  frag3.group.rotation.z = -0.1;
  group.add(frag3.group);

  addSpotlight(room.group, new THREE.Vector3(-1.5, 2.5, -4.0), new THREE.Vector3(-1.5, 1.15, -4.25), 0xaaccff, 0.8, 0.35);

  // ── Room-title sign ─────────────────────────────────────────────────
  const archiveSign = createTextPlane('LES ARCHIVES', 1.8, 0.35, 22, '#ffcc66', 'rgba(20,15,8,0.9)');
  archiveSign.position.set(0, 3.4, 4.95);
  archiveSign.rotation.y = Math.PI;
  group.add(archiveSign);

  // ── Console label ───────────────────────────────────────────────────
  const consoleLabel = createTextPlane('CONSOLE DE COMMUNICATION', 2.0, 0.2, 13, '#88aacc', 'rgba(10,15,25,0.85)');
  consoleLabel.position.set(0, 2.65, -4.37);
  group.add(consoleLabel);

  // ── Door (back to hub) ─────────────────────────────────────────────
  const backDoor = createDoor(1.2, 2.2, 0x2d4a6f);
  backDoor.group.position.set(0, 0, DEPTH / 2);
  backDoor.group.rotation.y = Math.PI;
  group.add(backDoor.group);

  // Register back door as interactive
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

  // ── Interactives ────────────────────────────────────────────────────

  // Cipher text constants
  const plaintext1 = 'The beacon frequency was set by Dr. Laurent before the evacuation.';
  const encoded1 = caesarEncode(plaintext1.toUpperCase());

  const plaintext2 = 'The first two digits match the year Lafayette arrived in America: seventeen-seven-seven. Use four and seven.';
  const encoded2 = caesarEncode(plaintext2.toUpperCase());

  const plaintext3_en = 'The last digit is two.';
  const encoded3_en = caesarEncode(plaintext3_en.toUpperCase());
  const plaintext3_freq = 'Set frequency to complete the triangle: quatre-sept-deux.';
  const encoded3_freq = caesarEncode(plaintext3_freq.toUpperCase());

  // Fragment 1 interaction (Rosetta Stone)
  engine.registerInteractive(frag1.group, {
    type: 'click',
    prompt: 'Read Fragment #1',
    icon: '\uD83D\uDCC4',
    onInteract: () => {
      state.fragmentsFound[0] = true;
      engine.playEffect('click');
      engine.showNarrative('Fragment #1 \u2014 La Pierre de Rosette', `
        <p style="color:#aaa;font-style:italic;margin-bottom:12px;">
          A worn journal page with two columns of text. Someone has carefully written the same passage twice &mdash;
          once in plain English, once in a strange code. A note in the margin reads:
          <span class="emphasis">"The cipher of Caesar &mdash; each letter shifts forward."</span>
        </p>
        <div style="display:flex;gap:20px;flex-wrap:wrap;margin-bottom:16px;">
          <div style="flex:1;min-width:220px;">
            <p style="color:#ffcc44;font-weight:bold;margin-bottom:6px;">DECODED:</p>
            <p style="font-family:Courier New,monospace;color:#33ffaa;line-height:1.6;">${plaintext1}</p>
          </div>
          <div style="flex:1;min-width:220px;">
            <p style="color:#ffcc44;font-weight:bold;margin-bottom:6px;">ENCODED:</p>
            <p style="font-family:Courier New,monospace;color:#ff8866;line-height:1.6;">${encoded1}</p>
          </div>
        </div>
        <p style="color:#aaa;font-size:0.9em;">
          Study the pattern. Compare each letter in the decoded text to its encoded partner.
          How far does each letter shift? <span class="emphasis">A &rarr; D, B &rarr; E, C &rarr; F&hellip;</span>
          This is a <span class="emphasis">Caesar cipher</span> &mdash; named after Julius Caesar, who used it
          to protect military messages over 2,000 years ago.
        </p>
      `);
      checkAllFragments();
    }
  });

  // Fragment 2 interaction (Lafayette clue)
  engine.registerInteractive(frag2.group, {
    type: 'click',
    prompt: 'Read Fragment #2',
    icon: '\uD83D\uDCC4',
    onInteract: () => {
      state.fragmentsFound[1] = true;
      engine.playEffect('click');
      engine.showNarrative('Fragment #2 \u2014 Archives Historiques', `
        <p style="color:#aaa;font-style:italic;margin-bottom:12px;">
          A brittle page from the station's historical archives. The text is entirely in cipher.
          You'll need the key from Fragment #1 to read it.
        </p>
        <div style="background:rgba(10,15,25,0.6);padding:14px;border-radius:6px;margin-bottom:16px;border-left:3px solid #ff8866;">
          <p style="font-family:Courier New,monospace;color:#ff8866;line-height:1.8;word-break:break-word;">
            ${encoded2}
          </p>
        </div>
        <p style="color:#888;font-size:0.85em;margin-bottom:8px;">
          <span class="emphasis">Hint:</span> Remember the pattern from Fragment #1. Each encoded letter
          is shifted <span class="emphasis">forward by 3</span> in the alphabet. To decode, shift each letter
          <em>back</em> by 3. (D &rarr; A, E &rarr; B, F &rarr; C&hellip;)
        </p>
        <p style="color:#aaa;font-size:0.9em;">
          This fragment tells of the <span class="french">alliance</span> between France and America.
          The Marquis de Lafayette sailed from France to help the American Revolution.
          What year did he arrive? The answer holds part of the frequency.
        </p>
      `);
      checkAllFragments();
    }
  });

  // Fragment 3 interaction (French + cipher)
  engine.registerInteractive(frag3.group, {
    type: 'click',
    prompt: 'Lire le Fragment #3',
    icon: '\uD83D\uDCC4',
    onInteract: () => {
      state.fragmentsFound[2] = true;
      engine.playEffect('click');
      engine.showNarrative('Fragment #3 \u2014 Note de Fr\u00E9quence', `
        <p style="color:#aaa;font-style:italic;margin-bottom:12px;">
          A note pinned near the radio, written in a mix of French and cipher.
          Dr. Laurent must have left this for someone who spoke both languages.
        </p>
        <div style="background:rgba(10,15,25,0.6);padding:14px;border-radius:6px;margin-bottom:14px;border-left:3px solid #4488ff;">
          <p style="font-family:Courier New,monospace;color:#4488ff;line-height:1.8;margin-bottom:10px;">
            <span class="french" style="color:#ffcc44;">Le dernier chiffre est deux.</span>
          </p>
          <p style="font-family:Courier New,monospace;color:#ff8866;line-height:1.8;margin-bottom:10px;">
            ${encoded3_en}
          </p>
          <p style="font-family:Courier New,monospace;color:#ff8866;line-height:1.8;">
            ${encoded3_freq}
          </p>
        </div>
        <div style="margin-bottom:14px;">
          <p style="color:#ffcc44;margin-bottom:6px;"><span class="french">Vocabulaire fran\u00E7ais &mdash; Les nombres:</span></p>
          <p style="color:#aaa;font-size:0.9em;line-height:1.7;">
            <span class="french">un</span> = 1 &nbsp;\u2022&nbsp;
            <span class="french">deux</span> = 2 &nbsp;\u2022&nbsp;
            <span class="french">trois</span> = 3 &nbsp;\u2022&nbsp;
            <span class="french">quatre</span> = 4 &nbsp;\u2022&nbsp;
            <span class="french">cinq</span> = 5<br>
            <span class="french">six</span> = 6 &nbsp;\u2022&nbsp;
            <span class="french">sept</span> = 7 &nbsp;\u2022&nbsp;
            <span class="french">huit</span> = 8 &nbsp;\u2022&nbsp;
            <span class="french">neuf</span> = 9 &nbsp;\u2022&nbsp;
            <span class="french">z\u00E9ro</span> = 0
          </p>
        </div>
        <p style="color:#aaa;font-size:0.9em;">
          The first line is already in plain French: <span class="emphasis">"The last digit is two."</span>
          Decode the cipher lines to find the full frequency.
          <span class="french">Quatre-sept-deux</span> &mdash; can you read the numbers?
        </p>
      `);
      checkAllFragments();
    }
  });

  function checkAllFragments() {
    const found = state.fragmentsFound.filter(Boolean).length;
    if (found === 3 && !state.solved) {
      setTimeout(() => {
        engine.showObjective("Tune the emergency beacon to the correct fr\u00E9quence d'urgence.");
      }, 500);
    } else if (found >= 1 && found < 3 && !state.solved) {
      engine.showObjective(`Fragments found: ${found}/3 \u2014 Search Les Archives for more.`);
    }
  }

  // ── Digit dial interactions ─────────────────────────────────────────
  // Each digit display has an upper half (increment) and lower half (decrement).
  // We register the whole display mesh; on click we figure out which half via raycaster UV.
  // Simpler approach: register two invisible hit zones per digit.

  digitMeshes.forEach((display, idx) => {
    // Create upper and lower hit zones
    const upperZone = new THREE.Mesh(
      new THREE.PlaneGeometry(0.28, 0.21),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    upperZone.position.set(0, 0.105, 0.02);
    digitGroups[idx].add(upperZone);

    const lowerZone = new THREE.Mesh(
      new THREE.PlaneGeometry(0.28, 0.21),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    lowerZone.position.set(0, -0.105, 0.02);
    digitGroups[idx].add(lowerZone);

    engine.registerInteractive(upperZone, {
      type: 'click',
      prompt: `Dial ${idx + 1} \u25B2`,
      icon: '\uD83D\uDD3A',
      onInteract: () => {
        if (state.solved) return;
        state.digits[idx] = (state.digits[idx] + 1) % 10;
        updateDigitDisplay(idx);
        engine.playEffect('click');
        checkFrequency();
      }
    });

    engine.registerInteractive(lowerZone, {
      type: 'click',
      prompt: `Dial ${idx + 1} \u25BC`,
      icon: '\uD83D\uDD3B',
      onInteract: () => {
        if (state.solved) return;
        state.digits[idx] = (state.digits[idx] + 9) % 10; // -1 mod 10
        updateDigitDisplay(idx);
        engine.playEffect('click');
        checkFrequency();
      }
    });
  });

  function updateDigitDisplay(idx) {
    const mesh = digitMeshes[idx];
    mesh.userData._digitDraw(state.digits[idx]);
    mesh.userData._digitTexture.needsUpdate = true;

    // Brief scale animation
    mesh.scale.set(1.1, 1.1, 1);
    setTimeout(() => { mesh.scale.set(1, 1, 1); }, 120);
  }

  function checkFrequency() {
    if (state.digits[0] === TARGET[0] &&
        state.digits[1] === TARGET[1] &&
        state.digits[2] === TARGET[2]) {
      solvePuzzle();
    }
  }

  // ── Success sequence ────────────────────────────────────────────────
  // Store references for the success screen update
  let screenLabelRef = screenLabel;

  function createSuccessScreen() {
    const newLabel = createTextPlane('BEACON STATUS\nONLINE', 0.7, 0.5, 18, '#33ff66', 'rgba(5,30,10,0.95)');
    newLabel.position.copy(screenLabel.position);
    consoleGroup.remove(screenLabel);
    consoleGroup.add(newLabel);
    screenLabelRef = newLabel;

    // Update the screen backing color
    screenMesh.material = Materials.screen(0x0a3a1a);
  }

  // Success green lights along console
  const successLights = [];

  function solvePuzzle() {
    if (state.solved) return;
    state.solved = true;
    state.beaconActive = true;

    engine.playEffect('success');
    setTimeout(() => engine.playEffect('powerup'), 400);

    // Activate beacon
    beaconLens.material.color.set(0x33ff66);
    beaconLens.material.emissive.set(0x33ff66);
    beaconLens.material.emissiveIntensity = 3.0;
    beaconLight.intensity = 4.0;
    beaconLight.color.set(0x33ff66);

    // Update screen
    createSuccessScreen();

    // Change console indicator lights to green
    consoleGroup.children.forEach(child => {
      if (child.isMesh && child.geometry.type === 'SphereGeometry' &&
          child.geometry.parameters && child.geometry.parameters.radius < 0.02) {
        child.material = Materials.emissive(0x33ff66, 2.5);
      }
    });

    // Add green accent lights around the room
    const greenPositions = [
      new THREE.Vector3(-3, 2.5, 0),
      new THREE.Vector3( 3, 2.5, 0),
      new THREE.Vector3( 0, 3.0, 3),
      new THREE.Vector3(-2, 2.5, -3),
      new THREE.Vector3( 2, 2.5, -3)
    ];
    greenPositions.forEach(pos => {
      const gl = addPointLight(room.group, pos, 0x33ff66, 1.2, 8);
      successLights.push(gl);
    });

    // Change digit display borders to green
    digitGroups.forEach(dg => {
      dg.children.forEach(child => {
        if (child.isMesh && child.material && child.material.metalness === 0.8 &&
            child.geometry.type === 'BoxGeometry') {
          child.material = Materials.metal(0x33aa66);
        }
      });
    });

    // Door status light to green
    backDoor.lightMat.color.set(0x33ff66);
    backDoor.lightMat.emissive.set(0x33ff66);

    engine.hideObjective();
    engine.showCompletion('Beacon Activated \u2014 Fr\u00E9quence 472 Hz');
    engine.showRoomTitle('MISSION ACCOMPLIE', 'Emergency beacon online');

    // Update game state
    if (gameState) {
      gameState.decodeComplete = true;
    }
  }

  // ── Lifecycle ───────────────────────────────────────────────────────
  let dustSystem = null;

  function enter() {
    engine.camera.position.set(0, 1.6, 3.5);
    engine.setRoomBounds(-WIDTH / 2 + 0.3, WIDTH / 2 - 0.3, -DEPTH / 2 + 0.3, DEPTH / 2 - 0.3);

    engine.showRoomTitle('Les Archives', 'Station Lumi\u00E8re \u2014 Communications Center');

    // Ambient sound: low hum with radio static
    engine.playAmbient(55, 'sine', 0.06);
    engine.playAmbient(110, 'triangle', 0.02);

    // Dust particles
    dustSystem = engine.addDust({
      minX: -WIDTH / 2,
      maxX: WIDTH / 2,
      minZ: -DEPTH / 2,
      maxZ: DEPTH / 2,
      height: HEIGHT
    });

    // Initial objective
    if (!state.solved) {
      const found = state.fragmentsFound.filter(Boolean).length;
      if (found < 3) {
        engine.showObjective('Search Les Archives for journal fragments.');
      } else {
        engine.showObjective("Tune the emergency beacon to the correct fr\u00E9quence d'urgence.");
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

    // Pulse fragment glow for unfound fragments
    const pulse = 0.8 + Math.sin(state.time * 3.0) * 0.5;
    if (!state.fragmentsFound[0]) {
      frag1.glowMat.emissiveIntensity = pulse * 2.0;
    }
    if (!state.fragmentsFound[1]) {
      frag2.glowMat.emissiveIntensity = pulse * 1.8;
    }
    if (!state.fragmentsFound[2]) {
      frag3.glowMat.emissiveIntensity = pulse * 1.6;
    }

    // Dim found fragments
    if (state.fragmentsFound[0]) frag1.glowMat.emissiveIntensity = 0.4;
    if (state.fragmentsFound[1]) frag2.glowMat.emissiveIntensity = 0.4;
    if (state.fragmentsFound[2]) frag3.glowMat.emissiveIntensity = 0.4;

    // Beacon rotation when active
    if (state.beaconActive) {
      beaconLens.rotation.y += delta * 2.5;
      // Pulsing beacon intensity
      const bp = 1.5 + Math.sin(state.time * 4.0) * 1.0;
      beaconLight.intensity = bp * 2.5;
      beaconLens.material.emissiveIntensity = bp * 2.0;

      // Sweep the green success lights gently
      successLights.forEach((light, i) => {
        light.intensity = 0.6 + Math.sin(state.time * 2.0 + i * 1.2) * 0.5;
      });
    }
  }

  // ── Return room interface ───────────────────────────────────────────
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
