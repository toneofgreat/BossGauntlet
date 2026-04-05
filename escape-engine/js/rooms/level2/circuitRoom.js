import * as THREE from 'three';
import {
  Engine, Materials, createRoom, createDoor, createTextPlane,
  addSpotlight, addPointLight
} from '../../engine.js';

// ─── Room: Le Circuit ─────────────────────────────────────────────────
// Power distribution room. Route power through a 3x3 circuit board to
// light up all nine nodes and reach the output. Players toggle wire
// segments between adjacent nodes. Teaches path-finding, vocabulary
// (distribute, proportion, circuit, conduct, generate, efficient,
// sequence), and French integration.

export function buildCircuitRoom(engine, gameState) {

  // ── Constants ──────────────────────────────────────────────────────
  const ROOM_W = 10;
  const ROOM_H = 4;
  const ROOM_D = 8;

  // Circuit board geometry — mounted on the back wall (-Z)
  const BOARD_CENTER_X = 0;
  const BOARD_CENTER_Y = 2.0;
  const BOARD_CENTER_Z = -ROOM_D / 2 + 0.15;

  const NODE_SPACING = 0.7;   // distance between adjacent nodes
  const NODE_RADIUS = 0.1;
  const WIRE_RADIUS = 0.025;

  // Grid labels: row 0 = A, row 1 = B, row 2 = C; col 0-2
  const ROWS = 3;
  const COLS = 3;

  // ── State ──────────────────────────────────────────────────────────
  let solved = false;
  let timeInRoom = 0;
  let hintStage = 0;
  let powerFlowTime = 0;      // animation clock for power travelling along wires
  let winAnimTime = 0;

  // Node grid: [row][col] — each stores { mesh, pedestal, light, powered }
  const nodes = [];

  // Wire segments: Map keyed by "r1,c1-r2,c2" (sorted). Each stores:
  // { mesh, glowMesh, active, hitbox, fromNode:[r,c], toNode:[r,c] }
  const wires = new Map();

  // Power flow particles along active wires
  const flowParticles = [];

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
  const room = createRoom(ROOM_W, ROOM_H, ROOM_D,
    Materials.wall(0x0f2233),
    Materials.floor(0x0a1520),
    Materials.ceiling(0x0d1a28)
  );
  group.add(room.group);

  // ── Circuit Board Backplane ────────────────────────────────────────
  const boardW = NODE_SPACING * (COLS - 1) + 1.6;
  const boardH = NODE_SPACING * (ROWS - 1) + 1.6;
  const backplane = new THREE.Mesh(
    new THREE.BoxGeometry(boardW, boardH, 0.08),
    new THREE.MeshStandardMaterial({
      color: 0x0a1a2a,
      roughness: 0.7,
      metalness: 0.4
    })
  );
  backplane.position.set(BOARD_CENTER_X, BOARD_CENTER_Y, BOARD_CENTER_Z - 0.04);
  backplane.receiveShadow = true;
  group.add(backplane);

  // Decorative PCB traces on the backplane
  const traceMat = new THREE.MeshStandardMaterial({
    color: 0x1a3344,
    roughness: 0.5,
    metalness: 0.6,
    emissive: new THREE.Color(0x0a1a22),
    emissiveIntensity: 0.3
  });

  for (let i = 0; i < 12; i++) {
    const traceW = 0.01 + Math.random() * 0.015;
    const traceH = 0.3 + Math.random() * 1.2;
    const trace = new THREE.Mesh(
      new THREE.BoxGeometry(traceW, traceH, 0.005),
      traceMat
    );
    trace.position.set(
      BOARD_CENTER_X + (Math.random() - 0.5) * (boardW - 0.3),
      BOARD_CENTER_Y + (Math.random() - 0.5) * (boardH - 0.4),
      BOARD_CENTER_Z + 0.005
    );
    group.add(trace);
  }

  // Board frame / border
  const frameMat = Materials.metal(0x2a3a4a);
  const frameThick = 0.06;
  // Top and bottom
  for (const yOff of [-boardH / 2, boardH / 2]) {
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(boardW + frameThick * 2, frameThick, 0.12),
      frameMat
    );
    frame.position.set(BOARD_CENTER_X, BOARD_CENTER_Y + yOff, BOARD_CENTER_Z);
    frame.castShadow = true;
    group.add(frame);
  }
  // Left and right
  for (const xOff of [-boardW / 2, boardW / 2]) {
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(frameThick, boardH, 0.12),
      frameMat
    );
    frame.position.set(BOARD_CENTER_X + xOff, BOARD_CENTER_Y, BOARD_CENTER_Z);
    frame.castShadow = true;
    group.add(frame);
  }

  // ── Source and Output Indicators ───────────────────────────────────
  // SOURCE indicator to the left of A1
  const sourceX = BOARD_CENTER_X - NODE_SPACING * 1 - NODE_SPACING * 0.7;
  const sourceY = BOARD_CENTER_Y + NODE_SPACING; // row A level
  const sourceGeo = new THREE.OctahedronGeometry(0.12, 0);
  const sourceMat = Materials.emissive(0x00ffaa, 3);
  const sourceMesh = new THREE.Mesh(sourceGeo, sourceMat);
  sourceMesh.position.set(sourceX, sourceY, BOARD_CENTER_Z + 0.1);
  group.add(sourceMesh);

  // Source label
  const sourceLabel = createTextPlane("Source d'energie", 0.7, 0.15, 11, '#00ffaa', 'rgba(5,15,10,0.95)');
  sourceLabel.position.set(sourceX, sourceY - 0.2, BOARD_CENTER_Z + 0.12);
  group.add(sourceLabel);

  // Wire from source to A1 (always on)
  const sourceWireLen = NODE_SPACING * 0.55;
  const sourceWire = new THREE.Mesh(
    new THREE.CylinderGeometry(WIRE_RADIUS, WIRE_RADIUS, sourceWireLen, 8),
    Materials.emissive(0x00ffaa, 2)
  );
  sourceWire.rotation.z = Math.PI / 2;
  sourceWire.position.set(
    sourceX + sourceWireLen / 2 + 0.14,
    sourceY,
    BOARD_CENTER_Z + 0.1
  );
  group.add(sourceWire);

  // OUTPUT indicator to the right of C3
  const outputX = BOARD_CENTER_X + NODE_SPACING * 1 + NODE_SPACING * 0.7;
  const outputY = BOARD_CENTER_Y - NODE_SPACING; // row C level
  const outputGeo = new THREE.OctahedronGeometry(0.12, 0);
  const outputMat = Materials.emissive(0x444444, 0.5);
  const outputMesh = new THREE.Mesh(outputGeo, outputMat);
  outputMesh.position.set(outputX, outputY, BOARD_CENTER_Z + 0.1);
  group.add(outputMesh);

  // Output label
  const outputLabel = createTextPlane('Sortie', 0.45, 0.15, 12, '#ff6644', 'rgba(15,5,5,0.95)');
  outputLabel.position.set(outputX, outputY - 0.2, BOARD_CENTER_Z + 0.12);
  group.add(outputLabel);

  // Wire from C3 to output (visual only, lights up when C3 powered)
  const outputWire = new THREE.Mesh(
    new THREE.CylinderGeometry(WIRE_RADIUS, WIRE_RADIUS, sourceWireLen, 8),
    Materials.emissive(0x444444, 0.3)
  );
  outputWire.rotation.z = Math.PI / 2;
  outputWire.position.set(
    outputX - sourceWireLen / 2 - 0.14,
    outputY,
    BOARD_CENTER_Z + 0.1
  );
  group.add(outputWire);

  // ── Build Node Grid ────────────────────────────────────────────────
  const nodeLabels = [['A1','A2','A3'],['B1','B2','B3'],['C1','C2','C3']];

  for (let r = 0; r < ROWS; r++) {
    nodes[r] = [];
    for (let c = 0; c < COLS; c++) {
      const x = BOARD_CENTER_X + (c - 1) * NODE_SPACING;
      const y = BOARD_CENTER_Y + (1 - r) * NODE_SPACING; // row 0 at top
      const z = BOARD_CENTER_Z + 0.1;

      // Metal pedestal base
      const pedestal = new THREE.Mesh(
        new THREE.CylinderGeometry(NODE_RADIUS * 0.6, NODE_RADIUS * 0.8, 0.06, 16),
        Materials.metal(0x3a4a5a)
      );
      pedestal.position.set(x, y, z);
      pedestal.rotation.x = Math.PI / 2;
      pedestal.castShadow = true;
      group.add(pedestal);

      // Node sphere (dark red = unpowered)
      const nodeMat = new THREE.MeshStandardMaterial({
        color: 0x661111,
        emissive: new THREE.Color(0x661111),
        emissiveIntensity: 0.3,
        roughness: 0.2,
        metalness: 0.5
      });
      const nodeMesh = new THREE.Mesh(
        new THREE.SphereGeometry(NODE_RADIUS, 24, 24),
        nodeMat
      );
      nodeMesh.position.set(x, y, z + 0.04);
      nodeMesh.castShadow = true;
      group.add(nodeMesh);

      // Point light at each node (starts very dim)
      const nodeLight = addPointLight(group, new THREE.Vector3(x, y, z + 0.15), 0x661111, 0.1, 1.0);

      // Label beneath node
      const label = createTextPlane(nodeLabels[r][c], 0.2, 0.1, 10, '#5577aa', 'rgba(8,15,25,0.9)');
      label.position.set(x, y - NODE_RADIUS - 0.1, z + 0.02);
      group.add(label);

      nodes[r][c] = {
        mesh: nodeMesh,
        mat: nodeMat,
        pedestal,
        light: nodeLight,
        powered: false,
        label: nodeLabels[r][c],
        x, y, z
      };
    }
  }

  // ── Build Wire Segments ────────────────────────────────────────────
  // All adjacent pairs (horizontal and vertical)
  function wireKey(r1, c1, r2, c2) {
    // Normalize key order
    if (r1 > r2 || (r1 === r2 && c1 > c2)) {
      return `${r2},${c2}-${r1},${c1}`;
    }
    return `${r1},${c1}-${r2},${c2}`;
  }

  function buildWire(r1, c1, r2, c2) {
    const n1 = nodes[r1][c1];
    const n2 = nodes[r2][c2];
    const key = wireKey(r1, c1, r2, c2);

    const dx = n2.x - n1.x;
    const dy = n2.y - n1.y;
    const len = Math.sqrt(dx * dx + dy * dy);

    const midX = (n1.x + n2.x) / 2;
    const midY = (n1.y + n2.y) / 2;
    const midZ = BOARD_CENTER_Z + 0.1;

    // Inactive wire (dark, slightly visible)
    const wireMat = new THREE.MeshStandardMaterial({
      color: 0x1a2a3a,
      roughness: 0.4,
      metalness: 0.6,
      transparent: true,
      opacity: 0.5
    });
    const wireGeo = new THREE.CylinderGeometry(WIRE_RADIUS, WIRE_RADIUS, len - NODE_RADIUS * 2.2, 8);
    const wireMesh = new THREE.Mesh(wireGeo, wireMat);
    wireMesh.position.set(midX, midY, midZ);

    // Orient cylinder along the line between nodes
    const angle = Math.atan2(dx, dy);
    wireMesh.rotation.z = -angle;
    // Cylinders are Y-aligned by default, so rotation around Z orients in the XY plane
    group.add(wireMesh);

    // Glow wire (overlaid, visible when active)
    const glowMat = new THREE.MeshStandardMaterial({
      color: 0x00ffaa,
      emissive: new THREE.Color(0x00ffaa),
      emissiveIntensity: 0,
      roughness: 0.1,
      metalness: 0.4,
      transparent: true,
      opacity: 0
    });
    const glowMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(WIRE_RADIUS + 0.008, WIRE_RADIUS + 0.008, len - NODE_RADIUS * 2.2, 8),
      glowMat
    );
    glowMesh.position.set(midX, midY, midZ + 0.005);
    glowMesh.rotation.z = -angle;
    group.add(glowMesh);

    // Clickable hitbox — larger invisible mesh for easier clicking
    const hitboxMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false
    });
    const hitbox = new THREE.Mesh(
      new THREE.BoxGeometry(
        r1 === r2 ? len - NODE_RADIUS * 2 : 0.15,
        r1 === r2 ? 0.15 : len - NODE_RADIUS * 2,
        0.15
      ),
      hitboxMat
    );
    hitbox.position.set(midX, midY, midZ + 0.05);
    group.add(hitbox);

    const wireData = {
      mesh: wireMesh,
      mat: wireMat,
      glowMesh,
      glowMat,
      hitbox,
      active: false,
      carrying: false,  // carrying power right now
      fromNode: [r1, c1],
      toNode: [r2, c2],
      midX, midY, midZ,
      len,
      angle
    };

    wires.set(key, wireData);

    // Register hitbox as interactive
    engine.registerInteractive(hitbox, {
      type: 'click',
      prompt: `Toggle connexion ${nodeLabels[r1][c1]}-${nodeLabels[r2][c2]}`,
      icon: '\u26A1',
      onInteract() {
        if (solved) return;
        toggleWire(key);
      }
    });

    return wireData;
  }

  // Horizontal wires (same row, adjacent columns)
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS - 1; c++) {
      buildWire(r, c, r, c + 1);
    }
  }

  // Vertical wires (same column, adjacent rows)
  for (let r = 0; r < ROWS - 1; r++) {
    for (let c = 0; c < COLS; c++) {
      buildWire(r, c, r + 1, c);
    }
  }

  // ── Wire Toggle Logic ──────────────────────────────────────────────
  function toggleWire(key) {
    const wire = wires.get(key);
    if (!wire) return;

    wire.active = !wire.active;
    engine.playEffect('click');

    if (wire.active) {
      // Show wire as active (teal/green hint)
      wire.mat.color.setHex(0x225544);
      wire.mat.opacity = 0.9;
      wire.glowMat.opacity = 0.4;
      wire.glowMat.emissiveIntensity = 0.5;
    } else {
      // Hide wire (dark)
      wire.mat.color.setHex(0x1a2a3a);
      wire.mat.opacity = 0.5;
      wire.glowMat.opacity = 0;
      wire.glowMat.emissiveIntensity = 0;
    }

    // Recalculate power flow
    propagatePower();
  }

  // ── Power Propagation (BFS from source node A1 = [0,0]) ───────────
  function propagatePower() {
    // Reset all nodes
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        nodes[r][c].powered = false;
      }
    }

    // Reset all wire carrying state
    for (const wire of wires.values()) {
      wire.carrying = false;
    }

    // BFS from source node (0,0)
    const visited = new Set();
    const queue = [[0, 0]];
    visited.add('0,0');
    nodes[0][0].powered = true;

    while (queue.length > 0) {
      const [cr, cc] = queue.shift();

      // Check all four neighbors
      const neighbors = [
        [cr - 1, cc], [cr + 1, cc],
        [cr, cc - 1], [cr, cc + 1]
      ];

      for (const [nr, nc] of neighbors) {
        if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
        const nKey = `${nr},${nc}`;
        if (visited.has(nKey)) continue;

        const wKey = wireKey(cr, cc, nr, nc);
        const wire = wires.get(wKey);
        if (wire && wire.active) {
          visited.add(nKey);
          nodes[nr][nc].powered = true;
          wire.carrying = true;
          queue.push([nr, nc]);
        }
      }
    }

    // Update node visuals
    updateNodeVisuals();

    // Check win condition: all 9 nodes powered AND C3 powered (output reached)
    let allPowered = true;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (!nodes[r][c].powered) allPowered = false;
      }
    }

    if (allPowered && nodes[2][2].powered && !solved) {
      onSolved();
    }
  }

  // ── Node Visual Updates ────────────────────────────────────────────
  function updateNodeVisuals() {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const node = nodes[r][c];
        if (node.powered) {
          // Powered: bright green
          node.mat.color.setHex(0x00ff88);
          node.mat.emissive.setHex(0x00ff88);
          node.mat.emissiveIntensity = 2.5;
          node.light.color.setHex(0x00ff88);
          node.light.intensity = 1.2;
        } else {
          // Unpowered: dark red
          node.mat.color.setHex(0x661111);
          node.mat.emissive.setHex(0x661111);
          node.mat.emissiveIntensity = 0.3;
          node.light.color.setHex(0x661111);
          node.light.intensity = 0.1;
        }
      }
    }

    // Update wire glow based on carrying
    for (const wire of wires.values()) {
      if (wire.active && wire.carrying) {
        wire.glowMat.color.setHex(0x00ffaa);
        wire.glowMat.emissive.setHex(0x00ffaa);
        wire.glowMat.emissiveIntensity = 2.0;
        wire.glowMat.opacity = 0.9;
        wire.mat.color.setHex(0x00aa66);
        wire.mat.opacity = 1.0;
      } else if (wire.active) {
        wire.glowMat.color.setHex(0x337755);
        wire.glowMat.emissive.setHex(0x337755);
        wire.glowMat.emissiveIntensity = 0.5;
        wire.glowMat.opacity = 0.4;
        wire.mat.color.setHex(0x225544);
        wire.mat.opacity = 0.9;
      } else {
        wire.glowMat.emissiveIntensity = 0;
        wire.glowMat.opacity = 0;
        wire.mat.color.setHex(0x1a2a3a);
        wire.mat.opacity = 0.5;
      }
    }

    // Update output indicator
    if (nodes[2][2].powered) {
      outputMat.color.setHex(0x00ffaa);
      outputMat.emissive.setHex(0x00ffaa);
      outputMat.emissiveIntensity = 3;
      outputWire.material.color.setHex(0x00ffaa);
      outputWire.material.emissive.setHex(0x00ffaa);
      outputWire.material.emissiveIntensity = 2;
    } else {
      outputMat.color.setHex(0x444444);
      outputMat.emissive.setHex(0x444444);
      outputMat.emissiveIntensity = 0.5;
      outputWire.material.color.setHex(0x444444);
      outputWire.material.emissive.setHex(0x444444);
      outputWire.material.emissiveIntensity = 0.3;
    }
  }

  // ── Power Flow Animation Particles ─────────────────────────────────
  // Small bright points that travel along carrying wires
  const FLOW_PARTICLE_COUNT = 24;
  const flowParticleGeo = new THREE.BufferGeometry();
  const flowPositions = new Float32Array(FLOW_PARTICLE_COUNT * 3);
  const flowAges = new Float32Array(FLOW_PARTICLE_COUNT);
  const flowAssigned = new Int32Array(FLOW_PARTICLE_COUNT); // which wire index

  for (let i = 0; i < FLOW_PARTICLE_COUNT; i++) {
    flowPositions[i * 3] = 0;
    flowPositions[i * 3 + 1] = -100; // offscreen
    flowPositions[i * 3 + 2] = 0;
    flowAges[i] = Math.random();
    flowAssigned[i] = -1;
  }

  flowParticleGeo.setAttribute('position', new THREE.BufferAttribute(flowPositions, 3));

  const flowParticleMat = new THREE.PointsMaterial({
    size: 0.04,
    color: 0x88ffcc,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  const flowPoints = new THREE.Points(flowParticleGeo, flowParticleMat);
  group.add(flowPoints);

  function updateFlowParticles(delta) {
    // Get list of carrying wire keys
    const carryingWires = [];
    for (const [key, wire] of wires) {
      if (wire.active && wire.carrying) {
        carryingWires.push(wire);
      }
    }

    const pos = flowParticleGeo.attributes.position;

    for (let i = 0; i < FLOW_PARTICLE_COUNT; i++) {
      flowAges[i] += delta * (1.5 + Math.random() * 0.5);

      if (flowAges[i] > 1.0 || flowAssigned[i] === -1) {
        // Reassign to a random carrying wire
        if (carryingWires.length === 0) {
          pos.array[i * 3 + 1] = -100;
          flowAssigned[i] = -1;
          continue;
        }
        flowAges[i] = 0;
        flowAssigned[i] = Math.floor(Math.random() * carryingWires.length);
      }

      if (flowAssigned[i] >= 0 && flowAssigned[i] < carryingWires.length) {
        const wire = carryingWires[flowAssigned[i]];
        const n1 = nodes[wire.fromNode[0]][wire.fromNode[1]];
        const n2 = nodes[wire.toNode[0]][wire.toNode[1]];
        const t = flowAges[i];

        pos.array[i * 3]     = n1.x + (n2.x - n1.x) * t;
        pos.array[i * 3 + 1] = n1.y + (n2.y - n1.y) * t;
        pos.array[i * 3 + 2] = BOARD_CENTER_Z + 0.15;
      } else {
        pos.array[i * 3 + 1] = -100;
      }
    }

    pos.needsUpdate = true;
  }

  // ── Source Sparks ──────────────────────────────────────────────────
  const sourceSparks = engine.addSparks(
    new THREE.Vector3(sourceX, sourceY, BOARD_CENTER_Z + 0.2)
  );

  // ── Technician's Manual (French) ───────────────────────────────────
  const manualMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.35, 0.45, 0.04),
    new THREE.MeshStandardMaterial({ color: 0x2a4a3a, roughness: 0.8, metalness: 0.1 })
  );
  manualMesh.position.set(3.5, 1.0, ROOM_D / 2 - 0.5);
  manualMesh.rotation.x = -0.35;
  manualMesh.castShadow = true;
  group.add(manualMesh);

  // Manual's table
  const manualTable = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 0.05, 0.5),
    Materials.metal(0x3a3a4a)
  );
  manualTable.position.set(3.5, 0.78, ROOM_D / 2 - 0.5);
  manualTable.castShadow = true;
  manualTable.receiveShadow = true;
  group.add(manualTable);

  // Table legs
  for (const dx of [-0.35, 0.35]) {
    for (const dz of [-0.2, 0.2]) {
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.02, 0.78, 6),
        Materials.metal(0x3a3a4a)
      );
      leg.position.set(3.5 + dx, 0.39, ROOM_D / 2 - 0.5 + dz);
      group.add(leg);
    }
  }

  engine.registerInteractive(manualMesh, {
    type: 'click',
    prompt: 'Read manual / Lire le manuel',
    icon: '\uD83D\uDCD6',
    onInteract() {
      engine.showNarrative('Manuel du Technicien', MANUAL_HTML);
    }
  });

  // ── Status Display (powered node count) ────────────────────────────
  const statusCanvas = document.createElement('canvas');
  statusCanvas.width = 512;
  statusCanvas.height = 128;
  const statusCtx = statusCanvas.getContext('2d');
  const statusTexture = new THREE.CanvasTexture(statusCanvas);
  statusTexture.colorSpace = THREE.SRGBColorSpace;

  const statusMat = new THREE.MeshStandardMaterial({
    map: statusTexture,
    emissive: new THREE.Color(0x00aa66),
    emissiveIntensity: 0.4,
    emissiveMap: statusTexture,
    roughness: 0.2,
    metalness: 0.3
  });

  const statusMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1.0, 0.25),
    statusMat
  );
  statusMesh.position.set(BOARD_CENTER_X, BOARD_CENTER_Y - boardH / 2 - 0.25, BOARD_CENTER_Z + 0.06);
  group.add(statusMesh);

  function updateStatusDisplay() {
    let poweredCount = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (nodes[r][c].powered) poweredCount++;
      }
    }

    statusCtx.fillStyle = '#060e14';
    statusCtx.fillRect(0, 0, 512, 128);

    // Status bar
    const barWidth = 380;
    const barX = 66;
    const barY = 30;
    const barH = 30;

    // Background bar
    statusCtx.fillStyle = '#1a2a3a';
    statusCtx.fillRect(barX, barY, barWidth, barH);

    // Fill bar
    const fillFrac = poweredCount / 9;
    const fillColor = poweredCount === 9 ? '#00ff88' : '#00aa66';
    statusCtx.fillStyle = fillColor;
    statusCtx.fillRect(barX, barY, barWidth * fillFrac, barH);

    // Border
    statusCtx.strokeStyle = '#2a4a5a';
    statusCtx.lineWidth = 2;
    statusCtx.strokeRect(barX, barY, barWidth, barH);

    // Count text
    statusCtx.fillStyle = poweredCount === 9 ? '#00ff88' : '#88bbaa';
    statusCtx.font = 'bold 24px Courier New';
    statusCtx.textAlign = 'center';
    statusCtx.textBaseline = 'middle';
    statusCtx.fillText(`${poweredCount}/9 Alimente`, 256, barY + barH + 30);

    // Left label
    statusCtx.fillStyle = '#557788';
    statusCtx.font = '18px Courier New';
    statusCtx.textAlign = 'right';
    statusCtx.fillText('0', barX - 8, barY + barH / 2);

    // Right label
    statusCtx.textAlign = 'left';
    statusCtx.fillText('9', barX + barWidth + 8, barY + barH / 2);

    statusTexture.needsUpdate = true;
  }

  updateStatusDisplay();

  // ── Vocabulary Wall Panel ──────────────────────────────────────────
  const vocabPanel = createTextPlane(
    'VOCABULAIRE: distribuer - proportion - circuit - conduire - generer - efficace - sequence',
    1.8, 0.25, 11, '#6699aa', 'rgba(8,16,24,0.95)'
  );
  vocabPanel.position.set(-ROOM_W / 2 + 0.05, 3.2, 0);
  vocabPanel.rotation.y = Math.PI / 2;
  group.add(vocabPanel);

  // ── "Noeud" / "Connexion" labels on wall ───────────────────────────
  const noeudLabel = createTextPlane('Noeud = Node', 0.5, 0.12, 11, '#55aa88', 'rgba(8,16,24,0.9)');
  noeudLabel.position.set(-ROOM_W / 2 + 0.05, 2.8, -1.5);
  noeudLabel.rotation.y = Math.PI / 2;
  group.add(noeudLabel);

  const connexionLabel = createTextPlane('Connexion = Wire', 0.55, 0.12, 11, '#55aa88', 'rgba(8,16,24,0.9)');
  connexionLabel.position.set(-ROOM_W / 2 + 0.05, 2.5, -1.5);
  connexionLabel.rotation.y = Math.PI / 2;
  group.add(connexionLabel);

  // ── Hint Monitor (turns on after time) ─────────────────────────────
  const monitorHousing = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.65, 0.08),
    Materials.metal(0x2a2a3a)
  );
  monitorHousing.position.set(ROOM_W / 2 - 0.1, 2.0, -1.5);
  monitorHousing.rotation.y = -Math.PI / 2;
  group.add(monitorHousing);

  let monitorScreen = createHintMonitor(0);
  monitorScreen.position.set(ROOM_W / 2 - 0.13, 2.0, -1.5);
  monitorScreen.rotation.y = -Math.PI / 2;
  group.add(monitorScreen);

  const monitorShelf = new THREE.Mesh(
    new THREE.BoxGeometry(0.15, 0.04, 1.0),
    Materials.metal(0x3a3a4a)
  );
  monitorShelf.position.set(ROOM_W / 2 - 0.12, 1.63, -1.5);
  group.add(monitorShelf);

  function createHintMonitor(stage) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 384;
    const ctx = canvas.getContext('2d');

    if (stage === 0) {
      // Dark / standby
      ctx.fillStyle = '#060a0e';
      ctx.fillRect(0, 0, 512, 384);
      ctx.strokeStyle = 'rgba(30,50,60,0.3)';
      for (let y = 0; y < 384; y += 4) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(512, y);
        ctx.stroke();
      }
    } else if (stage === 1) {
      // Hint: "Think about an efficient path"
      ctx.fillStyle = '#0a1520';
      ctx.fillRect(0, 0, 512, 384);

      ctx.fillStyle = '#4ecdc4';
      ctx.font = 'bold 20px Courier New';
      ctx.textAlign = 'center';
      ctx.fillText('CONSEIL DU TECHNICIEN', 256, 40);

      ctx.fillStyle = '#88bbcc';
      ctx.font = '16px Courier New';
      ctx.fillText('The most efficient circuit', 256, 100);
      ctx.fillText('visits each node exactly once.', 256, 130);
      ctx.fillText('', 256, 160);
      ctx.fillText('Le circuit le plus efficace', 256, 190);
      ctx.fillText('visite chaque noeud une seule fois.', 256, 220);

      ctx.fillStyle = '#f4a261';
      ctx.font = 'bold 16px Courier New';
      ctx.fillText('Think: snake pattern!', 256, 290);
      ctx.fillText('Pensez: motif en serpent!', 256, 320);
    } else if (stage === 2) {
      // Bigger hint: show the path
      ctx.fillStyle = '#0a1520';
      ctx.fillRect(0, 0, 512, 384);

      ctx.fillStyle = '#f4a261';
      ctx.font = 'bold 18px Courier New';
      ctx.textAlign = 'center';
      ctx.fillText('SCHEMA DE CIRCUIT', 256, 30);

      // Draw mini grid
      const gx = 140, gy = 80, gs = 80;
      ctx.strokeStyle = '#2a4a5a';
      ctx.lineWidth = 1;

      // Draw all possible connections as dim lines
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          const x = gx + c * gs;
          const y = gy + r * gs;
          if (c < 2) {
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + gs, y);
            ctx.stroke();
          }
          if (r < 2) {
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x, y + gs);
            ctx.stroke();
          }
        }
      }

      // Draw solution path in bright green
      ctx.strokeStyle = '#00ff88';
      ctx.lineWidth = 4;
      // A1->B1->C1->C2->B2->A2->A3->B3->C3
      const path = [
        [0,0],[1,0],[2,0],[2,1],[1,1],[0,1],[0,2],[1,2],[2,2]
      ];
      ctx.beginPath();
      ctx.moveTo(gx + path[0][1] * gs, gy + path[0][0] * gs);
      for (let i = 1; i < path.length; i++) {
        ctx.lineTo(gx + path[i][1] * gs, gy + path[i][0] * gs);
      }
      ctx.stroke();

      // Draw nodes
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          const x = gx + c * gs;
          const y = gy + r * gs;
          ctx.fillStyle = '#00ff88';
          ctx.beginPath();
          ctx.arc(x, y, 8, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Source and output labels
      ctx.fillStyle = '#00ffaa';
      ctx.font = '14px Courier New';
      ctx.textAlign = 'right';
      ctx.fillText('SOURCE', gx - 20, gy + 5);
      ctx.textAlign = 'left';
      ctx.fillText('SORTIE', gx + 2 * gs + 20, gy + 2 * gs + 5);

      // Sequence text
      ctx.fillStyle = '#88bbcc';
      ctx.font = '14px Courier New';
      ctx.textAlign = 'center';
      ctx.fillText('A1 > B1 > C1 > C2 > B2 > A2 > A3 > B3 > C3', 256, 290);

      ctx.fillStyle = '#f4a261';
      ctx.font = 'bold 14px Courier New';
      ctx.fillText('Follow the sequence!', 256, 330);
      ctx.fillText('Suivez la sequence!', 256, 355);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;

    const mat = new THREE.MeshStandardMaterial({
      map: texture,
      emissive: new THREE.Color(stage > 0 ? 0x1a3040 : 0x050808),
      emissiveIntensity: stage > 0 ? 0.5 : 0.1,
      emissiveMap: texture,
      roughness: 0.1,
      metalness: 0.3
    });

    return new THREE.Mesh(new THREE.PlaneGeometry(0.82, 0.58), mat);
  }

  // ── Equipment / Atmosphere ─────────────────────────────────────────
  // Power distribution cabinets along right wall
  for (let i = 0; i < 3; i++) {
    const cabinet = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 1.8, 0.4),
      Materials.metal(0x2a3a4a)
    );
    cabinet.position.set(ROOM_W / 2 - 0.3, 0.9, 1.0 + i * 1.2);
    cabinet.castShadow = true;
    group.add(cabinet);

    // Cabinet status light
    const cabinetLight = new THREE.Mesh(
      new THREE.SphereGeometry(0.025, 8, 8),
      Materials.emissive(0x44aacc, 1.5)
    );
    cabinetLight.position.set(ROOM_W / 2 - 0.05, 1.6, 1.0 + i * 1.2);
    group.add(cabinetLight);
  }

  // Conduit pipes running along ceiling to the circuit board
  const conduitMat = Materials.metal(0x556677);
  for (const xOff of [-1.5, 0, 1.5]) {
    const conduit = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, ROOM_D - 1, 8),
      conduitMat
    );
    conduit.position.set(xOff, ROOM_H - 0.15, 0);
    conduit.rotation.x = Math.PI / 2;
    group.add(conduit);

    // Drop down to circuit board
    const drop = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, ROOM_H - BOARD_CENTER_Y - boardH / 2 - 0.2, 8),
      conduitMat
    );
    const dropLen = ROOM_H - BOARD_CENTER_Y - boardH / 2 - 0.2;
    drop.position.set(xOff, BOARD_CENTER_Y + boardH / 2 + 0.1 + dropLen / 2, -ROOM_D / 2 + 0.3);
    group.add(drop);
  }

  // Floor grating
  for (let z = -3; z <= 3; z += 1.5) {
    const grate = new THREE.Mesh(
      new THREE.BoxGeometry(ROOM_W - 0.5, 0.02, 0.3),
      Materials.metal(0x1a2a35)
    );
    grate.position.set(0, 0.01, z);
    grate.receiveShadow = true;
    group.add(grate);
  }

  // ── Exit Door ──────────────────────────────────────────────────────
  const exitDoor = createDoor(1.2, 2.2, 0x2d4a6f);
  exitDoor.group.position.set(-3.0, 0, ROOM_D / 2 - 0.05);
  exitDoor.group.rotation.y = Math.PI;
  group.add(exitDoor.group);

  result.doors.back = {
    position: new THREE.Vector3(-3.0, 1.1, ROOM_D / 2 - 0.05),
    onInteract: null
  };

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

  // ── Lighting ───────────────────────────────────────────────────────
  // Brighter ambient than Level 1
  // Main overhead spotlights
  addSpotlight(group, new THREE.Vector3(-2.5, 3.9, -1), new THREE.Vector3(-2.5, 0, -1), 0xddeeff, 2.0, 0.7);
  addSpotlight(group, new THREE.Vector3(2.5, 3.9, -1), new THREE.Vector3(2.5, 0, -1), 0xddeeff, 2.0, 0.7);

  // Spotlight on circuit board
  addSpotlight(group, new THREE.Vector3(0, 3.5, -1.5), new THREE.Vector3(0, 2.0, -ROOM_D / 2), 0xeeffff, 3.0, 0.5);

  // Accent lights
  addPointLight(group, new THREE.Vector3(0, 2.5, -ROOM_D / 2 + 0.5), 0x44ccaa, 1.2, 4);
  addPointLight(group, new THREE.Vector3(-4, 2.5, 0), 0x4488aa, 0.6, 4);
  addPointLight(group, new THREE.Vector3(4, 2.5, 0), 0x4488aa, 0.6, 4);

  // Warm light near manual
  addPointLight(group, new THREE.Vector3(3.5, 1.6, ROOM_D / 2 - 0.5), 0xffddaa, 0.5, 3);

  // ── Board title ────────────────────────────────────────────────────
  const boardTitle = createTextPlane(
    'PANNEAU DE DISTRIBUTION - LE CIRCUIT',
    1.8, 0.18, 13, '#44ccaa', 'rgba(6,14,20,0.95)'
  );
  boardTitle.position.set(BOARD_CENTER_X, BOARD_CENTER_Y + boardH / 2 + 0.2, BOARD_CENTER_Z + 0.06);
  group.add(boardTitle);

  // ── Hint System ────────────────────────────────────────────────────
  function updateHints() {
    // Stage 1: After 45s, show first monitor hint
    if (timeInRoom > 45 && hintStage < 1) {
      hintStage = 1;

      const newScreen = createHintMonitor(1);
      newScreen.position.copy(monitorScreen.position);
      newScreen.rotation.copy(monitorScreen.rotation);
      monitorScreen.geometry.dispose();
      monitorScreen.material.dispose();
      group.remove(monitorScreen);
      monitorScreen = newScreen;
      group.add(monitorScreen);

      engine.playEffect('powerup');
    }

    // Stage 2: After 90s, show the solution diagram
    if (timeInRoom > 90 && hintStage < 2) {
      hintStage = 2;

      const newScreen = createHintMonitor(2);
      newScreen.position.copy(monitorScreen.position);
      newScreen.rotation.copy(monitorScreen.rotation);
      monitorScreen.geometry.dispose();
      monitorScreen.material.dispose();
      group.remove(monitorScreen);
      monitorScreen = newScreen;
      group.add(monitorScreen);

      engine.playEffect('powerup');
    }
  }

  // ── Solve ──────────────────────────────────────────────────────────
  function onSolved() {
    solved = true;
    result.isComplete = true;

    engine.playEffect('clunk');
    setTimeout(() => engine.playEffect('success'), 400);

    // Exit door goes green
    exitDoor.lightMat.color.setHex(0x2a9d8f);
    exitDoor.lightMat.emissive.setHex(0x2a9d8f);

    // Source sparks burst
    sourceSparks.trigger();

    engine.hideObjective();
    engine.showCompletion('Circuit Complete! / Circuit termine!');

    if (gameState && gameState.onRoomComplete) {
      gameState.onRoomComplete('circuit');
    }
  }

  // ── Enter / Exit ───────────────────────────────────────────────────
  function enter() {
    engine.showRoomTitle('Le Circuit', 'The Circuit Room');

    engine.setRoomBounds(-ROOM_W / 2, ROOM_W / 2, -ROOM_D / 2, ROOM_D / 2);
    engine.camera.position.set(0, 1.6, 2.0);

    // Ambient electrical hum
    engine.playAmbient(100, 'sine', 0.05);
    engine.playAmbient(150, 'triangle', 0.02);

    // Dust particles
    engine.addDust({
      minX: -ROOM_W / 2, maxX: ROOM_W / 2,
      minZ: -ROOM_D / 2, maxZ: ROOM_D / 2,
      height: ROOM_H
    });

    engine.showObjective('Power all 9 nodes to reach the output / Alimenter les 9 noeuds');

    // Trigger initial sparks on source
    sourceSparks.trigger();

    // Initialize power (source is always powered)
    propagatePower();
  }

  function exit() {
    engine.stopAmbient();
    engine.clearParticles();
    engine.hideObjective();
  }

  // ── Update Loop ────────────────────────────────────────────────────
  function update(delta) {
    timeInRoom += delta;
    powerFlowTime += delta;

    // Source node pulsing
    const sourcePulse = 0.8 + 0.2 * Math.sin(timeInRoom * 3);
    sourceMat.emissiveIntensity = 3 * sourcePulse;
    sourceMesh.rotation.y += delta * 1.5;
    sourceMesh.rotation.x += delta * 0.8;

    // Periodic source sparks
    if (Math.random() < delta * 0.5) {
      sourceSparks.trigger();
    }

    // Animate powered node pulsing
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const node = nodes[r][c];
        if (node.powered) {
          const pulse = 2.0 + 0.5 * Math.sin(timeInRoom * 4 + r * 1.1 + c * 0.7);
          node.mat.emissiveIntensity = pulse;
          node.light.intensity = 0.8 + 0.4 * Math.sin(timeInRoom * 4 + r + c);
        }
      }
    }

    // Animate carrying wires pulsing
    for (const wire of wires.values()) {
      if (wire.active && wire.carrying) {
        const pulse = 1.5 + 0.5 * Math.sin(timeInRoom * 5 + wire.midX * 2 + wire.midY);
        wire.glowMat.emissiveIntensity = pulse;
      }
    }

    // Update power flow particles
    updateFlowParticles(delta);

    // Update status display
    updateStatusDisplay();

    // Win animation
    if (solved) {
      winAnimTime += delta;

      // Cascade green glow across room
      const cascadeIntensity = Math.min(winAnimTime * 2, 1.0);
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const node = nodes[r][c];
          const phase = (r + c) * 0.3;
          const intensity = 2.5 + 1.5 * Math.sin(winAnimTime * 6 - phase);
          node.mat.emissiveIntensity = intensity * cascadeIntensity;
          node.light.intensity = 1.5 * cascadeIntensity;
        }
      }

      // Output pulses brightly
      const outPulse = 3 + 2 * Math.sin(winAnimTime * 8);
      outputMat.emissiveIntensity = outPulse;
      outputMesh.rotation.y += delta * 3;
      outputMesh.rotation.x += delta * 2;

      return;
    }

    // Hints
    updateHints();
  }

  return result;
}

// ─── Narrative Content ────────────────────────────────────────────────────

const MANUAL_HTML = `
<div style="font-family: 'Courier New', monospace; line-height: 1.7; color: #c8d8e8;">

<p style="color: #00ffaa; font-weight: bold; border-bottom: 1px solid #334;">
  MANUEL DU TECHNICIEN - Panneau de Distribution<br>
  <span style="font-size: 0.85em; color: #8899aa;">Technician's Manual - Distribution Panel</span>
</p>

<p><strong style="color: #4ecdc4;">Section 1: Le Circuit</strong><br>
This distribution panel <em>generates</em> (<em>genere</em>) power from the
<strong>source d'energie</strong> on the left. Your task is to <em>distribute</em>
(<em>distribuer</em>) power to all nine <strong>noeuds</strong> (nodes) on the board.</p>

<p><strong style="color: #4ecdc4;">Section 2: Les Connexions</strong><br>
Click on the wire segments between adjacent nodes to toggle each <strong>connexion</strong>.
Active wires <em>conduct</em> (<em>conduisent</em>) electricity from powered nodes to
unpowered ones. Power flows from the source through the circuit.</p>

<p><strong style="color: #4ecdc4;">Section 3: La Sortie</strong><br>
Power must reach the <strong>sortie</strong> (output) on the lower right. All nine nodes
must be <strong>alimente</strong> (powered) for the circuit to be complete.</p>

<p><strong style="color: #f4a261;">Section 4: Conseil Technique</strong><br>
The most <em>efficient</em> (<em>efficace</em>) path visits each node in the correct
<em>sequence</em>. A balanced <em>proportion</em> of connections ensures power reaches
everywhere. Too many branches can leave distant nodes unpowered.</p>

<p><strong style="color: #f4a261;">Astuce / Hint:</strong><br>
Think of a snake winding through the grid &mdash; <em>un serpent</em>. It visits every
square exactly once. Start from the top left and work your way down, zigzagging
across each row.</p>

<p style="color: #8899aa; font-style: italic; margin-top: 1.5em; border-top: 1px solid #334; padding-top: 0.5em;">
  <strong>Vocabulaire / Vocabulary:</strong><br>
  <em>distribuer</em> &mdash; to distribute<br>
  <em>la proportion</em> &mdash; proportion, balance<br>
  <em>le circuit</em> &mdash; circuit<br>
  <em>conduire</em> &mdash; to conduct (electricity)<br>
  <em>generer</em> &mdash; to generate<br>
  <em>efficace</em> &mdash; efficient<br>
  <em>la sequence</em> &mdash; sequence, order<br>
  <em>le noeud</em> &mdash; node<br>
  <em>la connexion</em> &mdash; connection, wire<br>
  <em>alimente</em> &mdash; powered, supplied<br>
  <em>hors tension</em> &mdash; unpowered, off<br>
  <em>la source d'energie</em> &mdash; the power source<br>
  <em>la sortie</em> &mdash; the output, exit
</p>

</div>
`;
