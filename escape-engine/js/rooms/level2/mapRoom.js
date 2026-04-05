import * as THREE from 'three';
import {
  Engine, Materials, createRoom, createDoor, createTextPlane,
  addSpotlight, addPointLight
} from '../../engine.js';

// ─── Room: La Carte (The Map) ─────────────────────────────────────────
// Cartography and navigation room in the underwater lab. An ancient map
// has been fragmented into six pieces. Players find and click each
// fragment to reassemble the map on a central light table. Once complete
// they read the compass bearing (Nord-Ouest / NW) and distance (15
// milles nautiques) to pinpoint the deep ruins.
//
// Educational integration:
//   French      — cardinal directions, map labels, journal entries
//   Geography   — map reading, compass bearings, nautical miles
//   Vocabulary  — navigate, expedition, coordinate, territory,
//                 discover, significant, perspective

const ROOM_W = 10;
const ROOM_H = 4;
const ROOM_D = 10;

// Compass directions — 8 positions, index 7 = NW (correct answer)
const DIRECTIONS = [
  { label: 'Nord',       short: 'N',  angle: 0 },
  { label: 'Nord-Est',   short: 'NE', angle: Math.PI * 0.25 },
  { label: 'Est',        short: 'E',  angle: Math.PI * 0.5 },
  { label: 'Sud-Est',    short: 'SE', angle: Math.PI * 0.75 },
  { label: 'Sud',        short: 'S',  angle: Math.PI },
  { label: 'Sud-Ouest',  short: 'SW', angle: Math.PI * 1.25 },
  { label: 'Ouest',      short: 'W',  angle: Math.PI * 1.5 },
  { label: 'Nord-Ouest', short: 'NW', angle: Math.PI * 1.75 }
];
const CORRECT_DIR_INDEX = 7;  // Nord-Ouest

// Distance dial values — correct answer is 15
const DISTANCE_VALUES = [5, 10, 15, 20, 25];
const CORRECT_DISTANCE = 15;

// ── Canvas helpers ──────────────────────────────────────────────────────

/** Draw a map fragment onto a canvas and return the texture + mesh. */
function createMapFragmentCanvas(index, w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  // Parchment background
  ctx.fillStyle = '#c8b88a';
  ctx.fillRect(0, 0, w, h);

  // Slight noise / aging
  for (let i = 0; i < 300; i++) {
    ctx.fillStyle = `rgba(${80 + Math.random() * 40},${70 + Math.random() * 30},${40 + Math.random() * 20},${0.05 + Math.random() * 0.08})`;
    const rx = Math.random() * w;
    const ry = Math.random() * h;
    ctx.fillRect(rx, ry, 2 + Math.random() * 4, 2 + Math.random() * 4);
  }

  // Water areas
  ctx.fillStyle = 'rgba(40, 100, 140, 0.25)';
  ctx.fillRect(0, 0, w, h);

  // Fragment-specific content
  const fragContent = [
    // 0 — top-left: compass rose partial
    (ctx) => {
      ctx.strokeStyle = '#3a2a10';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(w * 0.6, h * 0.8);
      ctx.lineTo(w * 0.8, h * 0.4);
      ctx.lineTo(w * 0.95, h * 0.9);
      ctx.stroke();
      ctx.fillStyle = '#3a2a10';
      ctx.font = `bold ${Math.floor(h * 0.12)}px serif`;
      ctx.fillText('N', w * 0.75, h * 0.35);
      // Coastline
      ctx.beginPath();
      ctx.strokeStyle = '#5a3a10';
      ctx.lineWidth = 3;
      ctx.moveTo(0, h * 0.3);
      ctx.quadraticCurveTo(w * 0.3, h * 0.5, w * 0.1, h * 0.9);
      ctx.stroke();
    },
    // 1 — top-center: title region
    (ctx) => {
      ctx.fillStyle = '#3a2a10';
      ctx.font = `bold ${Math.floor(h * 0.13)}px serif`;
      ctx.textAlign = 'center';
      ctx.fillText('CARTE DE', w / 2, h * 0.3);
      ctx.font = `${Math.floor(h * 0.1)}px serif`;
      ctx.fillText("L'EXPEDITION", w / 2, h * 0.5);
      // Shipping route
      ctx.setLineDash([4, 6]);
      ctx.strokeStyle = '#8a3a20';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, h * 0.75);
      ctx.lineTo(w, h * 0.65);
      ctx.stroke();
      ctx.setLineDash([]);
    },
    // 2 — top-right: island chains
    (ctx) => {
      ctx.fillStyle = '#7a9a60';
      // Islands
      [[w * 0.3, h * 0.4, 14], [w * 0.5, h * 0.6, 10], [w * 0.7, h * 0.3, 18]].forEach(([x, y, r]) => {
        ctx.beginPath();
        ctx.ellipse(x, y, r, r * 0.7, 0.3, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.fillStyle = '#3a2a10';
      ctx.font = `${Math.floor(h * 0.09)}px serif`;
      ctx.fillText('Iles du Nord', w * 0.2, h * 0.2);
    },
    // 3 — bottom-left: legend / scale
    (ctx) => {
      ctx.fillStyle = '#3a2a10';
      ctx.font = `bold ${Math.floor(h * 0.11)}px serif`;
      ctx.fillText('Legende', w * 0.05, h * 0.2);
      ctx.font = `${Math.floor(h * 0.09)}px serif`;
      ctx.fillText('--- Route', w * 0.05, h * 0.4);
      ctx.fillText('X  Station', w * 0.05, h * 0.55);
      // Distance scale bar
      ctx.strokeStyle = '#3a2a10';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(w * 0.05, h * 0.75);
      ctx.lineTo(w * 0.85, h * 0.75);
      ctx.stroke();
      ctx.fillText('15 Milles nautiques', w * 0.05, h * 0.9);
    },
    // 4 — bottom-center: X marks the station + direction text
    (ctx) => {
      // X mark
      ctx.strokeStyle = '#cc3333';
      ctx.lineWidth = 4;
      const cx = w * 0.5, cy = h * 0.4;
      ctx.beginPath(); ctx.moveTo(cx - 15, cy - 15); ctx.lineTo(cx + 15, cy + 15); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + 15, cy - 15); ctx.lineTo(cx - 15, cy + 15); ctx.stroke();
      ctx.fillStyle = '#3a2a10';
      ctx.font = `${Math.floor(h * 0.09)}px serif`;
      ctx.textAlign = 'center';
      ctx.fillText('Station Lumiere', w * 0.5, h * 0.65);
      // Direction arrow pointing NW
      ctx.strokeStyle = '#225588';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx - 40, cy - 40);
      ctx.stroke();
      // Arrow head
      ctx.beginPath();
      ctx.moveTo(cx - 40, cy - 40);
      ctx.lineTo(cx - 30, cy - 35);
      ctx.moveTo(cx - 40, cy - 40);
      ctx.lineTo(cx - 35, cy - 30);
      ctx.stroke();
      ctx.fillStyle = '#225588';
      ctx.font = `bold ${Math.floor(h * 0.1)}px serif`;
      ctx.fillText('Cap: Nord-Ouest', w * 0.5, h * 0.85);
    },
    // 5 — bottom-right: coordinates & bearing
    (ctx) => {
      ctx.fillStyle = '#3a2a10';
      ctx.font = `${Math.floor(h * 0.1)}px serif`;
      ctx.fillText('Nord 47\u00B0', w * 0.1, h * 0.3);
      ctx.fillText('Ouest 23\u00B0', w * 0.1, h * 0.5);
      ctx.font = `bold ${Math.floor(h * 0.1)}px serif`;
      ctx.fillText('Distance: 15', w * 0.1, h * 0.7);
      ctx.font = `${Math.floor(h * 0.09)}px serif`;
      ctx.fillText('milles nautiques', w * 0.1, h * 0.85);
    }
  ];

  if (fragContent[index]) {
    fragContent[index](ctx);
  }

  // Torn edge effect on borders
  ctx.strokeStyle = 'rgba(90, 70, 40, 0.5)';
  ctx.lineWidth = 1;
  for (let edge = 0; edge < 4; edge++) {
    ctx.beginPath();
    for (let t = 0; t <= 20; t++) {
      const jitter = Math.random() * 4 - 2;
      switch (edge) {
        case 0: ctx.lineTo(t * (w / 20), jitter); break;
        case 1: ctx.lineTo(t * (w / 20), h + jitter); break;
        case 2: ctx.lineTo(jitter, t * (h / 20)); break;
        case 3: ctx.lineTo(w + jitter, t * (h / 20)); break;
      }
    }
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Create a compass rose canvas texture for the map table. */
function createCompassRoseCanvas(size, needleAngle, highlightDir) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.42;

  // Background
  ctx.fillStyle = '#1a2a3a';
  ctx.fillRect(0, 0, size, size);

  // Outer circle
  ctx.strokeStyle = '#4ecdc4';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  // Inner circle
  ctx.strokeStyle = '#2a5a6a';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.7, 0, Math.PI * 2);
  ctx.stroke();

  // Direction labels
  DIRECTIONS.forEach((dir, i) => {
    const a = -Math.PI / 2 + dir.angle; // 0 = North = top
    const lx = cx + Math.cos(a) * r * 0.88;
    const ly = cy + Math.sin(a) * r * 0.88;

    const isHighlighted = i === highlightDir;
    ctx.fillStyle = isHighlighted ? '#ffcc44' : '#4ecdc4';
    ctx.font = `bold ${isHighlighted ? 18 : 14}px Courier New`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(dir.short, lx, ly);

    // Tick mark
    const tx1 = cx + Math.cos(a) * r * 0.72;
    const ty1 = cy + Math.sin(a) * r * 0.72;
    const tx2 = cx + Math.cos(a) * r * 0.78;
    const ty2 = cy + Math.sin(a) * r * 0.78;
    ctx.strokeStyle = isHighlighted ? '#ffcc44' : '#3a8a9a';
    ctx.lineWidth = isHighlighted ? 3 : 2;
    ctx.beginPath();
    ctx.moveTo(tx1, ty1);
    ctx.lineTo(tx2, ty2);
    ctx.stroke();
  });

  // Compass needle
  const na = -Math.PI / 2 + needleAngle;
  const nLen = r * 0.6;
  ctx.strokeStyle = '#e63946';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(na) * nLen, cy + Math.sin(na) * nLen);
  ctx.stroke();

  // Needle tail (opposite direction, shorter)
  ctx.strokeStyle = '#667788';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx - Math.cos(na) * nLen * 0.3, cy - Math.sin(na) * nLen * 0.3);
  ctx.stroke();

  // Center dot
  ctx.fillStyle = '#aabbcc';
  ctx.beginPath();
  ctx.arc(cx, cy, 5, 0, Math.PI * 2);
  ctx.fill();

  // Arrow head on needle
  const tipX = cx + Math.cos(na) * nLen;
  const tipY = cy + Math.sin(na) * nLen;
  const headLen = 12;
  ctx.fillStyle = '#e63946';
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(
    tipX - Math.cos(na - 0.3) * headLen,
    tipY - Math.sin(na - 0.3) * headLen
  );
  ctx.lineTo(
    tipX - Math.cos(na + 0.3) * headLen,
    tipY - Math.sin(na + 0.3) * headLen
  );
  ctx.closePath();
  ctx.fill();

  return canvas;
}

/** Create a distance dial canvas. */
function createDistanceDialCanvas(size, value, isCorrect) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size * 0.4;
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#0a1a2a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Border
  ctx.strokeStyle = isCorrect ? '#2a9d8f' : '#4ecdc4';
  ctx.lineWidth = 3;
  ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);

  // Value
  ctx.fillStyle = isCorrect ? '#2a9d8f' : '#33ffaa';
  ctx.font = `bold ${Math.floor(canvas.height * 0.45)}px Courier New`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${value}`, canvas.width / 2, canvas.height * 0.4);

  // Unit
  ctx.fillStyle = '#6688aa';
  ctx.font = `${Math.floor(canvas.height * 0.2)}px Courier New`;
  ctx.fillText('milles nautiques', canvas.width / 2, canvas.height * 0.75);

  // Arrows
  ctx.fillStyle = 'rgba(78,205,196,0.4)';
  ctx.font = `${Math.floor(canvas.height * 0.25)}px sans-serif`;
  ctx.fillText('\u25C0  \u25B6', canvas.width / 2, canvas.height * 0.92);

  return canvas;
}

// ── Explorer's journal HTML ────────────────────────────────────────────
const JOURNAL_HTML = `
<p style="color:#c8a96e;font-family:'Courier New',monospace;font-size:0.85em;margin-bottom:0.6em;">
  JOURNAL DE L'EXPEDITION<br>
  Dr. Camille Moreau &mdash; Cartographe en chef<br>
  Station Lumi&egrave;re, Atlantique Nord
</p>

<p>The map was torn apart during the power surge. I managed to
<span style="color:#4ecdc4;">navigate</span> my way to the
<span style="color:#ffcc44;font-style:italic;">salle de cartographie</span>
before the emergency doors sealed.</p>

<p>Six fragments &mdash; <span style="color:#ffcc44;font-style:italic;">six morceaux</span>
&mdash; are scattered around this room. I hid them in obvious places:
on the walls, on shelves, on my desk. Find them all and the map table
will show our route.</p>

<p>Once the <span style="color:#4ecdc4;">carte</span> is restored,
you must set the correct heading on the compass rose. The
<span style="color:#4ecdc4;">expedition</span> traveled
<strong style="color:#ffcc44;">Nord-Ouest</strong>
(<span style="color:#4ecdc4;">Northwest</span>) from the station to
reach the ruins.</p>

<p>The distance? Look at the <span style="color:#4ecdc4;">legende</span>
on the map. The scale bar shows exactly how far we sailed:
<strong style="color:#ffcc44;">quinze milles nautiques</strong>
&mdash; <span style="color:#4ecdc4;">fifteen nautical miles</span>.</p>

<p style="color:#889;font-style:italic;margin-top:1em;">
  <span style="color:#ffcc44;">Vocabulaire:</span><br>
  <span style="color:#4ecdc4;">navigate</span> &mdash; trouver le chemin (find the way)<br>
  <span style="color:#4ecdc4;">expedition</span> &mdash; le voyage de recherche<br>
  <span style="color:#4ecdc4;">coordinate</span> &mdash; position sur la carte<br>
  <span style="color:#4ecdc4;">territory</span> &mdash; r&eacute;gion sur la carte<br>
  <span style="color:#4ecdc4;">discover</span> &mdash; ce que l'exp&eacute;dition a trouv&eacute;<br>
  <span style="color:#4ecdc4;">significant</span> &mdash; le lieu marqu&eacute; important<br>
  <span style="color:#4ecdc4;">perspective</span> &mdash; vue a&eacute;rienne de la carte
</p>

<p style="color:#667;font-size:0.8em;margin-top:1em;">
  &mdash; Dr. C. Moreau, Cartographe<br>
  Carte de l'exp&eacute;dition franco-am&eacute;ricaine
</p>
`;

// ── Main builder ────────────────────────────────────────────────────────

export function buildMapRoom(engine, gameState) {
  const group = new THREE.Group();

  // ── State ─────────────────────────────────────────────────────────────
  const state = {
    fragmentsPlaced: [false, false, false, false, false, false],
    mapComplete: false,
    compassIndex: 0,       // current compass direction (0=N)
    distanceIndex: 0,      // index into DISTANCE_VALUES (0=5)
    solved: false,
    time: 0
  };

  // ── Room shell ────────────────────────────────────────────────────────
  const room = createRoom(
    ROOM_W, ROOM_H, ROOM_D,
    Materials.wall(0x0e2a3e),
    Materials.floor(0x0a1a28),
    Materials.ceiling(0x0c2030)
  );
  group.add(room.group);

  // ── Lighting ──────────────────────────────────────────────────────────
  // Brighter ambient for readability
  const ambientLight = new THREE.AmbientLight(0x1a3a5a, 0.5);
  room.group.add(ambientLight);

  // Warm overhead spots
  addSpotlight(room.group, new THREE.Vector3(0, ROOM_H - 0.1, 0), new THREE.Vector3(0, 0.8, 0), 0xdde8f4, 4, 0.7);
  addSpotlight(room.group, new THREE.Vector3(-3, ROOM_H - 0.1, -3), new THREE.Vector3(-3, 0.8, -3), 0xc8ddf0, 2, 0.5);
  addSpotlight(room.group, new THREE.Vector3(3, ROOM_H - 0.1, 3), new THREE.Vector3(3, 0.8, 3), 0xc8ddf0, 2, 0.5);

  // Blue-green accent lights (underwater feel)
  addPointLight(room.group, new THREE.Vector3(-4.5, 2.5, 0), 0x2a8a7a, 1.2, 6);
  addPointLight(room.group, new THREE.Vector3(4.5, 2.5, 0), 0x2a8a7a, 1.2, 6);
  addPointLight(room.group, new THREE.Vector3(0, 3.0, -4.5), 0x3a9a8a, 0.8, 5);
  addPointLight(room.group, new THREE.Vector3(0, 3.0, 4.5), 0x3a9a8a, 0.8, 5);

  // ── Floor grid (subtle) ───────────────────────────────────────────────
  const gridGroup = new THREE.Group();
  const gridMat = new THREE.LineBasicMaterial({ color: 0x1a3040, transparent: true, opacity: 0.4 });
  for (let x = -ROOM_W / 2; x <= ROOM_W / 2; x += 1) {
    const pts = [new THREE.Vector3(x, 0.005, -ROOM_D / 2), new THREE.Vector3(x, 0.005, ROOM_D / 2)];
    gridGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gridMat));
  }
  for (let z = -ROOM_D / 2; z <= ROOM_D / 2; z += 1) {
    const pts = [new THREE.Vector3(-ROOM_W / 2, 0.005, z), new THREE.Vector3(ROOM_W / 2, 0.005, z)];
    gridGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gridMat));
  }
  group.add(gridGroup);

  // ── Porthole windows ──────────────────────────────────────────────────
  const portholeGlowMats = [];

  function createPorthole(x, z, rotY) {
    const pGroup = new THREE.Group();

    // Ring (frame)
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.35, 0.04, 12, 24),
      Materials.metal(0x556677)
    );
    pGroup.add(ring);

    // Glass
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x0a2040,
      emissive: 0x0a2a4a,
      emissiveIntensity: 0.8,
      roughness: 0.05,
      metalness: 0.1,
      transparent: true,
      opacity: 0.6
    });
    const glass = new THREE.Mesh(new THREE.CircleGeometry(0.32, 24), glassMat);
    glass.position.z = 0.01;
    pGroup.add(glass);
    portholeGlowMats.push(glassMat);

    // Bioluminescent specks inside
    const speckMat = Materials.emissive(0x44ffcc, 1.5);
    for (let i = 0; i < 5; i++) {
      const speck = new THREE.Mesh(
        new THREE.SphereGeometry(0.01 + Math.random() * 0.01, 6, 6),
        speckMat
      );
      speck.position.set(
        (Math.random() - 0.5) * 0.4,
        (Math.random() - 0.5) * 0.4,
        -0.02
      );
      pGroup.add(speck);
    }

    pGroup.position.set(x, 2.2, z);
    pGroup.rotation.y = rotY;
    return pGroup;
  }

  // Left wall portholes
  group.add(createPorthole(-ROOM_W / 2 + 0.04, -2, Math.PI / 2));
  group.add(createPorthole(-ROOM_W / 2 + 0.04, 2, Math.PI / 2));
  // Right wall portholes
  group.add(createPorthole(ROOM_W / 2 - 0.04, -2, -Math.PI / 2));
  group.add(createPorthole(ROOM_W / 2 - 0.04, 2, -Math.PI / 2));

  // ── Map table (center of room) ────────────────────────────────────────
  const tableGroup = new THREE.Group();
  tableGroup.position.set(0, 0, -0.5);

  // Table legs
  const legMat = Materials.metal(0x3a4a5a);
  const legPositions = [[-1.1, -0.7], [-1.1, 0.7], [1.1, -0.7], [1.1, 0.7]];
  for (const [lx, lz] of legPositions) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.8, 8), legMat);
    leg.position.set(lx, 0.4, lz);
    leg.castShadow = true;
    tableGroup.add(leg);
  }

  // Table top
  const tableTopMat = Materials.metal(0x2a3a4a);
  const tableTop = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.06, 1.8), tableTopMat);
  tableTop.position.set(0, 0.82, 0);
  tableTop.receiveShadow = true;
  tableTop.castShadow = true;
  tableGroup.add(tableTop);

  // Light-table surface (emissive)
  const lightTableMat = new THREE.MeshStandardMaterial({
    color: 0x1a3a4a,
    emissive: 0x2a6a7a,
    emissiveIntensity: 0.6,
    roughness: 0.1,
    metalness: 0.2
  });
  const lightSurface = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.6), lightTableMat);
  lightSurface.position.set(0, 0.86, 0);
  lightSurface.rotation.x = -Math.PI / 2;
  tableGroup.add(lightSurface);

  // Raised rim around table
  const rimMat = Materials.metal(0x4a5a6a);
  const rimThick = 0.04;
  // Front/back rims
  for (const zOff of [-0.82, 0.82]) {
    const rim = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.08, rimThick), rimMat);
    rim.position.set(0, 0.87, zOff);
    tableGroup.add(rim);
  }
  // Side rims
  for (const xOff of [-1.32, 1.32]) {
    const rim = new THREE.Mesh(new THREE.BoxGeometry(rimThick, 0.08, 1.68), rimMat);
    rim.position.set(xOff, 0.87, 0);
    tableGroup.add(rim);
  }

  // Under-table glow
  addPointLight(tableGroup, new THREE.Vector3(0, 0.5, 0), 0x2a8a9a, 0.6, 3);

  group.add(tableGroup);

  // ── Map fragment slots on the table ───────────────────────────────────
  // 2 rows x 3 columns on the table surface
  const FRAG_W = 0.7;
  const FRAG_D = 0.65;
  const slotPositions = [
    { x: -0.75, z: -0.35 },  // 0: top-left
    { x:  0.00, z: -0.35 },  // 1: top-center
    { x:  0.75, z: -0.35 },  // 2: top-right
    { x: -0.75, z:  0.35 },  // 3: bottom-left
    { x:  0.00, z:  0.35 },  // 4: bottom-center
    { x:  0.75, z:  0.35 },  // 5: bottom-right
  ];

  // Dim slot markers (show where fragments go)
  const slotMeshes = [];
  const slotGlowMats = [];
  for (let i = 0; i < 6; i++) {
    const slotMat = new THREE.MeshStandardMaterial({
      color: 0x1a3040,
      emissive: 0x1a4050,
      emissiveIntensity: 0.3,
      roughness: 0.3,
      metalness: 0.2,
      transparent: true,
      opacity: 0.6
    });
    const slotMesh = new THREE.Mesh(new THREE.PlaneGeometry(FRAG_W, FRAG_D), slotMat);
    slotMesh.position.set(slotPositions[i].x, 0.87, slotPositions[i].z);
    slotMesh.rotation.x = -Math.PI / 2;
    tableGroup.add(slotMesh);
    slotMeshes.push(slotMesh);
    slotGlowMats.push(slotMat);
  }

  // Placed fragment meshes (created when fragments snap in)
  const placedFragmentMeshes = [];
  for (let i = 0; i < 6; i++) {
    const fragTex = createMapFragmentCanvas(i, 256, 240);
    const fragMat = new THREE.MeshStandardMaterial({
      map: fragTex,
      roughness: 0.7,
      metalness: 0.0,
      emissive: new THREE.Color(0xc8a860),
      emissiveIntensity: 0.15,
      emissiveMap: fragTex
    });
    const fragMesh = new THREE.Mesh(new THREE.PlaneGeometry(FRAG_W, FRAG_D), fragMat);
    fragMesh.position.set(slotPositions[i].x, 0.875, slotPositions[i].z);
    fragMesh.rotation.x = -Math.PI / 2;
    fragMesh.visible = false;
    tableGroup.add(fragMesh);
    placedFragmentMeshes.push(fragMesh);
  }

  // ── Scattered fragment props (around the room) ────────────────────────
  const fragmentLabels = [
    'Fragment #1 - Boussole',
    'Fragment #2 - Titre',
    'Fragment #3 - Iles',
    'Fragment #4 - Legende',
    'Fragment #5 - Station',
    'Fragment #6 - Coordonnees'
  ];

  const fragmentLocations = [
    // 0: On left wall
    { pos: [-(ROOM_W / 2) + 0.06, 1.8, -1.5], rotY: Math.PI / 2, rotX: 0 },
    // 1: On back wall (high)
    { pos: [1.5, 2.5, -(ROOM_D / 2) + 0.06], rotY: 0, rotX: 0 },
    // 2: On right wall
    { pos: [(ROOM_W / 2) - 0.06, 1.5, 2.0], rotY: -Math.PI / 2, rotX: 0 },
    // 3: On the desk (front-left)
    { pos: [-3.0, 1.08, 2.5], rotY: 0, rotX: -Math.PI / 2 },
    // 4: On shelf near back-right
    { pos: [3.0, 1.4, -(ROOM_D / 2) + 1.0], rotY: -0.2, rotX: -0.3 },
    // 5: On the floor near porthole (left side)
    { pos: [-(ROOM_W / 2) + 0.8, 0.6, 3.0], rotY: Math.PI / 4, rotX: -0.2 }
  ];

  const fragmentGroups = [];
  const fragmentGlowMats = [];

  for (let i = 0; i < 6; i++) {
    const fGroup = new THREE.Group();

    // Paper surface with fragment preview
    const fragTex = createMapFragmentCanvas(i, 200, 180);
    const paperMat = new THREE.MeshStandardMaterial({
      map: fragTex,
      roughness: 0.85,
      metalness: 0.0
    });
    const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.3), paperMat);
    fGroup.add(paper);

    // Glowing border
    const glowMat = Materials.emissive(0x4ecdc4, 1.5);
    const bw = 0.35;
    const bh = 0.3;
    const t = 0.015;
    const edges = [
      { w: bw + t, h: t, x: 0, y: bh / 2 },
      { w: bw + t, h: t, x: 0, y: -bh / 2 },
      { w: t, h: bh + t, x: bw / 2, y: 0 },
      { w: t, h: bh + t, x: -bw / 2, y: 0 }
    ];
    for (const e of edges) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(e.w, e.h), glowMat);
      m.position.set(e.x, e.y, 0.001);
      fGroup.add(m);
    }

    // Label
    const lbl = createTextPlane(fragmentLabels[i], 0.45, 0.1, 10, '#4ecdc4', 'rgba(0,0,0,0)');
    lbl.position.set(0, 0.22, 0.002);
    fGroup.add(lbl);

    // Position
    const loc = fragmentLocations[i];
    fGroup.position.set(loc.pos[0], loc.pos[1], loc.pos[2]);
    fGroup.rotation.y = loc.rotY;
    fGroup.rotation.x = loc.rotX;

    group.add(fGroup);
    fragmentGroups.push(fGroup);
    fragmentGlowMats.push(glowMat);

    // Register interactive
    engine.registerInteractive(paper, {
      type: 'click',
      prompt: `Collect ${fragmentLabels[i]}`,
      icon: '\uD83D\uDDFA',  // world map emoji
      onInteract: () => {
        if (state.fragmentsPlaced[i] || state.solved) return;
        collectFragment(i);
      }
    });
  }

  function collectFragment(index) {
    state.fragmentsPlaced[index] = true;
    engine.playEffect('click');

    // Hide the scattered fragment
    fragmentGroups[index].visible = false;

    // Show it on the table
    placedFragmentMeshes[index].visible = true;

    // Dim the slot marker
    slotGlowMats[index].emissiveIntensity = 0;
    slotGlowMats[index].opacity = 0;

    // Brief glow on placed fragment
    placedFragmentMeshes[index].material.emissiveIntensity = 0.8;
    setTimeout(() => {
      if (placedFragmentMeshes[index].material) {
        placedFragmentMeshes[index].material.emissiveIntensity = 0.15;
      }
    }, 500);

    const placed = state.fragmentsPlaced.filter(Boolean).length;
    if (placed < 6) {
      engine.showObjective(`Fragments: ${placed}/6 \u2014 Search la salle for more morceaux.`);
    }

    // Check completion
    if (placed === 6) {
      onMapComplete();
    }
  }

  // ── Phase 2: compass rose + distance dial ─────────────────────────────
  // These become interactive once the map is complete.

  // Compass rose display on the table (right side)
  const compassCanvas = createCompassRoseCanvas(512, DIRECTIONS[0].angle, -1);
  const compassTexture = new THREE.CanvasTexture(compassCanvas);
  compassTexture.colorSpace = THREE.SRGBColorSpace;
  const compassMat = new THREE.MeshStandardMaterial({
    map: compassTexture,
    emissive: new THREE.Color(0x2a6a7a),
    emissiveIntensity: 0.2,
    emissiveMap: compassTexture,
    roughness: 0.2,
    metalness: 0.3
  });
  const compassMesh = new THREE.Mesh(new THREE.CircleGeometry(0.4, 32), compassMat);
  compassMesh.position.set(0, 0.88, 1.8);
  compassMesh.rotation.x = -Math.PI / 2;
  compassMesh.visible = false; // Hidden until map is complete
  tableGroup.add(compassMesh);

  // Compass label
  const compassLabel = createTextPlane('BOUSSOLE / COMPASS', 0.9, 0.12, 11, '#4ecdc4', 'rgba(10,22,40,0.85)');
  compassLabel.position.set(0, 0.88, 2.3);
  compassLabel.rotation.x = -Math.PI / 2;
  compassLabel.visible = false;
  tableGroup.add(compassLabel);

  // Distance dial display (left side of table area)
  const distCanvas = createDistanceDialCanvas(256, DISTANCE_VALUES[0], false);
  const distTexture = new THREE.CanvasTexture(distCanvas);
  distTexture.colorSpace = THREE.SRGBColorSpace;
  const distMat = new THREE.MeshStandardMaterial({
    map: distTexture,
    emissive: new THREE.Color(0x2a6a7a),
    emissiveIntensity: 0.2,
    emissiveMap: distTexture,
    roughness: 0.2,
    metalness: 0.3
  });
  const distMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.28), distMat);
  distMesh.position.set(0, 1.3, -ROOM_D / 2 + 0.06);
  distMesh.visible = false;
  group.add(distMesh);

  // Distance label
  const distLabel = createTextPlane('DISTANCE / MILLES NAUTIQUES', 1.0, 0.12, 10, '#4ecdc4', 'rgba(10,22,40,0.85)');
  distLabel.position.set(0, 1.55, -ROOM_D / 2 + 0.06);
  distLabel.visible = false;
  group.add(distLabel);

  // Compass interactive (registered after map complete)
  let compassRegistered = false;
  let distRegistered = false;

  function registerCompassInteractive() {
    if (compassRegistered) return;
    compassRegistered = true;

    engine.registerInteractive(compassMesh, {
      type: 'click',
      prompt: 'Rotate Compass / Tourner la boussole',
      icon: '\uD83E\uDDED',  // compass emoji
      onInteract: () => {
        if (state.solved) return;
        state.compassIndex = (state.compassIndex + 1) % DIRECTIONS.length;
        updateCompassDisplay();
        engine.playEffect('click');
        checkSolution();
      }
    });
  }

  function registerDistanceInteractive() {
    if (distRegistered) return;
    distRegistered = true;

    engine.registerInteractive(distMesh, {
      type: 'click',
      prompt: 'Change Distance / Changer la distance',
      icon: '\uD83D\uDCCF',  // ruler emoji
      onInteract: () => {
        if (state.solved) return;
        state.distanceIndex = (state.distanceIndex + 1) % DISTANCE_VALUES.length;
        updateDistanceDisplay();
        engine.playEffect('click');
        checkSolution();
      }
    });
  }

  function updateCompassDisplay() {
    const dir = DIRECTIONS[state.compassIndex];
    const canvas = createCompassRoseCanvas(512, dir.angle, state.compassIndex);
    compassTexture.image = canvas;
    compassTexture.needsUpdate = true;
  }

  function updateDistanceDisplay() {
    const val = DISTANCE_VALUES[state.distanceIndex];
    const isCorrect = val === CORRECT_DISTANCE && state.compassIndex === CORRECT_DIR_INDEX;
    const canvas = createDistanceDialCanvas(256, val, isCorrect);
    distTexture.image = canvas;
    distTexture.needsUpdate = true;
  }

  // ── Map complete transition ───────────────────────────────────────────
  function onMapComplete() {
    state.mapComplete = true;

    engine.playEffect('success');

    // Brighten the light table
    lightTableMat.emissiveIntensity = 1.2;
    lightTableMat.emissive.set(0x3a9aaa);

    // All fragments glow softly
    for (const fm of placedFragmentMeshes) {
      fm.material.emissiveIntensity = 0.3;
    }

    // Show compass and distance controls
    compassMesh.visible = true;
    compassLabel.visible = true;
    distMesh.visible = true;
    distLabel.visible = true;

    registerCompassInteractive();
    registerDistanceInteractive();

    engine.showObjective('Map restored! Set the compass to Nord-Ouest and the correct distance.');

    // Show narrative hint
    setTimeout(() => {
      engine.showNarrative('La Carte Restauree / Map Restored', `
        <p style="color:#4ecdc4;font-weight:bold;margin-bottom:8px;">
          Carte de l'exp&eacute;dition franco-am&eacute;ricaine
        </p>
        <p>The map is complete! The <span style="color:#4ecdc4;">expedition</span> route
        is now visible. You can see the <span style="color:#4ecdc4;">significant</span>
        location marked with an X.</p>
        <p>From this <span style="color:#4ecdc4;">perspective</span>, you must now:</p>
        <ol style="margin:8px 0 8px 20px;line-height:1.6;">
          <li>Set the <strong style="color:#ffcc44;">compass</strong> to the correct heading
          &mdash; look at the arrow on the map pointing <strong style="color:#ffcc44;">Nord-Ouest</strong>.</li>
          <li>Set the <strong style="color:#ffcc44;">distance dial</strong> to the correct number
          of <span style="color:#4ecdc4;">milles nautiques</span> (nautical miles) &mdash; check
          the <span style="color:#4ecdc4;">legende</span>.</li>
        </ol>
        <p style="color:#889;font-size:0.9em;margin-top:12px;">
          <span style="color:#ffcc44;">Les directions:</span>
          Nord, Nord-Est, Est, Sud-Est, Sud, Sud-Ouest, Ouest, <strong>Nord-Ouest</strong>
        </p>
      `);
    }, 800);
  }

  // ── Check solution ────────────────────────────────────────────────────
  function checkSolution() {
    if (!state.mapComplete || state.solved) return;

    const dirCorrect = state.compassIndex === CORRECT_DIR_INDEX;
    const distCorrect = DISTANCE_VALUES[state.distanceIndex] === CORRECT_DISTANCE;

    if (dirCorrect && distCorrect) {
      solvePuzzle();
    }
  }

  // ── Success sequence ──────────────────────────────────────────────────
  const successLights = [];
  let routeLineMesh = null;

  function solvePuzzle() {
    if (state.solved) return;
    state.solved = true;

    engine.playEffect('success');
    setTimeout(() => engine.playEffect('powerup'), 400);

    // Light table goes bright
    lightTableMat.emissive.set(0x4ecdc4);
    lightTableMat.emissiveIntensity = 2.0;

    // All fragments glow bright
    for (const fm of placedFragmentMeshes) {
      fm.material.emissive.set(0xddc880);
      fm.material.emissiveIntensity = 0.6;
    }

    // Holographic route line (from station X to NW)
    const routeGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0.92, 0.1),      // station center on table
      new THREE.Vector3(-0.8, 1.0, -0.7)    // NW direction
    ]);
    const routeLineMat = new THREE.LineBasicMaterial({
      color: 0x44ffcc,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending
    });
    routeLineMesh = new THREE.Line(routeGeo, routeLineMat);
    tableGroup.add(routeLineMesh);

    // Glow point at destination
    const destGlow = new THREE.Mesh(
      new THREE.SphereGeometry(0.04, 12, 12),
      Materials.emissive(0x44ffcc, 4)
    );
    destGlow.position.set(-0.8, 1.0, -0.7);
    tableGroup.add(destGlow);

    // Pulsing light at destination
    addPointLight(tableGroup, new THREE.Vector3(-0.8, 1.2, -0.7), 0x44ffcc, 2, 4);

    // Green success lights around the room
    const greenPositions = [
      new THREE.Vector3(-3, 2.5, -3),
      new THREE.Vector3(3, 2.5, -3),
      new THREE.Vector3(-3, 2.5, 3),
      new THREE.Vector3(3, 2.5, 3),
      new THREE.Vector3(0, 3.5, 0)
    ];
    for (const pos of greenPositions) {
      const gl = addPointLight(room.group, pos, 0x2a9d8f, 1.5, 8);
      successLights.push(gl);
    }

    // Compass highlight
    const finalCanvas = createCompassRoseCanvas(512, DIRECTIONS[CORRECT_DIR_INDEX].angle, CORRECT_DIR_INDEX);
    compassTexture.image = finalCanvas;
    compassTexture.needsUpdate = true;

    // Update distance dial to show correct state
    const finalDist = createDistanceDialCanvas(256, CORRECT_DISTANCE, true);
    distTexture.image = finalDist;
    distTexture.needsUpdate = true;

    // Update door status light
    backDoor.statusLight.material.dispose();
    backDoor.statusLight.material = Materials.emissiveOk(0x2a9d8f, 3);

    engine.hideObjective();
    engine.showCompletion('Navigation Complete \u2014 Ruins Located');
    engine.showRoomTitle('MISSION ACCOMPLIE', 'Cap: Nord-Ouest \u2014 15 milles nautiques');

    // Update game state
    if (gameState) {
      gameState.mapComplete = true;
    }
  }

  // ── Navigation desk (front-left area) ─────────────────────────────────
  const deskGroup = new THREE.Group();
  const deskMat = new THREE.MeshStandardMaterial({ color: 0x2a1a0e, roughness: 0.85, metalness: 0.05 });

  // Tabletop
  const deskTop = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, 0.7), deskMat);
  deskTop.position.set(0, 0.78, 0);
  deskTop.castShadow = true;
  deskTop.receiveShadow = true;
  deskGroup.add(deskTop);

  // Legs
  for (const [dx, dz] of [[-0.55, -0.3], [-0.55, 0.3], [0.55, -0.3], [0.55, 0.3]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.78, 0.05), deskMat);
    leg.position.set(dx, 0.39, dz);
    deskGroup.add(leg);
  }

  deskGroup.position.set(-3.2, 0, 2.5);
  group.add(deskGroup);

  // ── Shelving unit (back-right) ────────────────────────────────────────
  const shelfGroup = new THREE.Group();
  const shelfMat = Materials.metal(0x3a4050);

  // Uprights
  for (const xOff of [-0.6, 0.6]) {
    const upright = new THREE.Mesh(new THREE.BoxGeometry(0.04, 2.4, 0.3), shelfMat);
    upright.position.set(xOff, 1.2, 0);
    upright.castShadow = true;
    shelfGroup.add(upright);
  }

  // Shelves
  for (let sh = 0; sh < 4; sh++) {
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.03, 0.3), shelfMat);
    shelf.position.set(0, 0.3 + sh * 0.6, 0);
    shelf.receiveShadow = true;
    shelfGroup.add(shelf);
  }

  // Maritime instruments on shelves (decorative)
  const instrMat = Materials.metal(0x665544);
  // Sextant-like shape
  const sextant = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.15, 6), instrMat);
  sextant.position.set(-0.2, 0.42, 0);
  sextant.rotation.z = 0.3;
  shelfGroup.add(sextant);

  // Spyglass
  const spyglass = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.3, 8), Materials.metalAccent(0x887755));
  spyglass.position.set(0.2, 1.02, 0);
  spyglass.rotation.z = Math.PI / 2;
  shelfGroup.add(spyglass);

  // Small globe
  const miniGlobe = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 12, 12),
    new THREE.MeshStandardMaterial({ color: 0x2a5577, roughness: 0.6, metalness: 0.15 })
  );
  miniGlobe.position.set(0, 1.65, 0);
  shelfGroup.add(miniGlobe);

  shelfGroup.position.set(3.2, 0, -(ROOM_D / 2) + 0.6);
  group.add(shelfGroup);

  // ── Wall-mounted charts ───────────────────────────────────────────────
  const chartData = [
    { text: 'CARTE DE L\'EXPEDITION FRANCO-AMERICAINE', x: 0, z: -(ROOM_D / 2) + 0.06, rotY: 0, w: 1.8, h: 0.25, size: 14 },
    { text: 'ROUTES MARITIMES \u2014 ATLANTIQUE NORD', x: -2.5, z: -(ROOM_D / 2) + 0.06, rotY: 0, w: 1.2, h: 0.2, size: 11 },
    { text: 'NAVIGATION INSTRUMENTS', x: -(ROOM_W / 2) + 0.06, z: 0, rotY: Math.PI / 2, w: 1.0, h: 0.18, size: 11 },
    { text: 'PROFONDEUR: 200m', x: (ROOM_W / 2) - 0.06, z: 0, rotY: -Math.PI / 2, w: 0.8, h: 0.15, size: 12 }
  ];

  for (const ch of chartData) {
    const chart = createTextPlane(ch.text, ch.w, ch.h, ch.size, '#88aacc', 'rgba(10,20,35,0.9)');
    chart.position.set(ch.x, 3.0, ch.z);
    chart.rotation.y = ch.rotY;
    group.add(chart);
  }

  // ── Pipes along ceiling ───────────────────────────────────────────────
  const pipeMat = Materials.metal(0x3a4a5a);
  for (let i = 0; i < 2; i++) {
    const pipe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, ROOM_W, 8),
      pipeMat
    );
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(0, ROOM_H - 0.12 - i * 0.1, -(ROOM_D / 2) + 0.3 + i * 4);
    group.add(pipe);
  }

  // Pipe brackets
  for (let x = -3; x <= 3; x += 3) {
    for (let i = 0; i < 2; i++) {
      const bracket = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.15, 0.06),
        pipeMat
      );
      bracket.position.set(x, ROOM_H - 0.2, -(ROOM_D / 2) + 0.3 + i * 4);
      group.add(bracket);
    }
  }

  // ── Navigation computer (back wall) ───────────────────────────────────
  const navCompGroup = new THREE.Group();
  const navMat = Materials.metal(0x2a3440);

  // Computer body
  const navBody = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 0.25), navMat);
  navBody.position.set(0, 0.6, 0);
  navBody.castShadow = true;
  navCompGroup.add(navBody);

  // Screen
  const navScreenMat = Materials.screen(0x0a1a2a);
  const navScreen = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.7), navScreenMat);
  navScreen.position.set(0, 0.7, 0.13);
  navCompGroup.add(navScreen);

  // "ORDINATEUR DE NAVIGATION" label
  const navLabel = createTextPlane('ORDINATEUR DE NAVIGATION', 1.4, 0.15, 12, '#4ecdc4', 'rgba(10,22,40,0.85)');
  navLabel.position.set(0, 1.35, 0.13);
  navCompGroup.add(navLabel);

  // Indicator lights
  const navIndicatorColors = [0xff3333, 0xffaa00, 0xff3333, 0xffaa00];
  for (let i = 0; i < navIndicatorColors.length; i++) {
    const light = new THREE.Mesh(
      new THREE.SphereGeometry(0.015, 8, 8),
      Materials.emissive(navIndicatorColors[i], 1.5)
    );
    light.position.set(-0.5 + i * 0.35, 1.1, 0.13);
    navCompGroup.add(light);
  }

  navCompGroup.position.set(0, 0.7, -(ROOM_D / 2) + 0.13);
  group.add(navCompGroup);

  // ── Explorer's journal ────────────────────────────────────────────────
  const journalGroup = new THREE.Group();

  const journalBook = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.04, 0.4),
    new THREE.MeshStandardMaterial({ color: 0x2a4a3a, roughness: 0.85, metalness: 0.0 })
  );
  journalBook.castShadow = true;
  journalGroup.add(journalBook);

  // Page surface
  const pageMat = new THREE.MeshStandardMaterial({ color: 0xd4c9a8, roughness: 1.0, metalness: 0.0 });
  const page = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.35), pageMat);
  page.position.set(0, 0.025, 0);
  page.rotation.x = -Math.PI / 2;
  journalGroup.add(page);

  // Emissive marker
  const markerMat = Materials.emissive(0x4ecdc4, 1.5);
  const marker = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.005, 0.01), markerMat);
  marker.position.set(0, 0.025, -0.19);
  journalGroup.add(marker);

  journalGroup.position.set(-3.2, 0.82, 2.5);
  journalGroup.rotation.y = 0.2;
  group.add(journalGroup);

  // Journal interactive
  engine.registerInteractive(journalBook, {
    type: 'click',
    prompt: 'Read Journal / Lire le journal',
    icon: '\uD83D\uDCD6',
    onInteract: () => {
      engine.playEffect('click');
      engine.showNarrative('Journal de l\'Expedition', JOURNAL_HTML);
    }
  });

  // ── Room title sign ───────────────────────────────────────────────────
  const titleSign = createTextPlane('LA CARTE', 1.4, 0.3, 22, '#4ecdc4', 'rgba(10,22,40,0.9)');
  titleSign.position.set(0, 3.5, (ROOM_D / 2) - 0.06);
  titleSign.rotation.y = Math.PI;
  group.add(titleSign);

  const subtitleSign = createTextPlane('Salle de Cartographie', 1.2, 0.18, 12, '#6a8a9a', 'rgba(0,0,0,0)');
  subtitleSign.position.set(0, 3.2, (ROOM_D / 2) - 0.06);
  subtitleSign.rotation.y = Math.PI;
  group.add(subtitleSign);

  // ── Back door ─────────────────────────────────────────────────────────
  const backDoor = createDoor(1.2, 2.2, 0x2d4a6f);
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
    engine.camera.position.set(0, 1.6, 3.5);
    engine.setRoomBounds(
      -ROOM_W / 2 + 0.5, ROOM_W / 2 - 0.5,
      -ROOM_D / 2 + 0.5, ROOM_D / 2 - 0.5
    );

    engine.showRoomTitle('La Carte', 'The Map \u2014 Salle de Cartographie');

    // Ambient ocean hum
    engine.playAmbient(48, 'sine', 0.05);
    engine.playAmbient(72, 'triangle', 0.02);

    // Dust particles
    engine.addDust({
      minX: -ROOM_W / 2,
      maxX: ROOM_W / 2,
      minZ: -ROOM_D / 2,
      maxZ: ROOM_D / 2,
      height: ROOM_H
    });

    // Initial objective
    if (!state.solved) {
      const placed = state.fragmentsPlaced.filter(Boolean).length;
      if (placed < 6) {
        engine.showObjective('Find 6 map fragments and reconstruct la carte on the light table.');
      } else {
        engine.showObjective('Set the compass to Nord-Ouest and the correct distance.');
      }
    }
  }

  function exit() {
    engine.stopAmbient();
    engine.clearParticles();
    engine.hideObjective();
  }

  function update(delta) {
    state.time += delta;

    // Pulse unfound fragment borders
    const pulse = 0.8 + Math.sin(state.time * 3.0) * 0.7;
    for (let i = 0; i < 6; i++) {
      if (!state.fragmentsPlaced[i]) {
        fragmentGlowMats[i].emissiveIntensity = pulse * 1.5;
      } else {
        fragmentGlowMats[i].emissiveIntensity = 0.3;
      }
    }

    // Pulse empty slot markers
    const slotPulse = 0.15 + Math.sin(state.time * 2.0) * 0.1;
    for (let i = 0; i < 6; i++) {
      if (!state.fragmentsPlaced[i]) {
        slotGlowMats[i].emissiveIntensity = slotPulse;
      }
    }

    // Light table gentle pulsing
    if (!state.solved) {
      const tablePulse = state.mapComplete ? 1.0 : 0.5;
      lightTableMat.emissiveIntensity = tablePulse + Math.sin(state.time * 1.5) * 0.15;
    }

    // Porthole bioluminescence
    for (const mat of portholeGlowMats) {
      mat.emissiveIntensity = 0.6 + Math.sin(state.time * 0.8 + Math.random() * 0.1) * 0.3;
    }

    // Journal marker glow
    markerMat.emissiveIntensity = 1.0 + Math.sin(state.time * 2) * 0.5;

    // Nav computer screen flicker
    navScreenMat.emissiveIntensity = 0.3 + Math.sin(state.time * 6) * 0.05;

    // Success animation
    if (state.solved) {
      // Sweep success lights
      for (let i = 0; i < successLights.length; i++) {
        successLights[i].intensity = 1.0 + Math.sin(state.time * 2.0 + i * 1.0) * 0.5;
      }

      // Pulse the light table
      lightTableMat.emissiveIntensity = 1.5 + Math.sin(state.time * 2.5) * 0.5;

      // Compass glow
      compassMat.emissiveIntensity = 0.4 + Math.sin(state.time * 2.0) * 0.2;
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
        position: new THREE.Vector3(0, 1.1, ROOM_D / 2),
        onInteract: null  // set by caller
      }
    }
  };
  return returnObj;
}
