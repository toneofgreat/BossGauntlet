import * as THREE from 'three';
import {
  Engine, Materials, createRoom, createDoor, createTextPlane,
  createGauge, addSpotlight, addPointLight
} from '../engine.js';

// ─── Room 1: Le Miroir (The Mirror Room) ─────────────────────────────
// An abandoned calibration chamber. A beam of light enters through a
// crack in the left wall. The player rotates two mirrors to redirect
// the beam into a photosensor on the far wall, powering up the comms
// relay and unlocking the exit door.
//
// Educational integration:
//   Science  -- optics, angle of incidence = angle of reflection
//   French   -- wall inscriptions, panel labels, scientist's note
//   Math     -- reasoning about 45-degree reflection angles

const ROOM_W = 8;
const ROOM_H = 4;
const ROOM_D = 8;

// Beam constants
const BEAM_RADIUS    = 0.015;
const MAX_BOUNCES    = 5;
const MAX_SEG_LEN    = 20;
const SENSOR_HIT_TOL = 0.35;  // how close the beam must land to the sensor center

// ─── Helpers ──────────────────────────────────────────────────────────

/** Orient a thin cylinder so it spans from point A to point B. */
function positionBeamSegment(mesh, a, b) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  if (len < 0.001) { mesh.visible = false; return; }

  mesh.visible = true;
  mesh.scale.set(1, len, 1);

  // Place at midpoint
  mesh.position.lerpVectors(a, b, 0.5);

  // Orient along direction
  const up = new THREE.Vector3(0, 1, 0);
  const quat = new THREE.Quaternion();
  quat.setFromUnitVectors(up, dir.normalize());
  mesh.quaternion.copy(quat);
}

/** Create a single beam-segment cylinder (unit height, will be scaled). */
function makeBeamCylinder() {
  const geo = new THREE.CylinderGeometry(BEAM_RADIUS, BEAM_RADIUS, 1, 8, 1, true);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffffcc,
    transparent: true,
    opacity: 0.7,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.visible = false;
  mesh.frustumCulled = false;
  return mesh;
}

/** Create the glow halo that surrounds each beam segment. */
function makeBeamGlow() {
  const geo = new THREE.CylinderGeometry(BEAM_RADIUS * 4, BEAM_RADIUS * 4, 1, 8, 1, true);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffeeaa,
    transparent: true,
    opacity: 0.12,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.visible = false;
  mesh.frustumCulled = false;
  return mesh;
}

/** Build a mirror on a stand. Returns { group, mirrorMesh, normal (local) }. */
function buildMirror() {
  const group = new THREE.Group();

  // Stand base -- flat disc
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.22, 0.04, 16),
    Materials.metal(0x3a3a3a)
  );
  base.position.y = 0.02;
  base.receiveShadow = true;
  group.add(base);

  // Stand pole
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.025, 1.2, 8),
    Materials.metal(0x555555)
  );
  pole.position.y = 0.62;
  group.add(pole);

  // Pivot bracket (small horizontal piece)
  const bracket = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.06, 0.06),
    Materials.metal(0x666666)
  );
  bracket.position.y = 1.22;
  group.add(bracket);

  // Mirror surface -- thin box, reflective on +Z face
  const mirrorGeo = new THREE.BoxGeometry(0.6, 0.8, 0.03);
  const mirrorMat = new THREE.MeshStandardMaterial({
    color: 0xddeeff,
    roughness: 0.05,
    metalness: 0.95,
    envMapIntensity: 1.0
  });
  const mirrorMesh = new THREE.Mesh(mirrorGeo, mirrorMat);
  mirrorMesh.position.y = 1.22;
  mirrorMesh.castShadow = true;
  group.add(mirrorMesh);

  // Thin border frame around mirror
  const frameMat = Materials.metal(0x888888);
  const frameT = 0.025;
  const fW = 0.6, fH = 0.8;

  const top = new THREE.Mesh(new THREE.BoxGeometry(fW + frameT * 2, frameT, 0.04), frameMat);
  top.position.set(0, 1.22 + fH / 2 + frameT / 2, 0);
  group.add(top);

  const bot = new THREE.Mesh(new THREE.BoxGeometry(fW + frameT * 2, frameT, 0.04), frameMat);
  bot.position.set(0, 1.22 - fH / 2 - frameT / 2, 0);
  group.add(bot);

  const lf = new THREE.Mesh(new THREE.BoxGeometry(frameT, fH, 0.04), frameMat);
  lf.position.set(-fW / 2 - frameT / 2, 1.22, 0);
  group.add(lf);

  const rf = new THREE.Mesh(new THREE.BoxGeometry(frameT, fH, 0.04), frameMat);
  rf.position.set(fW / 2 + frameT / 2, 1.22, 0);
  group.add(rf);

  return { group, mirrorMesh };
}

// ─── Build Room ───────────────────────────────────────────────────────

export function buildMirrorRoom(engine, gameState) {
  // ── Room shell ──────────────────────────────────────────────────
  const room = createRoom(ROOM_W, ROOM_H, ROOM_D);
  const group = room.group;

  // ── State ───────────────────────────────────────────────────────
  let isComplete = false;
  let elapsed = 0;            // running clock for animation
  let sensorHitTimer = 0;     // how long beam has been on sensor
  const SENSOR_TRIGGER = 0.4; // seconds required on sensor to solve
  let doorAnimating = false;
  let doorOpenT = 0;

  // ── Light source (aperture on left wall, mid height) ────────────
  const sourcePos = new THREE.Vector3(-ROOM_W / 2 + 0.05, 1.5, -1.0);
  const sourceDir = new THREE.Vector3(1, 0, 0); // beams rightward (+X)

  // Small glowing aperture on the left wall
  const aperture = new THREE.Mesh(
    new THREE.CircleGeometry(0.08, 16),
    new THREE.MeshBasicMaterial({
      color: 0xffffcc,
      blending: THREE.AdditiveBlending,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide
    })
  );
  aperture.position.copy(sourcePos);
  aperture.position.x += 0.01;
  aperture.rotation.y = Math.PI / 2;
  group.add(aperture);

  // Glow ring around aperture
  const apertureRing = new THREE.Mesh(
    new THREE.RingGeometry(0.08, 0.14, 24),
    new THREE.MeshBasicMaterial({
      color: 0xffeeaa,
      transparent: true,
      opacity: 0.25,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    })
  );
  apertureRing.position.copy(aperture.position);
  apertureRing.rotation.y = Math.PI / 2;
  group.add(apertureRing);

  // Point light at aperture so it casts a warm glow
  addPointLight(group, sourcePos.clone().setX(sourcePos.x + 0.3), 0xffffcc, 1.5, 3);

  // ── Sensor (on right wall, mid height, offset in Z) ─────────────
  const sensorPos = new THREE.Vector3(ROOM_W / 2 - 0.05, 1.5, 1.0);

  // Sensor backing plate
  const sensorPlate = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.5, 0.5),
    Materials.metal(0x333333)
  );
  sensorPlate.position.copy(sensorPos);
  sensorPlate.position.x -= 0.03;
  group.add(sensorPlate);

  // Sensor lens (the actual target)
  const sensorMatInactive = new THREE.MeshStandardMaterial({
    color: 0xff3333, emissive: 0xff2222, emissiveIntensity: 1.5,
    roughness: 0.2, metalness: 0.5
  });
  const sensorMatActive = new THREE.MeshStandardMaterial({
    color: 0x33ff66, emissive: 0x22ff44, emissiveIntensity: 2.5,
    roughness: 0.2, metalness: 0.5
  });
  const sensorLens = new THREE.Mesh(
    new THREE.CircleGeometry(0.12, 24),
    sensorMatInactive
  );
  sensorLens.position.copy(sensorPos);
  sensorLens.rotation.y = -Math.PI / 2; // facing left (toward room)
  group.add(sensorLens);

  // Sensor point light (will change color on activation)
  const sensorLight = addPointLight(group, sensorPos.clone().setX(sensorPos.x - 0.3), 0xff3333, 0.8, 2.5);

  // ── Mirrors ─────────────────────────────────────────────────────
  // Position mirrors so a ~45-degree solution works:
  // Source shoots +X from left wall at (−4, 1.5, −1).
  // Mirror 1 at roughly (0, 0, −1) angled 45 deg to deflect beam toward +Z.
  // Mirror 2 at roughly (0, 0, 1) angled 45 deg to deflect beam toward +X.
  // Beam then hits sensor at (4, 1.5, 1).

  const mirror1 = buildMirror();
  mirror1.group.position.set(-0.5, 0, -1.0);
  mirror1.group.rotation.y = Math.PI / 4; // start at ~45-degree hint
  group.add(mirror1.group);

  const mirror2 = buildMirror();
  mirror2.group.position.set(-0.5, 0, 1.0);
  mirror2.group.rotation.y = -Math.PI / 4; // start at ~-45 hint but slightly off
  group.add(mirror2.group);

  // Slightly offset starting angles so it isn't solved immediately
  mirror1.group.rotation.y = Math.PI / 4 + 0.35;
  mirror2.group.rotation.y = -Math.PI / 4 - 0.30;

  const mirrors = [mirror1, mirror2];

  // ── Beam segments pool ──────────────────────────────────────────
  const beamSegments = [];
  const beamGlows = [];
  const beamGroup = new THREE.Group();
  group.add(beamGroup);

  for (let i = 0; i < MAX_BOUNCES + 1; i++) {
    const seg = makeBeamCylinder();
    beamGroup.add(seg);
    beamSegments.push(seg);

    const glow = makeBeamGlow();
    beamGroup.add(glow);
    beamGlows.push(glow);
  }

  // Small point lights along beam path for illumination
  const beamLights = [];
  for (let i = 0; i < 3; i++) {
    const pl = new THREE.PointLight(0xffffaa, 0, 3, 2);
    beamGroup.add(pl);
    beamLights.push(pl);
  }

  // ── Door (back wall, leads back to hub) ─────────────────────────
  const door = createDoor(1.2, 2.2, 0x2d4a6f);
  door.group.position.set(0, 0, -ROOM_D / 2 + 0.07);
  group.add(door.group);

  // ── French inscriptions ─────────────────────────────────────────
  // Left wall inscription
  const inscription1 = createTextPlane(
    'ALIGNEZ LE MIROIR AVEC LE CAPTEUR\n(Align the mirror with the sensor)',
    2.2, 0.5, 18, '#88ccff', 'rgba(8,16,32,0.85)'
  );
  inscription1.position.set(-ROOM_W / 2 + 0.02, 2.8, 1.5);
  inscription1.rotation.y = Math.PI / 2;
  group.add(inscription1);

  // Right wall inscription
  const inscription2 = createTextPlane(
    'LA LUMIERE EST LA CLE\n(Light is the key)',
    1.8, 0.45, 20, '#ffcc66', 'rgba(8,16,32,0.85)'
  );
  inscription2.position.set(ROOM_W / 2 - 0.02, 2.8, -1.0);
  inscription2.rotation.y = -Math.PI / 2;
  group.add(inscription2);

  // ── Status panel (back wall, French labels) ─────────────────────
  // Panel backing
  const panelBack = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 1.0, 0.05),
    Materials.metal(0x222233)
  );
  panelBack.position.set(2.0, 2.0, -ROOM_D / 2 + 0.06);
  group.add(panelBack);

  // Panel title
  const panelTitle = createTextPlane(
    'RELAIS DE COMMUNICATION',
    1.4, 0.2, 16, '#4ecdc4', 'rgba(5,12,25,0.95)'
  );
  panelTitle.position.set(2.0, 2.45, -ROOM_D / 2 + 0.09);
  group.add(panelTitle);

  // Source label
  const srcLabel = createTextPlane(
    'Source de lumiere: ACTIVE',
    1.3, 0.18, 14, '#88ff88', 'rgba(5,12,25,0.95)'
  );
  srcLabel.position.set(2.0, 2.15, -ROOM_D / 2 + 0.09);
  group.add(srcLabel);

  // Sensor label
  const sensorLabel = createTextPlane(
    'Capteur: HORS LIGNE',
    1.3, 0.18, 14, '#ff6666', 'rgba(5,12,25,0.95)'
  );
  sensorLabel.position.set(2.0, 1.90, -ROOM_D / 2 + 0.09);
  group.add(sensorLabel);

  // Status label (will be replaced on solve)
  const statusLabel = createTextPlane(
    'Statut: Hors ligne',
    1.3, 0.18, 14, '#ff6666', 'rgba(5,12,25,0.95)'
  );
  statusLabel.position.set(2.0, 1.65, -ROOM_D / 2 + 0.09);
  group.add(statusLabel);

  // ── Gauge on the panel ──────────────────────────────────────────
  const gauge = createGauge(0.15, 'Puissance');
  gauge.group.position.set(2.6, 2.0, -ROOM_D / 2 + 0.09);
  group.add(gauge.group);

  // ── Scientist's note (readable) ─────────────────────────────────
  const noteMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.35, 0.45),
    new THREE.MeshStandardMaterial({
      color: 0xeeddbb, roughness: 0.95, metalness: 0.0
    })
  );
  noteMesh.position.set(-2.5, 1.2, -ROOM_D / 2 + 0.06);
  group.add(noteMesh);

  // Small text hint on the note
  const noteLabel = createTextPlane(
    'NOTE', 0.3, 0.08, 10, '#332211', 'rgba(230,215,180,0.9)'
  );
  noteLabel.position.set(-2.5, 1.48, -ROOM_D / 2 + 0.07);
  group.add(noteLabel);

  // ── Decorative props ────────────────────────────────────────────
  // Cable conduits along ceiling edges
  const conduitMat = Materials.metal(0x2a2a2a);
  for (const zSign of [-1, 1]) {
    const conduit = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, ROOM_W, 8),
      conduitMat
    );
    conduit.rotation.z = Math.PI / 2;
    conduit.position.set(0, ROOM_H - 0.1, zSign * (ROOM_D / 2 - 0.1));
    group.add(conduit);
  }

  // Small equipment boxes on floor (atmospheric detail)
  for (const pos of [
    [3.0, 0.15, -2.5], [-3.0, 0.15, 2.5], [2.5, 0.15, 3.0]
  ]) {
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.3, 0.3),
      Materials.metal(0x2a3540)
    );
    box.position.set(...pos);
    box.castShadow = true;
    box.receiveShadow = true;
    group.add(box);
  }

  // ── Spotlights on interactive elements ──────────────────────────
  // Spotlight on mirror 1
  addSpotlight(group,
    new THREE.Vector3(-0.5, ROOM_H - 0.2, -1.0),
    new THREE.Vector3(-0.5, 0, -1.0),
    0x334466, 1.5, 0.6
  );
  // Spotlight on mirror 2
  addSpotlight(group,
    new THREE.Vector3(-0.5, ROOM_H - 0.2, 1.0),
    new THREE.Vector3(-0.5, 0, 1.0),
    0x334466, 1.5, 0.6
  );
  // Spotlight on sensor
  addSpotlight(group,
    new THREE.Vector3(ROOM_W / 2 - 0.8, ROOM_H - 0.2, 1.0),
    sensorPos,
    0x442222, 1.0, 0.5
  );
  // Spotlight on panel
  addSpotlight(group,
    new THREE.Vector3(2.0, ROOM_H - 0.2, -ROOM_D / 2 + 0.8),
    new THREE.Vector3(2.0, 2.0, -ROOM_D / 2),
    0x223344, 1.0, 0.5
  );

  // ── Ambient fill light (very dim) ──────────────────────────────
  const ambientLight = new THREE.AmbientLight(0x112233, 0.15);
  group.add(ambientLight);

  // ── Ceiling lights (off initially, turn on at solve) ────────────
  const ceilingLights = [];
  for (const pos of [
    [-2, ROOM_H - 0.1, -2], [2, ROOM_H - 0.1, -2],
    [-2, ROOM_H - 0.1, 2],  [2, ROOM_H - 0.1, 2],
    [0, ROOM_H - 0.1, 0]
  ]) {
    const fixture = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.05, 0.4),
      Materials.metal(0x333333)
    );
    fixture.position.set(...pos);
    group.add(fixture);

    const lens = new THREE.Mesh(
      new THREE.PlaneGeometry(0.35, 0.35),
      new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0.0
      })
    );
    lens.rotation.x = Math.PI / 2;
    lens.position.set(pos[0], pos[1] - 0.03, pos[2]);
    group.add(lens);

    const pl = new THREE.PointLight(0xfff8ee, 0, 6, 1.5);
    pl.position.set(...pos);
    group.add(pl);

    ceilingLights.push({ lens, light: pl });
  }

  // ─────────────────────────────────────────────────────────────────
  // Raycasting for beam physics
  // ─────────────────────────────────────────────────────────────────
  const raycaster = new THREE.Raycaster();

  // We raycast against mirror meshes (their world-space box geometry)
  // and also against a virtual sensor plane.
  function getWorldNormal(mirrorObj) {
    // The mirror's local normal is +Z, transformed to world
    const normal = new THREE.Vector3(0, 0, 1);
    normal.applyQuaternion(mirrorObj.group.getWorldQuaternion(new THREE.Quaternion()));
    return normal.normalize();
  }

  function reflect(incident, normal) {
    // r = d - 2(d.n)n
    const d = incident.clone().normalize();
    const dot = d.dot(normal);
    return d.sub(normal.clone().multiplyScalar(2 * dot)).normalize();
  }

  /**
   * Trace the beam through the scene. Returns an array of path points
   * and whether the sensor was hit.
   */
  function traceBeam() {
    const path = [sourcePos.clone()];
    let dir = sourceDir.clone();
    let origin = sourcePos.clone();
    let hitSensor = false;

    // Collect mirror meshes for raycasting (use the mirrorMesh of each)
    const mirrorMeshes = mirrors.map(m => m.mirrorMesh);

    for (let bounce = 0; bounce <= MAX_BOUNCES; bounce++) {
      raycaster.set(origin, dir);
      raycaster.far = MAX_SEG_LEN;
      raycaster.near = 0.01;

      // Test against mirror meshes
      const hits = raycaster.intersectObjects(mirrorMeshes, false);

      if (hits.length > 0) {
        const hit = hits[0];
        path.push(hit.point.clone());

        // Determine which mirror was hit
        const mirrorIdx = mirrorMeshes.indexOf(hit.object);
        if (mirrorIdx !== -1) {
          const normal = getWorldNormal(mirrors[mirrorIdx]);
          // Make sure normal faces toward the incoming beam
          if (normal.dot(dir) > 0) normal.negate();
          dir = reflect(dir, normal);
          origin = hit.point.clone().add(dir.clone().multiplyScalar(0.02)); // offset
        }
      } else {
        // No mirror hit -- project beam forward and check proximity to sensor
        const endPoint = origin.clone().add(dir.clone().multiplyScalar(MAX_SEG_LEN));

        // Check if beam passes near the sensor
        // Project sensor onto the ray to find closest approach
        const toSensor = new THREE.Vector3().subVectors(sensorPos, origin);
        const t = toSensor.dot(dir);
        if (t > 0 && t < MAX_SEG_LEN) {
          const closestPoint = origin.clone().add(dir.clone().multiplyScalar(t));
          const dist = closestPoint.distanceTo(sensorPos);
          if (dist < SENSOR_HIT_TOL) {
            path.push(sensorPos.clone());
            hitSensor = true;
          } else {
            // Beam fades into distance (clip to room bounds roughly)
            const clipped = clipToRoom(origin, dir);
            path.push(clipped);
          }
        } else {
          const clipped = clipToRoom(origin, dir);
          path.push(clipped);
        }
        break;
      }
    }

    return { path, hitSensor };
  }

  /** Clip a ray to approximate room walls for visual termination. */
  function clipToRoom(origin, dir) {
    // Find intersection with the 6 room planes
    let bestT = MAX_SEG_LEN;
    const halfW = ROOM_W / 2, halfD = ROOM_D / 2;
    const planes = [
      { normal: new THREE.Vector3(1, 0, 0), d: halfW },   // +X wall
      { normal: new THREE.Vector3(-1, 0, 0), d: halfW },  // -X wall
      { normal: new THREE.Vector3(0, 0, 1), d: halfD },   // +Z wall
      { normal: new THREE.Vector3(0, 0, -1), d: halfD },  // -Z wall
      { normal: new THREE.Vector3(0, 1, 0), d: ROOM_H },  // ceiling
      { normal: new THREE.Vector3(0, -1, 0), d: 0 },      // floor
    ];

    for (const plane of planes) {
      const denom = dir.dot(plane.normal);
      if (Math.abs(denom) < 0.0001) continue;
      // plane equation: normal . P = d  -> in our coordinate system the
      // plane at +X wall is x = halfW, so normal.(origin + t*dir) = halfW
      // => t = (d - normal.origin) / denom
      // But our planes are axis-aligned with the convention that the
      // surface is at  normal . P = +-d.
      // For +X wall (x = halfW): normal=(1,0,0), point on plane dot normal = halfW
      const t = (plane.d * (plane.normal.x + plane.normal.y + plane.normal.z > 0 ? 1 : -1) -
                 plane.normal.dot(origin)) / denom;
      // Simplify: use direct axis intersection
      if (false) { void t; } // discard complex calc, do it directly below
    }

    // Direct axis-aligned intersection (simpler & correct)
    const axes = [
      { axis: 'x', min: -halfW, max: halfW },
      { axis: 'y', min: 0,      max: ROOM_H },
      { axis: 'z', min: -halfD, max: halfD },
    ];

    bestT = MAX_SEG_LEN;
    for (const { axis, min, max } of axes) {
      const o = origin[axis];
      const d = dir[axis];
      if (Math.abs(d) < 0.0001) continue;

      const t1 = (min - o) / d;
      const t2 = (max - o) / d;

      if (t1 > 0.01 && t1 < bestT) bestT = t1;
      if (t2 > 0.01 && t2 < bestT) bestT = t2;
    }

    return origin.clone().add(dir.clone().multiplyScalar(bestT - 0.05));
  }

  // ─── Update beam visuals ────────────────────────────────────────
  function updateBeamVisuals(path) {
    const segCount = path.length - 1;

    for (let i = 0; i < beamSegments.length; i++) {
      if (i < segCount) {
        positionBeamSegment(beamSegments[i], path[i], path[i + 1]);
        positionBeamSegment(beamGlows[i], path[i], path[i + 1]);

        // Pulse beam opacity
        const pulse = 0.6 + 0.15 * Math.sin(elapsed * 4 + i * 1.2);
        beamSegments[i].material.opacity = pulse;
        beamGlows[i].material.opacity = 0.08 + 0.04 * Math.sin(elapsed * 3 + i);
      } else {
        beamSegments[i].visible = false;
        beamGlows[i].visible = false;
      }
    }

    // Position beam lights along the path for scene illumination
    for (let i = 0; i < beamLights.length; i++) {
      if (i < segCount) {
        const midPt = new THREE.Vector3().lerpVectors(path[i], path[i + 1], 0.5);
        beamLights[i].position.copy(midPt);
        beamLights[i].intensity = 0.6 + 0.2 * Math.sin(elapsed * 3 + i);
      } else {
        beamLights[i].intensity = 0;
      }
    }
  }

  // ─── Solve sequence ─────────────────────────────────────────────
  function onSolve() {
    if (isComplete) return;
    isComplete = true;
    gameState.mirrorComplete = true;

    engine.playEffect('success');

    // Update sensor visuals
    sensorLens.material = sensorMatActive;
    sensorLight.color.setHex(0x33ff66);
    sensorLight.intensity = 2.0;

    // Update panel labels
    replacePanelLabel(sensorLabel, 'Capteur: EN LIGNE', '#66ff88');
    replacePanelLabel(statusLabel, 'Statut: En ligne', '#66ff88');

    // Set gauge to full
    gauge.setValue(1.0);

    // Cascade ceiling lights on
    ceilingLights.forEach((cl, i) => {
      setTimeout(() => {
        cl.light.intensity = 2.0;
        cl.lens.material.opacity = 0.6;
        engine.playEffect('click');
      }, 300 + i * 200);
    });

    // Raise ambient
    setTimeout(() => {
      ambientLight.intensity = 0.5;
    }, 1500);

    // Open door
    setTimeout(() => {
      engine.playEffect('powerup');
      door.lightMat.color.setHex(0x2a9d8f);
      door.lightMat.emissive.setHex(0x2a9d8f);
      doorAnimating = true;
      engine.showCompletion('Communications relay online! / Relais en ligne!');
    }, 2000);
  }

  /** Replace a panel label mesh's texture in-place. */
  function replacePanelLabel(mesh, newText, color) {
    const newLabel = createTextPlane(newText, 1.3, 0.18, 14, color, 'rgba(5,12,25,0.95)');
    mesh.material.dispose();
    mesh.material = newLabel.material;
    mesh.geometry.dispose();
    mesh.geometry = newLabel.geometry;
  }

  // ─── Register interactives ──────────────────────────────────────
  function registerAll() {
    // Mirror 1
    engine.registerInteractive(mirror1.mirrorMesh, {
      type: 'adjust',
      prompt: 'Adjust mirror / Ajuster le miroir',
      icon: '🪞',
      onInteract: () => {
        engine.playEffect('click');
      },
      onAdjust: (dx, _dy) => {
        if (isComplete) return;
        mirror1.group.rotation.y += dx * 0.005;
        // Clamp rotation to prevent nonsensical angles
        mirror1.group.rotation.y = clampAngle(mirror1.group.rotation.y, -Math.PI, Math.PI);
        engine.playEffect('valve');
      }
    });

    // Mirror 2
    engine.registerInteractive(mirror2.mirrorMesh, {
      type: 'adjust',
      prompt: 'Adjust mirror / Ajuster le miroir',
      icon: '🪞',
      onInteract: () => {
        engine.playEffect('click');
      },
      onAdjust: (dx, _dy) => {
        if (isComplete) return;
        mirror2.group.rotation.y += dx * 0.005;
        mirror2.group.rotation.y = clampAngle(mirror2.group.rotation.y, -Math.PI, Math.PI);
        engine.playEffect('valve');
      }
    });

    // Scientist's note (readable)
    engine.registerInteractive(noteMesh, {
      type: 'click',
      prompt: 'Read note / Lire la note',
      icon: '📝',
      onInteract: () => {
        engine.playEffect('click');
        engine.showNarrative('Note du Dr. Beaumont', `
          <p style="font-style:italic; color:#aabbcc;">
            "Procedure de calibration - Station Lumiere"
          </p>
          <p>
            Pour realigner le relais, diriger le faisceau lumineux
            de la source vers le capteur optique.
          </p>
          <p>
            Utilisez les deux miroirs de calibration. Souvenez-vous:
            <strong>l'angle d'incidence est egal a l'angle de reflexion.</strong>
          </p>
          <hr style="border-color:#334455;">
          <p style="color:#88aacc; font-size:0.9em;">
            <em>Calibration Procedure - Station Lumiere</em>
          </p>
          <p style="color:#88aacc; font-size:0.9em;">
            To realign the relay, direct the light beam from the
            source to the optical sensor.
          </p>
          <p style="color:#88aacc; font-size:0.9em;">
            Use the two calibration mirrors. Remember:
            <strong>the angle of incidence equals the angle of reflection.</strong>
          </p>
          <p style="color:#667788; font-size:0.8em; margin-top:16px;">
            - Dr. M. Beaumont, Optics Division
          </p>
        `);
      }
    });

    // Door interaction
    engine.registerInteractive(door.doorPanel, {
      type: 'click',
      prompt: isComplete ? 'Exit room / Sortir' : 'Locked / Verrouille',
      icon: '🚪',
      onInteract: () => {
        if (isComplete && doorOpenT >= 1) {
          if (roomAPI.doors.back.onInteract) {
            roomAPI.doors.back.onInteract();
          }
        } else if (!isComplete) {
          engine.playEffect('alarm');
        }
      }
    });
  }

  function clampAngle(angle, min, max) {
    return Math.max(min, Math.min(max, angle));
  }

  // ─── Room API ───────────────────────────────────────────────────
  const roomAPI = {
    group,

    get isComplete() { return isComplete; },

    doors: {
      back: {
        position: new THREE.Vector3(0, 0, -ROOM_D / 2 + 0.5),
        onInteract: null  // set by game manager
      }
    },

    enter() {
      // Camera start position: near the front wall, facing inward
      engine.camera.position.set(0, 1.6, ROOM_D / 2 - 1.5);
      engine.camera.lookAt(0, 1.6, 0);

      engine.setRoomBounds(-ROOM_W / 2, ROOM_W / 2, -ROOM_D / 2, ROOM_D / 2);

      engine.showRoomTitle('Le Miroir', 'The Mirror Room');

      // Ambient hum
      engine.playAmbient(55, 'sine', 0.06);
      engine.playAmbient(82, 'triangle', 0.03);

      // Dust particles throughout the room
      engine.addDust({
        minX: -ROOM_W / 2, maxX: ROOM_W / 2,
        minZ: -ROOM_D / 2, maxZ: ROOM_D / 2,
        height: ROOM_H
      });

      // Extra dense dust near the beam path (Y ~1.5)
      engine.addDust({
        minX: -ROOM_W / 2, maxX: ROOM_W / 2,
        minZ: -2, maxZ: 2,
        height: 2.5
      });

      // Objective
      engine.showObjective('Redirect the light beam to the sensor / Dirigez le faisceau vers le capteur');

      // Register all interactive objects
      registerAll();
    },

    exit() {
      engine.stopAmbient();
      engine.clearParticles();
      engine.hideObjective();
    },

    update(delta) {
      elapsed += delta;

      // Pulse aperture glow
      aperture.material.opacity = 0.7 + 0.2 * Math.sin(elapsed * 5);
      apertureRing.material.opacity = 0.15 + 0.1 * Math.sin(elapsed * 3);

      // Trace the beam
      const { path, hitSensor } = traceBeam();

      // Update beam segment visuals
      updateBeamVisuals(path);

      // Sensor hit logic
      if (hitSensor && !isComplete) {
        sensorHitTimer += delta;
        // Gradually shift sensor color toward green as a preview
        const t = Math.min(sensorHitTimer / SENSOR_TRIGGER, 1.0);
        const r = 1.0 - t * 0.8;
        const g = 0.2 + t * 0.8;
        sensorMatInactive.emissive.setRGB(r, g, 0.1);
        sensorMatInactive.emissiveIntensity = 1.5 + t;
        sensorLight.color.setRGB(r, g, 0.1);
        sensorLight.intensity = 0.8 + t * 1.5;

        // Update gauge to show progress
        gauge.setValue(t * 0.8);

        if (sensorHitTimer >= SENSOR_TRIGGER) {
          onSolve();
        }
      } else if (!isComplete) {
        // Reset sensor if beam wanders off
        sensorHitTimer = Math.max(0, sensorHitTimer - delta * 2);
        const t = Math.min(sensorHitTimer / SENSOR_TRIGGER, 1.0);
        const r = 1.0 - t * 0.8;
        const g = 0.2 + t * 0.8;
        sensorMatInactive.emissive.setRGB(r, g, 0.1);
        sensorMatInactive.emissiveIntensity = 1.5 + t * 0.5;
        sensorLight.color.setRGB(r, g, 0.1);
        sensorLight.intensity = 0.8;
        gauge.setValue(t * 0.8);
      }

      // Post-solve: animate door opening (slide up)
      if (doorAnimating && doorOpenT < 1) {
        doorOpenT += delta * 0.8;
        if (doorOpenT > 1) doorOpenT = 1;
        door.doorPanel.position.y = 1.1 + doorOpenT * 2.2;

        // Update door interaction prompt once open
        if (doorOpenT >= 1) {
          engine.unregisterInteractive(door.doorPanel);
          engine.registerInteractive(door.doorPanel, {
            type: 'click',
            prompt: 'Exit room / Sortir',
            icon: '🚪',
            onInteract: () => {
              if (roomAPI.doors.back.onInteract) {
                roomAPI.doors.back.onInteract();
              }
            }
          });
        }
      }

      // Post-solve: pulse sensor glow
      if (isComplete) {
        sensorMatActive.emissiveIntensity = 2.0 + 0.5 * Math.sin(elapsed * 2);
        sensorLight.intensity = 2.0 + 0.5 * Math.sin(elapsed * 2);
      }
    }
  };

  return roomAPI;
}
