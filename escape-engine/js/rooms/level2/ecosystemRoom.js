import * as THREE from 'three';
import {
  Engine, Materials, createRoom, createDoor, createGauge,
  createTextPlane, addSpotlight, addPointLight
} from '../../engine.js';

// ─── Room: L'Ecosysteme (The Ecosystem) ──────────────────────────────
// Underwater biodome lab. Three interconnected terrarium tanks contain
// marine specimens (kelp, coral, algae). The player adjusts Temperature,
// Light, and Water Flow for each tank via a 3x3 control panel. Light
// and Water are shared resources: raising one tank's share lowers the
// others. All three specimens must *flourish* simultaneously.
//
// Educational integration:
//   Science  -- ecosystems, marine biology, interdependent variables
//   Math     -- constrained sums, proportional reasoning
//   French   -- tank labels, control labels, status readouts
//   ELA      -- vocabulary: ecosystem, equilibrium, sustain, flourish,
//               diminish, abundant, emerge

const ROOM_W = 10;
const ROOM_H = 4;
const ROOM_D = 10;

// ── Target values (hidden) ────────────────────────────────────────────
// Tank A (Kelp):  Temp 18, Light 60, Water 80
// Tank B (Coral): Temp 24, Light 40, Water 50
// Tank C (Algae): Temp 15, Light 80, Water 30

const TARGETS = [
  { temp: 18, light: 60, water: 80 },  // A - Kelp
  { temp: 24, light: 40, water: 50 },  // B - Coral
  { temp: 15, light: 80, water: 30 },  // C - Algae
];

const LIGHT_TOTAL = 180; // mirrors redirect: sum must equal 180%
const WATER_TOTAL = 160; // shared pipe: sum must equal 160%
const TEMP_MIN = 5;
const TEMP_MAX = 35;
const WIN_TOLERANCE = 15; // percent — within 15% of each target value
const DIAL_SENSITIVITY = 0.25; // value units per pixel of mouse drag

// ── Tank info for labels ──────────────────────────────────────────────
const TANK_INFO = [
  { name: 'Reservoir A: Varech (Kelp)',     short: 'A' },
  { name: 'Reservoir B: Corail (Coral)',    short: 'B' },
  { name: 'Reservoir C: Algues (Algae)',    short: 'C' },
];

const PARAM_LABELS = ['Temperature', 'Lumiere', "Debit d'eau"];
const STATUS_LABELS = { thriving: 'Florissant', atRisk: 'En danger', critical: 'Critique' };

// ─── Build ───────────────────────────────────────────────────────────
export function buildEcosystemRoom(engine, gameState) {

  // ── State ──────────────────────────────────────────────────────────
  // Per-tank values: [A, B, C]
  const temps  = [20, 20, 20];          // degrees C, independent
  const lights = [60, 60, 60];          // percent, sum = 180
  const waters = [53, 53, 54];          // percent, sum = 160

  let solved = false;
  let timeInRoom = 0;
  let hintStage = 0;

  // Health per tank: 0 (dead) to 1 (perfect)
  const health = [0, 0, 0];

  const result = {
    group: new THREE.Group(),
    doors: {},
    enter,
    exit,
    update,
    get isComplete() { return solved; }
  };

  const group = result.group;

  // ── Room Shell ─────────────────────────────────────────────────────
  const room = createRoom(
    ROOM_W, ROOM_H, ROOM_D,
    Materials.wall(0x0c2d3e),
    Materials.floor(0x0a1e2e),
    Materials.wall(0x0e3348)
  );
  group.add(room.group);

  // ── Ambient Lighting (brighter for L2) ─────────────────────────────
  const ambient = new THREE.AmbientLight(0x3399aa, 0.55);
  group.add(ambient);

  // Overhead strip lights — teal bioluminescence
  addSpotlight(group,
    new THREE.Vector3(0, 3.9, -2), new THREE.Vector3(0, 0, -2),
    0x44ddcc, 2.0, 0.8);
  addSpotlight(group,
    new THREE.Vector3(0, 3.9, 2), new THREE.Vector3(0, 0, 2),
    0x44ddcc, 2.0, 0.8);

  // Accent lights near tanks
  addPointLight(group, new THREE.Vector3(-3.2, 2.5, -4), 0x00ffcc, 0.8, 4);
  addPointLight(group, new THREE.Vector3(0, 2.5, -4), 0x00ccff, 0.8, 4);
  addPointLight(group, new THREE.Vector3(3.2, 2.5, -4), 0x44ffaa, 0.8, 4);

  // Warm light near control panel
  addPointLight(group, new THREE.Vector3(0, 2.0, 3.5), 0xffeedd, 0.6, 4);

  // ── Floor grating ──────────────────────────────────────────────────
  for (let z = -4; z <= 4; z += 2) {
    const grate = new THREE.Mesh(
      new THREE.BoxGeometry(ROOM_W - 0.5, 0.02, 0.25),
      Materials.metal(0x1a3040)
    );
    grate.position.set(0, 0.01, z);
    grate.receiveShadow = true;
    group.add(grate);
  }

  // ── Three Terrariums (back wall, z = -4) ───────────────────────────
  // Each tank: glass box with emissive edges, specimen inside, bubbles.
  const tanks = [];
  const specimens = [];
  const specimenMats = [];
  const tankGlowMats = [];
  const bubbleSystems = [];

  const tankPositions = [
    new THREE.Vector3(-3.2, 1.5, -4.3),
    new THREE.Vector3(0,    1.5, -4.3),
    new THREE.Vector3(3.2,  1.5, -4.3),
  ];

  for (let i = 0; i < 3; i++) {
    const tGroup = new THREE.Group();
    tGroup.position.copy(tankPositions[i]);

    // Glass box (transparent)
    const glassMat = Materials.glass();
    const glassBox = new THREE.Mesh(
      new THREE.BoxGeometry(2.0, 2.0, 1.2),
      glassMat
    );
    glassBox.position.set(0, 0, 0);
    tGroup.add(glassBox);

    // Emissive edge frame (12 edges as thin boxes)
    const edgeMat = Materials.emissive(0x00cccc, 1.5);
    tankGlowMats.push(edgeMat);
    const hw = 1.0, hh = 1.0, hd = 0.6;
    const t = 0.025; // edge thickness

    // Vertical edges (4)
    for (const dx of [-hw, hw]) {
      for (const dz of [-hd, hd]) {
        const edge = new THREE.Mesh(
          new THREE.BoxGeometry(t, hh * 2, t), edgeMat
        );
        edge.position.set(dx, 0, dz);
        tGroup.add(edge);
      }
    }
    // Horizontal edges along X (top and bottom, front and back = 4)
    for (const dy of [-hh, hh]) {
      for (const dz of [-hd, hd]) {
        const edge = new THREE.Mesh(
          new THREE.BoxGeometry(hw * 2, t, t), edgeMat
        );
        edge.position.set(0, dy, dz);
        tGroup.add(edge);
      }
    }
    // Horizontal edges along Z (top and bottom, left and right = 4)
    for (const dy of [-hh, hh]) {
      for (const dx of [-hw, hw]) {
        const edge = new THREE.Mesh(
          new THREE.BoxGeometry(t, t, hd * 2), edgeMat
        );
        edge.position.set(dx, dy, 0);
        tGroup.add(edge);
      }
    }

    // Specimen inside
    const specMat = new THREE.MeshStandardMaterial({
      color: 0x228855, roughness: 0.6, metalness: 0.1,
      emissive: new THREE.Color(0x115533), emissiveIntensity: 0.3
    });
    specimenMats.push(specMat);

    let spec;
    if (i === 0) {
      // Kelp: tall thin cylinder with smaller cylinders as fronds
      spec = new THREE.Group();
      const stalk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.08, 1.2, 8), specMat
      );
      stalk.position.y = -0.3;
      spec.add(stalk);
      // Fronds
      for (let f = 0; f < 3; f++) {
        const frond = new THREE.Mesh(
          new THREE.CylinderGeometry(0.03, 0.05, 0.6, 6), specMat
        );
        frond.position.set(
          Math.sin(f * 2.1) * 0.15,
          -0.1 + f * 0.25,
          Math.cos(f * 2.1) * 0.1
        );
        frond.rotation.z = (f - 1) * 0.4;
        spec.add(frond);
      }
    } else if (i === 1) {
      // Coral: branching structure (cones)
      spec = new THREE.Group();
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.25, 0.3, 12), specMat
      );
      base.position.y = -0.7;
      spec.add(base);
      for (let b = 0; b < 5; b++) {
        const branch = new THREE.Mesh(
          new THREE.ConeGeometry(0.06, 0.4 + Math.random() * 0.3, 6), specMat
        );
        branch.position.set(
          Math.sin(b * 1.25) * 0.15,
          -0.4 + b * 0.15,
          Math.cos(b * 1.25) * 0.12
        );
        branch.rotation.z = (Math.random() - 0.5) * 0.6;
        branch.rotation.x = (Math.random() - 0.5) * 0.3;
        spec.add(branch);
      }
    } else {
      // Algae: cluster of small spheres
      spec = new THREE.Group();
      for (let a = 0; a < 8; a++) {
        const blob = new THREE.Mesh(
          new THREE.SphereGeometry(0.08 + Math.random() * 0.06, 8, 8), specMat
        );
        blob.position.set(
          (Math.random() - 0.5) * 0.4,
          -0.5 + Math.random() * 0.6,
          (Math.random() - 0.5) * 0.3
        );
        spec.add(blob);
      }
    }

    tGroup.add(spec);
    specimens.push(spec);

    // Tank label (on front face)
    const label = createTextPlane(
      TANK_INFO[i].name, 1.6, 0.2, 12, '#00ddcc', 'rgba(5,20,30,0.9)'
    );
    label.position.set(0, -1.2, 0.65);
    tGroup.add(label);

    group.add(tGroup);
    tanks.push(tGroup);
  }

  // ── Status displays above each tank ────────────────────────────────
  const statusDisplays = [];
  for (let i = 0; i < 3; i++) {
    const sd = createStatusDisplay();
    sd.mesh.position.set(tankPositions[i].x, 2.85, -4.15);
    group.add(sd.mesh);
    statusDisplays.push(sd);
  }

  function createStatusDisplay() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;

    const mat = new THREE.MeshStandardMaterial({
      map: texture,
      emissive: new THREE.Color(0x22aa88),
      emissiveIntensity: 0.4,
      emissiveMap: texture,
      roughness: 0.2,
      metalness: 0.3
    });

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.22), mat);

    function setStatus(statusKey, healthVal) {
      ctx.fillStyle = '#060e12';
      ctx.fillRect(0, 0, 256, 64);

      let label, color;
      if (statusKey === 'thriving') {
        label = STATUS_LABELS.thriving;
        color = '#00ff88';
      } else if (statusKey === 'atRisk') {
        label = STATUS_LABELS.atRisk;
        color = '#ffaa22';
      } else {
        label = STATUS_LABELS.critical;
        color = '#ff3344';
      }

      ctx.fillStyle = color;
      ctx.font = 'bold 28px Courier New';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, 128, 24);

      // Health bar
      ctx.fillStyle = '#1a2a2a';
      ctx.fillRect(20, 44, 216, 12);
      ctx.fillStyle = color;
      ctx.fillRect(20, 44, 216 * healthVal, 12);

      texture.needsUpdate = true;
    }

    setStatus('critical', 0);
    return { mesh, setStatus };
  }

  // ── Bubble particle systems per tank (managed locally) ─────────────
  for (let i = 0; i < 3; i++) {
    const count = 40;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const speeds = new Float32Array(count);
    const cx = tankPositions[i].x;
    const cy = tankPositions[i].y;
    const cz = tankPositions[i].z;

    for (let j = 0; j < count; j++) {
      positions[j * 3]     = cx + (Math.random() - 0.5) * 1.4;
      positions[j * 3 + 1] = cy - 0.8 + Math.random() * 1.6;
      positions[j * 3 + 2] = cz + (Math.random() - 0.5) * 0.8;
      speeds[j] = 0.3 + Math.random() * 0.5;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      size: 0.04,
      color: 0x66ffee,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    const points = new THREE.Points(geometry, material);
    group.add(points);

    bubbleSystems.push({
      points, geometry, material, speeds, cx, cy, cz, count,
      intensity: 0.5,
      update(delta) {
        material.opacity = 0.5 * this.intensity;
        const pos = geometry.attributes.position;
        for (let j = 0; j < count; j++) {
          pos.array[j * 3 + 1] += speeds[j] * delta * this.intensity;
          pos.array[j * 3]     += (Math.random() - 0.5) * 0.01;
          // Reset when above tank
          if (pos.array[j * 3 + 1] > cy + 0.9) {
            pos.array[j * 3]     = this.cx + (Math.random() - 0.5) * 1.4;
            pos.array[j * 3 + 1] = cy - 0.8;
            pos.array[j * 3 + 2] = this.cz + (Math.random() - 0.5) * 0.8;
          }
        }
        pos.needsUpdate = true;
      }
    });
  }

  // ── Control Panel (front area, z ~ +3) ─────────────────────────────
  // Console table
  const consoleMat = Materials.metal(0x2a3a4a);
  const consoleTop = new THREE.Mesh(
    new THREE.BoxGeometry(5.5, 0.08, 1.8), consoleMat
  );
  consoleTop.position.set(0, 1.0, 3.2);
  consoleTop.castShadow = true;
  consoleTop.receiveShadow = true;
  group.add(consoleTop);

  // Console front panel (angled)
  const consoleFront = new THREE.Mesh(
    new THREE.BoxGeometry(5.5, 0.8, 0.08), consoleMat
  );
  consoleFront.position.set(0, 0.56, 4.05);
  group.add(consoleFront);

  // Console legs
  for (const dx of [-2.5, 2.5]) {
    const leg = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 1.0, 1.8), consoleMat
    );
    leg.position.set(dx, 0.5, 3.2);
    group.add(leg);
  }

  // Panel title
  const panelTitle = createTextPlane(
    "CONTROLE DE L'ECOSYSTEME", 3.0, 0.25, 16, '#00ddcc', 'rgba(5,15,25,0.95)'
  );
  panelTitle.position.set(0, 2.2, 4.85);
  group.add(panelTitle);

  // Column headers on back wall behind console
  const colLabels = ['Temperature', 'Lumiere', "Debit d'eau"];
  for (let c = 0; c < 3; c++) {
    const lbl = createTextPlane(
      colLabels[c], 1.2, 0.18, 12, '#88ccbb', 'rgba(5,15,25,0.9)'
    );
    lbl.position.set(-1.7 + c * 1.7, 1.95, 4.85);
    group.add(lbl);
  }

  // Row labels (tank names) on the left side of panel
  for (let r = 0; r < 3; r++) {
    const lbl = createTextPlane(
      TANK_INFO[r].short, 0.3, 0.2, 18, '#00ddcc', 'rgba(5,15,25,0.9)'
    );
    lbl.position.set(-3.1, 1.7 - r * 0.5, 4.85);
    group.add(lbl);
  }

  // ── 9 Gauge-and-Dial Cells (3 rows x 3 columns) ───────────────────
  // Grid: rows = tanks (A,B,C), cols = params (Temp, Light, Water)
  // Layout on back wall at z = 4.85

  const gauges = [];     // [row][col]
  const dialMeshes = []; // [row][col] — the interactive mesh
  const readouts = [];   // [row][col] — digital readout

  for (let r = 0; r < 3; r++) {
    gauges.push([]);
    dialMeshes.push([]);
    readouts.push([]);

    for (let c = 0; c < 3; c++) {
      const cx = -1.7 + c * 1.7;
      const cy = 1.7 - r * 0.5;

      // Gauge
      const gauge = createGauge(0.15);
      gauge.group.position.set(cx - 0.25, cy, 4.86);
      group.add(gauge.group);
      gauges[r].push(gauge);

      // Dial knob (interactive) — a small cylinder sticking out
      const dialGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.06, 16);
      const dialMat = Materials.metal(c === 0 ? 0xcc6644 : c === 1 ? 0xcccc44 : 0x4488cc);
      const dial = new THREE.Mesh(dialGeo, dialMat);
      dial.position.set(cx + 0.25, cy, 4.87);
      dial.rotation.x = Math.PI / 2;
      dial.castShadow = true;
      group.add(dial);
      dialMeshes[r].push(dial);

      // Dial pointer notch
      const notch = new THREE.Mesh(
        new THREE.BoxGeometry(0.01, 0.07, 0.02),
        Materials.emissive(0xffffff, 1)
      );
      notch.position.set(0, 0, 0.02);
      dial.add(notch);

      // Digital readout below gauge
      const ro = createReadout();
      ro.mesh.position.set(cx, cy - 0.22, 4.86);
      group.add(ro.mesh);
      readouts[r].push(ro);
    }
  }

  function createReadout() {
    const canvas = document.createElement('canvas');
    canvas.width = 192;
    canvas.height = 40;
    const ctx = canvas.getContext('2d');

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;

    const mat = new THREE.MeshStandardMaterial({
      map: texture,
      emissive: new THREE.Color(0x00ff88),
      emissiveIntensity: 0.25,
      emissiveMap: texture,
      roughness: 0.2,
      metalness: 0.3
    });

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.1), mat);

    function setValue(val, unit) {
      ctx.fillStyle = '#060e0a';
      ctx.fillRect(0, 0, 192, 40);
      ctx.fillStyle = '#00ff88';
      ctx.font = 'bold 22px Courier New';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(val.toFixed(0) + unit, 96, 20);
      texture.needsUpdate = true;
    }

    setValue(0, '');
    return { mesh, setValue };
  }

  // ── Constraint-link display (shows shared totals) ──────────────────
  const linkDisplayLight = createConstraintDisplay('Lumiere Total', LIGHT_TOTAL);
  linkDisplayLight.mesh.position.set(1.7 - 1.7, 0.3, 4.86);
  // Actually place them under the Light and Water columns
  linkDisplayLight.mesh.position.set(0, 0.55, 4.86);
  group.add(linkDisplayLight.mesh);

  const linkDisplayWater = createConstraintDisplay("Eau Total", WATER_TOTAL);
  linkDisplayWater.mesh.position.set(1.7, 0.55, 4.86);
  group.add(linkDisplayWater.mesh);

  function createConstraintDisplay(label, total) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 48;
    const ctx = canvas.getContext('2d');

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;

    const mat = new THREE.MeshStandardMaterial({
      map: texture,
      emissive: new THREE.Color(0x4488aa),
      emissiveIntensity: 0.3,
      emissiveMap: texture,
      roughness: 0.2,
      metalness: 0.3
    });

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.16), mat);

    function update(values) {
      const sum = values[0] + values[1] + values[2];
      ctx.fillStyle = '#060e14';
      ctx.fillRect(0, 0, 256, 48);
      ctx.font = '14px Courier New';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#6699aa';
      ctx.fillText(label + ': ' + sum.toFixed(0) + '/' + total + '%', 128, 24);
      texture.needsUpdate = true;
    }

    update([0, 0, 0]);
    return { mesh, update };
  }

  // ── Exit door (back to hub/corridor) ───────────────────────────────
  const exitDoor = createDoor(1.2, 2.2, 0x1a4a5a);
  exitDoor.group.position.set(4.0, 0, ROOM_D / 2 - 0.05);
  exitDoor.group.rotation.y = Math.PI;
  group.add(exitDoor.group);

  result.doors.back = {
    position: new THREE.Vector3(4.0, 1.1, ROOM_D / 2 - 0.05),
    onInteract: null
  };

  // ── Dr. Moreau's Notebook ──────────────────────────────────────────
  const notebookMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.25, 0.35, 0.04),
    new THREE.MeshStandardMaterial({ color: 0x2a5a3a, roughness: 0.8, metalness: 0.1 })
  );
  notebookMesh.position.set(-4.2, 1.05, 2.0);
  notebookMesh.rotation.x = -0.3;
  notebookMesh.castShadow = true;
  group.add(notebookMesh);

  // Notebook table
  const nbTable = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.05, 0.5), Materials.metal(0x2a3a3a)
  );
  nbTable.position.set(-4.2, 0.85, 2.0);
  nbTable.castShadow = true;
  nbTable.receiveShadow = true;
  group.add(nbTable);

  // Table legs
  for (const dx of [-0.3, 0.3]) {
    for (const dz of [-0.2, 0.2]) {
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.02, 0.85, 6),
        Materials.metal(0x2a3a3a)
      );
      leg.position.set(-4.2 + dx, 0.425, 2.0 + dz);
      group.add(leg);
    }
  }

  // ── Vocabulary wall displays ───────────────────────────────────────
  const vocabPlaque = createTextPlane(
    'ecosystem / equilibrium / sustain / flourish / diminish / abundant / emerge',
    2.8, 0.25, 11, '#66bbaa', 'rgba(5,15,25,0.92)'
  );
  vocabPlaque.position.set(-4.95, 3.0, 0);
  vocabPlaque.rotation.y = Math.PI / 2;
  group.add(vocabPlaque);

  // Ecosystem definition panel
  const defPlaque = createTextPlane(
    "Un ecosysteme est un reseau d'organismes qui dependent les uns des autres pour survivre.",
    2.2, 0.35, 11, '#44ccaa', 'rgba(5,15,25,0.92)'
  );
  defPlaque.position.set(-4.95, 2.4, -1.0);
  defPlaque.rotation.y = Math.PI / 2;
  group.add(defPlaque);

  // ── Hint sign (initially dim) ──────────────────────────────────────
  const hintLabel = createTextPlane(
    'Equilibrium: when all specimens flourish together',
    2.0, 0.2, 12, '#66ddaa', 'rgba(5,15,25,0.85)'
  );
  hintLabel.position.set(4.95, 2.8, 0);
  hintLabel.rotation.y = -Math.PI / 2;
  hintLabel.material.opacity = 0.15;
  hintLabel.material.transparent = true;
  group.add(hintLabel);

  // ── Pipe network along ceiling (visual, connecting tanks) ──────────
  const pipeMat = Materials.metal(0x3a5566);
  function addPipe(start, end, radius) {
    const r = radius || 0.035;
    const dir = new THREE.Vector3().subVectors(end, start);
    const length = dir.length();
    const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    const pipe = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, length, 8), pipeMat
    );
    pipe.position.copy(mid);
    const up = new THREE.Vector3(0, 1, 0);
    const quat = new THREE.Quaternion().setFromUnitVectors(up, dir.normalize());
    pipe.quaternion.copy(quat);
    pipe.castShadow = true;
    group.add(pipe);
    return pipe;
  }

  // Horizontal run connecting all three tanks at ceiling
  addPipe(new THREE.Vector3(-4.0, 3.6, -4.0), new THREE.Vector3(4.0, 3.6, -4.0), 0.04);
  // Verticals down into each tank
  addPipe(new THREE.Vector3(-3.2, 2.6, -4.0), new THREE.Vector3(-3.2, 3.6, -4.0));
  addPipe(new THREE.Vector3(0, 2.6, -4.0), new THREE.Vector3(0, 3.6, -4.0));
  addPipe(new THREE.Vector3(3.2, 2.6, -4.0), new THREE.Vector3(3.2, 3.6, -4.0));
  // Pipe from tanks up and over to console area
  addPipe(new THREE.Vector3(-4.0, 3.6, -4.0), new THREE.Vector3(-4.0, 3.6, 3.0));
  addPipe(new THREE.Vector3(4.0, 3.6, -4.0), new THREE.Vector3(4.0, 3.6, 3.0));

  // ── Register Interactives ──────────────────────────────────────────
  // 9 dials
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const row = r;
      const col = c;
      const paramName = PARAM_LABELS[col];
      const tankName = TANK_INFO[row].short;

      engine.registerInteractive(dialMeshes[row][col], {
        type: 'adjust',
        prompt: 'Adjust ' + paramName + ' for Tank ' + tankName + ' / Regler ' + paramName,
        icon: '\u2699\uFE0F',
        onAdjust(dx, _dy) {
          if (solved) return;
          adjustParam(row, col, dx);
          engine.playEffect('click');
        }
      });
    }
  }

  // Notebook
  engine.registerInteractive(notebookMesh, {
    type: 'click',
    prompt: "Read Dr. Moreau's notebook / Lire le carnet",
    icon: '\uD83D\uDCD6',
    onInteract() {
      engine.showNarrative('Carnet de Dr. Moreau', NOTEBOOK_HTML);
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

  // ── Parameter Adjustment Logic ─────────────────────────────────────
  function adjustParam(tankIdx, paramIdx, dx) {
    const delta = dx * DIAL_SENSITIVITY;

    if (paramIdx === 0) {
      // Temperature — independent per tank
      temps[tankIdx] = Math.max(TEMP_MIN, Math.min(TEMP_MAX, temps[tankIdx] + delta));
    } else if (paramIdx === 1) {
      // Light — shared resource, total = LIGHT_TOTAL
      adjustShared(lights, tankIdx, delta, LIGHT_TOTAL);
    } else {
      // Water — shared resource, total = WATER_TOTAL
      adjustShared(waters, tankIdx, delta, WATER_TOTAL);
    }

    // Rotate dial visually
    dialMeshes[tankIdx][paramIdx].rotation.z += dx * 0.05;
  }

  // Adjusts a shared-resource array. Increasing one tank decreases
  // the others proportionally so the total remains constant.
  function adjustShared(arr, idx, delta, total) {
    const oldVal = arr[idx];
    const newVal = Math.max(0, Math.min(total, oldVal + delta));
    const actualDelta = newVal - oldVal;

    if (Math.abs(actualDelta) < 0.01) return;

    arr[idx] = newVal;

    // Distribute the inverse delta among the other two tanks
    const otherIndices = [0, 1, 2].filter(i => i !== idx);
    const otherSum = arr[otherIndices[0]] + arr[otherIndices[1]];

    if (otherSum > 0.01) {
      // Proportional redistribution
      for (const oi of otherIndices) {
        const ratio = arr[oi] / otherSum;
        arr[oi] = Math.max(0, arr[oi] - actualDelta * ratio);
      }
    } else {
      // If others are at zero, split evenly
      for (const oi of otherIndices) {
        arr[oi] = Math.max(0, arr[oi] - actualDelta / 2);
      }
    }

    // Snap total back to exact value (fix floating point drift)
    const currentTotal = arr[0] + arr[1] + arr[2];
    if (Math.abs(currentTotal - total) > 0.01) {
      const correction = total - currentTotal;
      // Apply correction to the adjusted tank
      arr[idx] += correction;
      arr[idx] = Math.max(0, Math.min(total, arr[idx]));
    }
  }

  // ── Health Calculation ─────────────────────────────────────────────
  function computeHealth(tankIdx) {
    const t = TARGETS[tankIdx];
    const tempDiff = Math.abs(temps[tankIdx] - t.temp);
    const lightDiff = Math.abs(lights[tankIdx] - t.light);
    const waterDiff = Math.abs(waters[tankIdx] - t.water);

    // Each parameter contributes 1/3 of health.
    // Perfect = 0 diff, fully dead = 30+ diff for each.
    const maxDiff = 30;
    const tempH  = Math.max(0, 1 - tempDiff / maxDiff);
    const lightH = Math.max(0, 1 - lightDiff / maxDiff);
    const waterH = Math.max(0, 1 - waterDiff / maxDiff);

    return (tempH + lightH + waterH) / 3;
  }

  function isThriving(tankIdx) {
    const t = TARGETS[tankIdx];
    return (
      Math.abs(temps[tankIdx] - t.temp) <= WIN_TOLERANCE &&
      Math.abs(lights[tankIdx] - t.light) <= WIN_TOLERANCE &&
      Math.abs(waters[tankIdx] - t.water) <= WIN_TOLERANCE
    );
  }

  // ── Visual Update: Specimens ───────────────────────────────────────
  function updateSpecimenVisuals(tankIdx, h, delta) {
    const spec = specimens[tankIdx];
    const mat = specimenMats[tankIdx];
    const t = TARGETS[tankIdx];

    // Determine if too hot or too cold (based on dominant deviation)
    const tempDev = temps[tankIdx] - t.temp; // positive = too hot

    // Color: interpolate based on health and temperature
    const targetColor = new THREE.Color();
    if (h > 0.8) {
      // Thriving: vibrant green/teal
      targetColor.setHex(0x00ee88);
    } else if (tempDev > 5) {
      // Too hot: red/orange
      targetColor.lerpColors(
        new THREE.Color(0xff6633), new THREE.Color(0x44aa66),
        Math.max(0, (h - 0.3) / 0.5)
      );
    } else if (tempDev < -5) {
      // Too cold: blue/white
      targetColor.lerpColors(
        new THREE.Color(0x88bbff), new THREE.Color(0x44aa66),
        Math.max(0, (h - 0.3) / 0.5)
      );
    } else {
      // Moderate deviation — yellow to green
      targetColor.lerpColors(
        new THREE.Color(0xaaaa33), new THREE.Color(0x22cc77),
        h
      );
    }

    mat.color.lerp(targetColor, delta * 3);
    mat.emissive.copy(mat.color).multiplyScalar(0.3);
    mat.emissiveIntensity = 0.2 + h * 0.5;

    // Scale: shrinks when unhealthy, grows when healthy
    const targetScale = 0.5 + h * 0.7; // range 0.5 to 1.2
    const currentScale = spec.scale.x;
    const newScale = currentScale + (targetScale - currentScale) * delta * 2;
    spec.scale.set(newScale, newScale, newScale);

    // Gentle sway when thriving
    if (h > 0.7) {
      spec.rotation.z = Math.sin(timeInRoom * 1.5 + tankIdx) * 0.05 * h;
      spec.rotation.x = Math.cos(timeInRoom * 1.2 + tankIdx * 2) * 0.03 * h;
    }
  }

  // ── Enter / Exit ───────────────────────────────────────────────────
  function enter() {
    engine.showRoomTitle("L'Ecosysteme", 'The Ecosystem - Level 2');

    engine.setRoomBounds(-ROOM_W / 2, ROOM_W / 2, -ROOM_D / 2, ROOM_D / 2);
    engine.camera.position.set(0, 1.6, 2.0);

    // Ambient sounds: deep underwater hum + bubbling
    engine.playAmbient(45, 'sine', 0.07);
    engine.playAmbient(90, 'triangle', 0.03);

    // Dust / particulate in the water
    engine.addDust({
      minX: -ROOM_W / 2, maxX: ROOM_W / 2,
      minZ: -ROOM_D / 2, maxZ: ROOM_D / 2,
      height: ROOM_H
    });

    // Initialize gauges and readouts
    updateAllDisplays();

    engine.showObjective('Balance the ecosystem: make all three specimens flourish');
  }

  function exit() {
    engine.stopAmbient();
    engine.clearParticles();
    engine.hideObjective();
  }

  // ── Display Updates ────────────────────────────────────────────────
  function updateAllDisplays() {
    for (let r = 0; r < 3; r++) {
      // Temp gauge (0-1 mapped from TEMP_MIN to TEMP_MAX)
      const tempNorm = (temps[r] - TEMP_MIN) / (TEMP_MAX - TEMP_MIN);
      gauges[r][0].setValue(tempNorm);
      readouts[r][0].setValue(temps[r], '\u00B0C');

      // Light gauge (0-1 from 0 to LIGHT_TOTAL)
      const lightNorm = lights[r] / LIGHT_TOTAL;
      gauges[r][1].setValue(lightNorm);
      readouts[r][1].setValue(lights[r], '%');

      // Water gauge (0-1 from 0 to WATER_TOTAL)
      const waterNorm = waters[r] / WATER_TOTAL;
      gauges[r][2].setValue(waterNorm);
      readouts[r][2].setValue(waters[r], '%');

      // Status display
      const h = health[r];
      let statusKey;
      if (isThriving(r)) {
        statusKey = 'thriving';
      } else if (h > 0.5) {
        statusKey = 'atRisk';
      } else {
        statusKey = 'critical';
      }
      statusDisplays[r].setStatus(statusKey, h);
    }

    // Shared-resource totals
    linkDisplayLight.update(lights);
    linkDisplayWater.update(waters);
  }

  // ── Update Loop ────────────────────────────────────────────────────
  function update(delta) {
    timeInRoom += delta;

    if (solved) {
      // Post-solve animation: gentle pulse on tank edges
      const pulse = 0.8 + 0.2 * Math.sin(timeInRoom * 2);
      for (const mat of tankGlowMats) {
        mat.emissiveIntensity = pulse * 2.5;
      }
      // Keep bubbles going
      for (const bs of bubbleSystems) {
        bs.intensity = 0.8;
        bs.update(delta);
      }
      return;
    }

    // Compute health for each tank
    for (let i = 0; i < 3; i++) {
      health[i] = computeHealth(i);
    }

    // Update specimen visuals
    for (let i = 0; i < 3; i++) {
      updateSpecimenVisuals(i, health[i], delta);
    }

    // Update bubble intensity based on water flow
    for (let i = 0; i < 3; i++) {
      bubbleSystems[i].intensity = waters[i] / 100;
      bubbleSystems[i].update(delta);
    }

    // Update tank edge glow based on health
    for (let i = 0; i < 3; i++) {
      const h = health[i];
      const mat = tankGlowMats[i];
      if (isThriving(i)) {
        mat.color.setHex(0x00ff88);
        mat.emissive.setHex(0x00ff88);
        mat.emissiveIntensity = 1.5 + 0.5 * Math.sin(timeInRoom * 3 + i);
      } else if (h > 0.5) {
        mat.color.setHex(0xffaa22);
        mat.emissive.setHex(0xffaa22);
        mat.emissiveIntensity = 1.0;
      } else {
        mat.color.setHex(0xff3344);
        mat.emissive.setHex(0xff3344);
        mat.emissiveIntensity = 0.8 + 0.4 * Math.sin(timeInRoom * 5);
      }
    }

    // Update all readouts and gauges
    updateAllDisplays();

    // Hint system
    updateHints();

    // Win check: all three thriving simultaneously
    if (isThriving(0) && isThriving(1) && isThriving(2)) {
      onSolved();
    }
  }

  // ── Hint System ────────────────────────────────────────────────────
  function updateHints() {
    // Stage 1: after 45s, make hint label visible
    if (timeInRoom > 45 && hintStage < 1) {
      hintStage = 1;
      hintLabel.material.opacity = 0.9;
    }

    // Stage 2: after 90s, show a narrative hint about the shared resources
    if (timeInRoom > 90 && hintStage < 2) {
      hintStage = 2;
      engine.playEffect('click');

      const hintText = createTextPlane(
        'Light and Water are shared! Adjusting one tank affects the others.',
        2.4, 0.25, 12, '#ffcc44', 'rgba(20,15,5,0.95)'
      );
      hintText.position.set(0, 3.5, 0);
      group.add(hintText);

      // Fade out after 10 seconds
      setTimeout(() => {
        hintText.material.opacity = 0;
        hintText.material.transparent = true;
      }, 10000);
    }

    // Stage 3: after 150s, show target ranges on a monitor
    if (timeInRoom > 150 && hintStage < 3) {
      hintStage = 3;

      const monitorMesh = createHintMonitor();
      monitorMesh.position.set(4.95, 2.0, -2.0);
      monitorMesh.rotation.y = -Math.PI / 2;
      group.add(monitorMesh);

      engine.playEffect('powerup');
    }
  }

  function createHintMonitor() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 384;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#060e14';
    ctx.fillRect(0, 0, 512, 384);

    ctx.fillStyle = '#00ddcc';
    ctx.font = 'bold 18px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText('RESEARCH DATA - Dr. Moreau', 256, 30);

    ctx.font = '14px Courier New';
    ctx.fillStyle = '#88bbaa';

    const lines = [
      '',
      'Optimal conditions observed:',
      '',
      'Varech (Kelp):',
      '  Temp ~18C  Light ~60%  Water ~80%',
      '',
      'Corail (Coral):',
      '  Temp ~24C  Light ~40%  Water ~50%',
      '',
      'Algues (Algae):',
      '  Temp ~15C  Light ~80%  Water ~30%',
      '',
      'Note: Light total = 180%',
      '      Water total = 160%',
    ];

    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], 256, 60 + i * 22);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;

    const mat = new THREE.MeshStandardMaterial({
      map: texture,
      emissive: new THREE.Color(0x1a3040),
      emissiveIntensity: 0.5,
      emissiveMap: texture,
      roughness: 0.1,
      metalness: 0.3
    });

    return new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.9), mat);
  }

  // ── Solve ──────────────────────────────────────────────────────────
  function onSolved() {
    solved = true;

    engine.playEffect('clunk');
    setTimeout(() => engine.playEffect('success'), 400);

    // Turn all tank edges green
    for (const mat of tankGlowMats) {
      mat.color.setHex(0x00ff88);
      mat.emissive.setHex(0x00ff88);
      mat.emissiveIntensity = 2.5;
    }

    // All specimens fully vibrant
    for (const mat of specimenMats) {
      mat.color.setHex(0x00ee88);
      mat.emissive.setHex(0x00ee88);
      mat.emissiveIntensity = 0.6;
    }
    for (const spec of specimens) {
      spec.scale.set(1.2, 1.2, 1.2);
    }

    // Exit door turns green
    exitDoor.lightMat.color.setHex(0x2a9d8f);
    exitDoor.lightMat.emissive.setHex(0x2a9d8f);

    engine.hideObjective();
    engine.showCompletion('Ecosystem in Equilibrium! / Ecosysteme en equilibre!');

    if (gameState && gameState.onRoomComplete) {
      gameState.onRoomComplete('ecosystem');
    }
  }

  return result;
}

// ─── Narrative Content ────────────────────────────────────────────────
const NOTEBOOK_HTML = `
<div style="font-family: 'Courier New', monospace; line-height: 1.7; color: #c8e8d8;">

<p style="color: #00ddaa; font-weight: bold; border-bottom: 1px solid #224;">
  CARNET DE RECHERCHE - Dr. Moreau<br>
  <span style="font-size: 0.85em; color: #88aa99;">Research Notebook - Dr. Moreau</span>
</p>

<p><strong style="color: #00ccaa;">Entree 1 - L'Ecosysteme</strong><br>
The biodome houses a delicate <em>ecosystem</em> &mdash; three specimens that
must exist in <em>equilibrium</em>. Each organism needs specific conditions to
<em>flourish</em>, but they share the same water supply and light system. What
helps one may cause another to <em>diminish</em>.</p>

<p><strong style="color: #00ccaa;">Entree 2 - Les Specimens</strong><br>
<em>Le varech</em> (kelp) prefers cool temperatures and <em>abundant</em> water
flow. It is a hardy organism that can <em>sustain</em> itself through difficult
conditions, but it needs strong water current to deliver nutrients.<br><br>
<em>Le corail</em> (coral) is more delicate. It requires warm, well-lit water
but not too much current. When conditions are right, beautiful polyps
<em>emerge</em> from the base structure.<br><br>
<em>Les algues</em> (algae) thrive in bright light but minimal water flow.
Too much current washes the colony away; too little light and it cannot
photosynthesize.</p>

<p><strong style="color: #00ccaa;">Entree 3 - Le Systeme Partage</strong><br>
The three reservoirs are connected. Our mirror array redirects light between
tanks &mdash; the total illumination is fixed. Similarly, the water pump
distributes flow across all three tanks through a shared pipe. Increasing
flow to one reservoir will <em>diminish</em> flow to the others.<br><br>
Temperature, however, is controlled independently per tank. Each has its
own heating element.</p>

<p><strong style="color: #00ccaa;">Entree 4 - L'Equilibre</strong><br>
The goal is <em>equilibrium</em> &mdash; a state where all three specimens
<em>flourish</em> simultaneously. Watch the status displays above each
reservoir. When a specimen is healthy, it will appear vibrant green and
grow larger. When conditions are wrong, it will turn red (too hot), blue
(too cold), or shrink.<br><br>
Remember: in any <em>ecosystem</em>, changing one thing affects everything
else. You must <em>sustain</em> all three at once.</p>

<p style="color: #88aa99; font-style: italic; margin-top: 1.5em; border-top: 1px solid #224; padding-top: 0.5em;">
  <strong>Vocabulaire / Vocabulary:</strong><br>
  <em>un ecosysteme</em> &mdash; an ecosystem<br>
  <em>l'equilibre</em> &mdash; equilibrium, balance<br>
  <em>soutenir</em> &mdash; to sustain<br>
  <em>s'epanouir</em> &mdash; to flourish<br>
  <em>diminuer</em> &mdash; to diminish<br>
  <em>abondant(e)</em> &mdash; abundant<br>
  <em>emerger</em> &mdash; to emerge<br>
  <em>le reservoir</em> &mdash; tank, reservoir<br>
  <em>la lumiere</em> &mdash; light<br>
  <em>le debit d'eau</em> &mdash; water flow<br>
  <em>la temperature</em> &mdash; temperature<br>
  <em>florissant(e)</em> &mdash; thriving, flourishing
</p>

</div>
`;
