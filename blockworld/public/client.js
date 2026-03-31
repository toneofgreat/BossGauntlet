import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';

// ===== GLOBAL STATE =====
const socket = io(window.BLOCKWORLD_SERVER || '/');
let currentUser = null;
let activeCleanup = null; // cleanup function for current game

// Expose needed functions to window for inline onclick handlers
window.enterGame = enterGame;
window.exitToMenu = exitToMenu;
window.setBuildMode = setBuildMode;
window.selectTool = selectTool;
window.setTransformMode = setTransformMode;
window.deleteSelected = deleteSelected;
window.saveBuild = saveBuild;
window.startParkour = startParkour;
window.playBuild = playBuild;

// ===== SCREEN MANAGEMENT =====
function showScreen(name) {
  if (activeCleanup) { activeCleanup(); activeCleanup = null; }
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + name).classList.add('active');
}

function exitToMenu() {
  showScreen('menu');
  refreshMenu();
}

// ===== USERNAME SCREEN =====
const _submitBtn = document.querySelector('#username-form button[type="submit"]');
const _errEl = document.getElementById('username-error');

// Start in connecting state
_submitBtn.disabled = true;
_submitBtn.textContent = 'Connecting...';
_errEl.style.color = '#888';
_errEl.textContent = 'Connecting to server...';

socket.on('connect', () => {
  _submitBtn.disabled = false;
  _submitBtn.textContent = 'Enter World';
  _submitBtn.style.background = '';
  _errEl.textContent = '';
});

socket.on('disconnect', () => {
  _submitBtn.disabled = false;
  _submitBtn.textContent = '⚠ Server Offline — Click for Help';
  _submitBtn.style.background = 'linear-gradient(135deg,#883300,#cc4400)';
  _errEl.style.color = '#ff9944';
  _errEl.textContent = 'Lost connection to server.';
});

socket.on('connect_error', () => {
  _submitBtn.disabled = false;
  _submitBtn.textContent = '⚠ Server Offline — Click for Help';
  _submitBtn.style.background = 'linear-gradient(135deg,#883300,#cc4400)';
  _errEl.style.color = '#ff9944';
  _errEl.textContent = 'Cannot reach the server.';
});

document.getElementById('username-form').addEventListener('submit', e => {
  e.preventDefault();

  // Server offline — show help screen
  if (!socket.connected) {
    const offlineEl = document.getElementById('screen-offline');
    if (offlineEl) {
      document.getElementById('screen-username').classList.remove('active');
      offlineEl.classList.add('active');
    } else {
      alert('Server is not running!\n\nGo to glitch.com → New Project → Import from GitHub → toneofgreat/BossGauntlet\n\nThen paste the URL here and the game will work for everyone.');
    }
    return;
  }

  const val = document.getElementById('username-input').value.trim();
  _errEl.style.color = '#ff6060';
  _errEl.textContent = '';
  if (!val) { _errEl.textContent = 'Please enter a username'; return; }
  _submitBtn.disabled = true;
  _submitBtn.textContent = 'Entering...';
  socket.emit('register-username', val, res => {
    if (res.success) {
      currentUser = { username: res.username, ...res.user };
      showScreen('menu');
      refreshMenu();
    } else {
      _errEl.textContent = res.error;
      _submitBtn.disabled = false;
      _submitBtn.textContent = 'Enter World';
    }
  });
});

// ===== MENU SCREEN =====
function refreshMenu() {
  if (!currentUser) return;
  document.getElementById('menu-username').textContent = currentUser.username;
  const titleEl = document.getElementById('menu-title');
  if (currentUser.title === 'winner') titleEl.textContent = '🏆 Winner';
  else if (currentUser.title === 'cool person') titleEl.textContent = '😎 Cool Person';
  else titleEl.textContent = '';

  socket.emit('get-games', res => {
    const list = document.getElementById('user-builds-list');
    const noMsg = document.getElementById('no-builds-msg');
    list.innerHTML = '';
    if (!res.builds.length) { noMsg.style.display = 'block'; return; }
    noMsg.style.display = 'none';
    res.builds.forEach(build => {
      const card = document.createElement('div');
      card.className = 'game-card';
      card.innerHTML = `
        <div class="game-thumb" style="background:#1a1a2e;font-size:2rem;display:flex;align-items:center;justify-content:center;height:70px;border-radius:8px;">
          ${build.type === '2d' ? '🎮' : '🧱'}
        </div>
        <div class="game-info">
          <h3>${escHtml(build.name)}</h3>
          <p>By: ${escHtml(build.author)}</p>
          <div class="game-meta">▶ ${build.playCount} plays • ${build.type.toUpperCase()}</div>
        </div>
        <button class="btn-play">Play</button>
      `;
      card.querySelector('.btn-play').onclick = () => playBuild(build.id);
      list.appendChild(card);
    });
  });
}

document.getElementById('btn-build').addEventListener('click', () => {
  showScreen('build');
  initBuildMode();
});

socket.on('title-update', userData => {
  if (currentUser) Object.assign(currentUser, userData);
});

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ===========================
// ===== BUILD MODE ==========
// ===========================

let buildMode = '3d';
let build3D = null;
let build2D = null;

function initBuildMode() {
  buildMode = '3d';
  document.getElementById('btn-3d').classList.add('active');
  document.getElementById('btn-2d').classList.remove('active');
  document.getElementById('build-canvas-2d').style.display = 'none';
  document.getElementById('build-canvas-3d').style.display = 'block';
  document.getElementById('build-name-input').value = '';
  if (build3D) { build3D.cleanup(); build3D = null; }
  if (build2D) { build2D.cleanup(); build2D = null; }
  build3D = init3DBuild();
  document.getElementById('build-exit-btn').onclick = () => exitToMenu();
  activeCleanup = () => {
    if (build3D) { build3D.cleanup(); build3D = null; }
    if (build2D) { build2D.cleanup(); build2D = null; }
  };
}

function setBuildMode(mode) {
  if (mode === buildMode) return;
  buildMode = mode;
  document.getElementById('btn-3d').classList.toggle('active', mode === '3d');
  document.getElementById('btn-2d').classList.toggle('active', mode === '2d');
  if (mode === '3d') {
    document.getElementById('build-canvas-2d').style.display = 'none';
    document.getElementById('build-canvas-3d').style.display = 'block';
    if (build2D) { build2D.cleanup(); build2D = null; }
    build3D = init3DBuild();
    activeCleanup = () => { if (build3D) { build3D.cleanup(); build3D = null; } };
  } else {
    document.getElementById('build-canvas-3d').style.display = 'none';
    document.getElementById('build-canvas-2d').style.display = 'block';
    if (build3D) { build3D.cleanup(); build3D = null; }
    build2D = init2DBuild();
    activeCleanup = () => { if (build2D) { build2D.cleanup(); build2D = null; } };
  }
}

// Proxy tool/transform selection to current mode
function selectTool(type) {
  document.querySelectorAll('.tool-btn[data-type]').forEach(b => b.classList.toggle('active', b.dataset.type === type));
  if (build3D) build3D.setToolType(type);
  if (build2D) build2D.setToolType(type);
}

function setTransformMode(mode) {
  document.getElementById('btn-translate').classList.toggle('active', mode === 'translate');
  document.getElementById('btn-scale').classList.toggle('active', mode === 'scale');
  if (build3D) build3D.setTransformMode(mode);
  if (build2D) build2D.setTransformMode(mode);
}

function deleteSelected() {
  if (build3D) build3D.deleteSelected();
  if (build2D) build2D.deleteSelected();
}

function saveBuild() {
  const name = document.getElementById('build-name-input').value.trim();
  if (!name) { alert('Please enter a name for your build!'); return; }
  let buildData, type;
  if (buildMode === '3d' && build3D) {
    buildData = build3D.exportData();
    type = '3d';
  } else if (buildMode === '2d' && build2D) {
    buildData = build2D.exportData();
    type = '2d';
  } else { alert('Nothing to save!'); return; }
  socket.emit('save-build', { name, buildData, type }, res => {
    if (res.success) {
      alert('Build "' + res.build.name + '" saved and published!');
    } else {
      alert('Error: ' + res.error);
    }
  });
}

// ===== 3D BUILD MODE =====
const OBJECT_DEFS = {
  baseplate:  { color: 0x888888, w: 4, h: 0.3, d: 4, emissive: false },
  grassplate: { color: 0x44aa44, w: 4, h: 0.3, d: 4, emissive: false },
  part:       { color: 0x6688ff, w: 2, h: 2, d: 2, emissive: false },
  lava:       { color: 0xff4400, w: 2, h: 0.5, d: 2, emissive: true },
  ladder:     { color: 0x8b5e3c, w: 0.5, h: 4, d: 0.5, emissive: false },
  jumppad:    { color: 0xffee00, w: 2, h: 0.3, d: 2, emissive: false },
  car:        { color: 0x2288ff, w: 3, h: 1.2, d: 1.5, emissive: false },
  sword:      { color: 0xcccccc, w: 0.15, h: 3, d: 0.15, emissive: false }
};

function init3DBuild() {
  const container = document.getElementById('build-canvas-3d');
  container.innerHTML = '';

  const W = container.clientWidth || window.innerWidth;
  const H = container.clientHeight || window.innerHeight;

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(W, H);
  renderer.shadowMap.enabled = true;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.Fog(0x87ceeb, 80, 200);

  const camera = new THREE.PerspectiveCamera(60, W/H, 0.1, 500);
  camera.position.set(0, 16, 20);
  camera.lookAt(0, 0, 0);

  // Lights
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const sun = new THREE.DirectionalLight(0xffffff, 0.8);
  sun.position.set(20, 40, 20);
  sun.castShadow = true;
  scene.add(sun);

  // Grid & default base
  const gridHelper = new THREE.GridHelper(80, 80, 0x444444, 0x333333);
  scene.add(gridHelper);

  // Default baseplate floor
  const defaultFloor = makeMesh('baseplate');
  defaultFloor.scale.set(10, 1, 10);
  scene.add(defaultFloor);
  const objects = [defaultFloor];

  // Orbit controls
  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = true;
  orbit.dampingFactor = 0.05;

  // Transform controls
  const transform = new TransformControls(camera, renderer.domElement);
  transform.addEventListener('dragging-changed', e => { orbit.enabled = !e.value; });
  scene.add(transform);

  // Raycaster
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0,1,0), 0);
  const placeTarget = new THREE.Vector3();

  let currentToolType = 'part';
  let selectedObj = null;
  let transformMode = 'translate';
  let isTransformDragging = false;

  transform.addEventListener('dragging-changed', e => { isTransformDragging = e.value; });

  function makeMesh(type) {
    const def = OBJECT_DEFS[type];
    const geo = new THREE.BoxGeometry(def.w, def.h, def.d);
    const mat = new THREE.MeshLambertMaterial({ color: def.color });
    if (def.emissive) mat.emissive = new THREE.Color(def.color);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.type = type;
    return mesh;
  }

  function select(obj) {
    if (selectedObj === obj) return;
    if (selectedObj) {
      selectedObj.material.emissive && (selectedObj.material.emissive = new THREE.Color(OBJECT_DEFS[selectedObj.userData.type]?.emissive ? OBJECT_DEFS[selectedObj.userData.type].color : 0x000000));
    }
    selectedObj = obj;
    if (obj) {
      transform.attach(obj);
      transform.setMode(transformMode);
      if (!obj.material.emissive) obj.material.emissive = new THREE.Color(0x222222);
      else obj.material.emissive.set(0x442200);
    } else {
      transform.detach();
    }
  }

  function onClick(e) {
    if (isTransformDragging) return;
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    // Check if clicking existing object
    const hits = raycaster.intersectObjects(objects, false);
    if (hits.length > 0) {
      select(hits[0].object);
      return;
    }

    // Place new object on ground
    raycaster.ray.intersectPlane(groundPlane, placeTarget);
    if (!placeTarget) return;
    // Snap to grid of 1
    placeTarget.x = Math.round(placeTarget.x);
    placeTarget.z = Math.round(placeTarget.z);

    const mesh = makeMesh(currentToolType);
    const def = OBJECT_DEFS[currentToolType];
    mesh.position.set(placeTarget.x, def.h / 2, placeTarget.z);
    scene.add(mesh);
    objects.push(mesh);
    select(mesh);
  }

  renderer.domElement.addEventListener('click', onClick);

  // Delete key
  function onKeyDown(e) {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selectedObj && document.activeElement.tagName !== 'INPUT') {
        deleteSelectedObj();
      }
    }
    if (e.key === 'Escape') select(null);
  }
  window.addEventListener('keydown', onKeyDown);

  function deleteSelectedObj() {
    if (!selectedObj) return;
    transform.detach();
    scene.remove(selectedObj);
    const idx = objects.indexOf(selectedObj);
    if (idx !== -1) objects.splice(idx, 1);
    selectedObj = null;
  }

  let animId;
  function animate() {
    animId = requestAnimationFrame(animate);
    orbit.update();
    renderer.render(scene, camera);
  }
  animate();

  function onResize() {
    const w = container.clientWidth, h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.addEventListener('resize', onResize);

  return {
    setToolType(t) { currentToolType = t; },
    setTransformMode(m) {
      transformMode = m;
      transform.setMode(m);
    },
    deleteSelected() { deleteSelectedObj(); },
    exportData() {
      return objects.map(o => ({
        type: o.userData.type || 'part',
        x: o.position.x, y: o.position.y, z: o.position.z,
        sx: o.scale.x, sy: o.scale.y, sz: o.scale.z
      }));
    },
    cleanup() {
      cancelAnimationFrame(animId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('click', onClick);
      renderer.dispose();
      container.innerHTML = '';
    }
  };
}

// ===== 2D BUILD MODE =====
function init2DBuild() {
  const canvas = document.getElementById('build-canvas-2d');
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const GRID = 40; // pixels per cell
  const CAM = { x: 0, y: 0 };
  const objects2d = []; // {type, x, y, w, h}
  let currentType = 'part';
  let selectedIdx = -1;
  let transformMode2d = 'translate';
  let dragging = false, dragOff = { x: 0, y: 0 };
  let resizing = false, resizeStart = { mx: 0, my: 0, ow: 0, oh: 0 };
  let isPanning = false, panStart = { mx: 0, my: 0, cx: 0, cy: 0 };

  const COLORS_2D = {
    baseplate: '#888', grassplate: '#4a4', part: '#66f',
    lava: '#f64', ladder: '#8b5e3c', jumppad: '#ff0',
    car: '#28f', sword: '#ccc'
  };
  const DEFAULT_SIZES = {
    baseplate: { w: 6, h: 1 }, grassplate: { w: 6, h: 1 }, part: { w: 2, h: 2 },
    lava: { w: 3, h: 1 }, ladder: { w: 1, h: 4 }, jumppad: { w: 3, h: 0.5 },
    car: { w: 3, h: 1.5 }, sword: { w: 0.5, h: 3 }
  };

  // Add default floor
  objects2d.push({ type: 'baseplate', x: -10, y: -1, w: 30, h: 1 });

  function toScreen(wx, wy) {
    return { sx: (wx - CAM.x) * GRID + canvas.width/2, sy: canvas.height/2 - (wy - CAM.y) * GRID };
  }
  function toWorld(sx, sy) {
    return { wx: (sx - canvas.width/2) / GRID + CAM.x, wy: -(sy - canvas.height/2) / GRID + CAM.y };
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#222';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Grid
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    const startX = Math.floor(CAM.x - canvas.width/GRID/2) - 1;
    const endX = Math.ceil(CAM.x + canvas.width/GRID/2) + 1;
    const startY = Math.floor(CAM.y - canvas.height/GRID/2) - 1;
    const endY = Math.ceil(CAM.y + canvas.height/GRID/2) + 1;
    for (let gx = startX; gx <= endX; gx++) {
      const s = toScreen(gx, 0); ctx.beginPath(); ctx.moveTo(s.sx, 0); ctx.lineTo(s.sx, canvas.height); ctx.stroke();
    }
    for (let gy = startY; gy <= endY; gy++) {
      const s = toScreen(0, gy); ctx.beginPath(); ctx.moveTo(0, s.sy); ctx.lineTo(canvas.width, s.sy); ctx.stroke();
    }

    // Objects
    objects2d.forEach((obj, i) => {
      const s = toScreen(obj.x, obj.y + obj.h);
      const pw = obj.w * GRID, ph = obj.h * GRID;
      ctx.fillStyle = COLORS_2D[obj.type] || '#fff';
      ctx.fillRect(s.sx, s.sy, pw, ph);
      if (i === selectedIdx) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.strokeRect(s.sx, s.sy, pw, ph);
        // Resize handle
        ctx.fillStyle = '#fff';
        ctx.fillRect(s.sx + pw - 8, s.sy + ph - 8, 8, 8);
      }
      // Label
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.font = '11px sans-serif';
      ctx.fillText(obj.type, s.sx + 4, s.sy + 14);
    });
  }

  function hitTest(sx, sy) {
    for (let i = objects2d.length - 1; i >= 0; i--) {
      const obj = objects2d[i];
      const s = toScreen(obj.x, obj.y + obj.h);
      const pw = obj.w * GRID, ph = obj.h * GRID;
      if (sx >= s.sx && sx <= s.sx + pw && sy >= s.sy && sy <= s.sy + ph) return i;
    }
    return -1;
  }

  function isResizeHandle(sx, sy, i) {
    if (i < 0) return false;
    const obj = objects2d[i];
    const s = toScreen(obj.x, obj.y + obj.h);
    const pw = obj.w * GRID, ph = obj.h * GRID;
    return sx >= s.sx + pw - 10 && sy >= s.sy + ph - 10;
  }

  canvas.addEventListener('mousedown', e => {
    if (e.button === 1 || e.button === 2) {
      isPanning = true;
      panStart = { mx: e.clientX, my: e.clientY, cx: CAM.x, cy: CAM.y };
      return;
    }
    const mx = e.clientX, my = e.clientY;
    const hit = hitTest(mx, my);

    if (transformMode2d === 'translate' && hit >= 0) {
      selectedIdx = hit;
      dragging = true;
      const wPos = toWorld(mx, my);
      dragOff = { x: wPos.wx - objects2d[hit].x, y: wPos.wy - objects2d[hit].y };
    } else if (transformMode2d === 'scale' && hit >= 0 && isResizeHandle(mx, my, hit)) {
      selectedIdx = hit;
      resizing = true;
      resizeStart = { mx, my, ow: objects2d[hit].w, oh: objects2d[hit].h };
    } else if (hit >= 0) {
      selectedIdx = hit;
    } else {
      // Place new object
      const wPos = toWorld(mx, my);
      const sz = DEFAULT_SIZES[currentType] || { w: 2, h: 2 };
      const snappedX = Math.round(wPos.wx / 0.5) * 0.5;
      const snappedY = Math.round(wPos.wy / 0.5) * 0.5;
      objects2d.push({ type: currentType, x: snappedX - sz.w/2, y: snappedY, w: sz.w, h: sz.h });
      selectedIdx = objects2d.length - 1;
    }
    draw();
  });

  canvas.addEventListener('mousemove', e => {
    if (isPanning) {
      CAM.x = panStart.cx - (e.clientX - panStart.mx) / GRID;
      CAM.y = panStart.cy + (e.clientY - panStart.my) / GRID;
      draw(); return;
    }
    if (dragging && selectedIdx >= 0) {
      const wPos = toWorld(e.clientX, e.clientY);
      const obj = objects2d[selectedIdx];
      obj.x = Math.round((wPos.wx - dragOff.x) / 0.5) * 0.5;
      obj.y = Math.round((wPos.wy - dragOff.y) / 0.5) * 0.5;
      draw();
    }
    if (resizing && selectedIdx >= 0) {
      const dx = (e.clientX - resizeStart.mx) / GRID;
      const dy = -(e.clientY - resizeStart.my) / GRID;
      objects2d[selectedIdx].w = Math.max(0.5, resizeStart.ow + dx);
      objects2d[selectedIdx].h = Math.max(0.5, resizeStart.oh + dy);
      draw();
    }
  });

  canvas.addEventListener('mouseup', () => { dragging = false; resizing = false; isPanning = false; });
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  canvas.addEventListener('wheel', e => {
    // Simple scroll to pan
    CAM.x += e.deltaX / GRID;
    CAM.y -= e.deltaY / GRID;
    draw();
  });

  function onKey2d(e) {
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIdx >= 0 && document.activeElement.tagName !== 'INPUT') {
      objects2d.splice(selectedIdx, 1);
      selectedIdx = -1;
      draw();
    }
    if (e.key === 'Escape') { selectedIdx = -1; draw(); }
  }
  window.addEventListener('keydown', onKey2d);

  function onResize2d() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; draw(); }
  window.addEventListener('resize', onResize2d);

  draw();

  return {
    setToolType(t) { currentType = t; },
    setTransformMode(m) { transformMode2d = m; },
    deleteSelected() {
      if (selectedIdx >= 0) { objects2d.splice(selectedIdx, 1); selectedIdx = -1; draw(); }
    },
    exportData() { return [...objects2d]; },
    cleanup() {
      window.removeEventListener('keydown', onKey2d);
      window.removeEventListener('resize', onResize2d);
    }
  };
}

// ===========================
// ===== RACE GAME ===========
// ===========================

let raceState = null;

function enterGame(name) {
  if (name === 'race') {
    showScreen('race');
    initRace();
  } else if (name === 'parkour') {
    showScreen('parkour');
    initParkour();
  }
}

function initRace() {
  const container = document.getElementById('race-canvas-container');
  container.innerHTML = '';

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.Fog(0x87ceeb, 100, 300);

  const camera = new THREE.PerspectiveCamera(70, (container.clientWidth || window.innerWidth) / (container.clientHeight || window.innerHeight), 0.1, 500);

  // Lights
  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const sun = new THREE.DirectionalLight(0xffffff, 0.6);
  sun.position.set(30, 50, 20);
  scene.add(sun);

  // Track: straight road along -Z axis
  const TRACK_LENGTH = 600;
  const TRACK_WIDTH = 16;

  // Road
  const roadGeo = new THREE.BoxGeometry(TRACK_WIDTH, 0.4, TRACK_LENGTH);
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x444444 });
  const road = new THREE.Mesh(roadGeo, roadMat);
  road.position.set(0, 0, -TRACK_LENGTH / 2);
  road.receiveShadow = true;
  scene.add(road);

  // Grass on sides
  for (const sign of [-1, 1]) {
    const g = new THREE.Mesh(
      new THREE.BoxGeometry(60, 0.4, TRACK_LENGTH),
      new THREE.MeshLambertMaterial({ color: 0x33aa33 })
    );
    g.position.set(sign * (TRACK_WIDTH / 2 + 30), -0.01, -TRACK_LENGTH / 2);
    scene.add(g);
  }

  // Lane markings
  for (let i = 0; i < TRACK_LENGTH / 10; i++) {
    const mark = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.45, 4),
      new THREE.MeshLambertMaterial({ color: 0xffffff })
    );
    mark.position.set(0, 0, -i * 10 - 5);
    scene.add(mark);
  }

  // Yellow start square
  const startSq = new THREE.Mesh(
    new THREE.BoxGeometry(10, 0.45, 10),
    new THREE.MeshLambertMaterial({ color: 0xffee00 })
  );
  startSq.position.set(0, 0, 0);
  scene.add(startSq);

  // Finish line
  const finishLine = new THREE.Mesh(
    new THREE.BoxGeometry(TRACK_WIDTH, 0.45, 1),
    new THREE.MeshLambertMaterial({ color: 0xffffff })
  );
  finishLine.position.set(0, 0, -(TRACK_LENGTH - 5));
  scene.add(finishLine);

  // Finish banner
  const flagGeo = new THREE.BoxGeometry(TRACK_WIDTH, 5, 0.3);
  const flagMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
  const flag = new THREE.Mesh(flagGeo, flagMat);
  flag.position.set(0, 3, -(TRACK_LENGTH - 5));
  scene.add(flag);

  // Obstacles
  const obstacleMat = new THREE.MeshLambertMaterial({ color: 0xff4400 });
  for (let i = 0; i < 8; i++) {
    const ob = new THREE.Mesh(new THREE.BoxGeometry(2, 1.5, 2), obstacleMat);
    ob.position.set((Math.random() - 0.5) * 10, 0.75, -(80 + i * 60 + Math.random() * 20));
    scene.add(ob);
  }

  // Player
  const playerColors = [0xff4444, 0x4444ff, 0x44ff44, 0xff44ff, 0x44ffff, 0xffaa44];
  const myColor = playerColors[Math.floor(Math.random() * playerColors.length)];
  const playerGeo = new THREE.BoxGeometry(1.5, 1.5, 2.5);
  const playerMat = new THREE.MeshLambertMaterial({ color: myColor });
  const playerMesh = new THREE.Mesh(playerGeo, playerMat);
  playerMesh.castShadow = true;
  playerMesh.position.set((Math.random() - 0.5) * 8, 0.75, -2);
  scene.add(playerMesh);

  // Player physics
  const vel = { x: 0, y: 0, z: 0 };
  const keys = {};
  let inLobby = false;
  let raceStarted = false;
  let finished = false;

  // Other players
  const otherPlayers = new Map();

  function getOrCreateOther(socketId, username) {
    if (!otherPlayers.has(socketId)) {
      const clr = playerColors[otherPlayers.size % playerColors.length];
      const mesh = new THREE.Mesh(playerGeo.clone(), new THREE.MeshLambertMaterial({ color: clr }));
      mesh.castShadow = true;
      scene.add(mesh);
      // Name label via sprite
      const canvas2 = document.createElement('canvas');
      canvas2.width = 256; canvas2.height = 64;
      const ctx2 = canvas2.getContext('2d');
      ctx2.fillStyle = 'rgba(0,0,0,0.7)';
      ctx2.roundRect(0, 0, 256, 64, 8);
      ctx2.fill();
      ctx2.fillStyle = '#fff';
      ctx2.font = 'bold 28px sans-serif';
      ctx2.textAlign = 'center';
      ctx2.fillText(username, 128, 42);
      const tex = new THREE.CanvasTexture(canvas2);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
      sprite.scale.set(4, 1, 1);
      sprite.position.y = 2.5;
      mesh.add(sprite);
      otherPlayers.set(socketId, { mesh, username });
    }
    return otherPlayers.get(socketId);
  }

  socket.on('race-player-move', ({ socketId, username, x, y, z }) => {
    const op = getOrCreateOther(socketId, username);
    op.mesh.position.set(x, y, z);
  });

  socket.on('race-player-left', (socketId) => {
    if (otherPlayers.has(socketId)) {
      scene.remove(otherPlayers.get(socketId).mesh);
      otherPlayers.delete(socketId);
    }
  });

  // Check if player is in start square
  function isInStartSquare() {
    const p = playerMesh.position;
    return Math.abs(p.x) < 5 && Math.abs(p.z) < 5;
  }

  let wasInSquare = false;

  // Lobby UI
  socket.on('race-lobby-update', ({ players, count }) => {
    document.getElementById('race-player-count').textContent = count;
    const listEl = document.getElementById('race-player-list');
    listEl.innerHTML = players.map(n => `<span class="player-tag">${escHtml(n)}</span>`).join('');
  });

  socket.on('race-countdown', ({ countdown }) => {
    const el = document.getElementById('race-countdown-display');
    el.style.display = 'block';
    el.textContent = countdown > 0 ? countdown : 'GO!';
  });

  socket.on('race-countdown-cancelled', () => {
    document.getElementById('race-countdown-display').style.display = 'none';
  });

  socket.on('race-start', ({ participants }) => {
    raceStarted = true;
    document.getElementById('race-overlay').style.display = 'none';
    document.getElementById('race-hud').style.display = 'flex';
    document.getElementById('race-countdown-display').style.display = 'none';
  });

  socket.on('race-winner', ({ username, wins, title }) => {
    const winEl = document.getElementById('race-winner-display');
    winEl.style.display = 'block';
    winEl.textContent = `🏆 ${username} wins! (${wins} wins)`;
    document.getElementById('race-overlay').style.display = 'flex';
  });

  socket.on('race-ended', () => {
    raceStarted = false;
    finished = false;
    playerMesh.position.set((Math.random()-0.5)*8, 0.75, -2);
    document.getElementById('race-hud').style.display = 'none';
  });

  socket.on('race-status', ({ status }) => {
    if (status === 'in-progress') {
      document.getElementById('race-overlay').querySelector('p').textContent = 'Race in progress. Wait for next round!';
    }
  });

  const clock = new THREE.Clock();
  const GRAVITY = -25;
  const GROUND_Y = 0.75;
  let posUpdateTimer = 0;

  function update(dt) {
    if (!raceStarted) {
      // Lobby movement (walk around freely)
      handleMovement(dt, 8);
      // Check if player stepped into start square
      const inSq = isInStartSquare();
      if (inSq && !wasInSquare) {
        wasInSquare = true;
        socket.emit('join-race-lobby');
        inLobby = true;
      } else if (!inSq && wasInSquare) {
        wasInSquare = false;
        if (inLobby) { socket.emit('leave-race-lobby'); inLobby = false; }
      }
    } else {
      // Race movement
      if (!finished) {
        handleMovement(dt, 14);
        const progress = Math.min(1, Math.max(0, (-playerMesh.position.z) / (TRACK_LENGTH - 10)));
        document.getElementById('race-progress-fill').style.width = (progress * 100) + '%';
        document.getElementById('race-pos-label').textContent = `Progress: ${Math.round(progress * 100)}%`;

        // Check finish
        if (playerMesh.position.z < -(TRACK_LENGTH - 8)) {
          finished = true;
          socket.emit('race-finish');
        }

        // Broadcast position
        posUpdateTimer += dt;
        if (posUpdateTimer > 0.05) {
          posUpdateTimer = 0;
          socket.emit('race-position', {
            x: playerMesh.position.x,
            y: playerMesh.position.y,
            z: playerMesh.position.z,
            progress: (-playerMesh.position.z) / TRACK_LENGTH
          });
        }
      }
    }
    // Camera follow
    camera.position.lerp(
      new THREE.Vector3(playerMesh.position.x, playerMesh.position.y + 6, playerMesh.position.z + 12),
      0.08
    );
    camera.lookAt(playerMesh.position);
  }

  function handleMovement(dt, speed) {
    // Gravity
    vel.y += GRAVITY * dt;
    playerMesh.position.y += vel.y * dt;
    if (playerMesh.position.y <= GROUND_Y) {
      playerMesh.position.y = GROUND_Y;
      vel.y = 0;
      if (keys['Space'] || keys[' ']) vel.y = 12;
    }

    // Forward/back (Z)
    let moveZ = 0, moveX = 0;
    if (keys['ArrowUp'] || keys['KeyW'] || keys['w']) moveZ = -1;
    if (keys['ArrowDown'] || keys['KeyS'] || keys['s']) moveZ = 1;
    if (keys['ArrowLeft'] || keys['KeyA'] || keys['a']) moveX = -1;
    if (keys['ArrowRight'] || keys['KeyD'] || keys['d']) moveX = 1;

    playerMesh.position.z += moveZ * speed * dt;
    playerMesh.position.x += moveX * speed * dt;

    // Keep on track (clamp X within road bounds loosely)
    if (raceStarted) {
      playerMesh.position.x = Math.max(-TRACK_WIDTH/2 + 1, Math.min(TRACK_WIDTH/2 - 1, playerMesh.position.x));
    }
  }

  function onKeyDown(e) { keys[e.code] = true; keys[e.key] = true; }
  function onKeyUp(e) { keys[e.code] = false; keys[e.key] = false; }
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  let animId;
  function animate() {
    animId = requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    update(dt);
    renderer.render(scene, camera);
  }
  animate();

  function onResize() {
    const w = container.clientWidth, h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.addEventListener('resize', onResize);

  activeCleanup = () => {
    cancelAnimationFrame(animId);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('resize', onResize);
    socket.off('race-lobby-update');
    socket.off('race-countdown');
    socket.off('race-countdown-cancelled');
    socket.off('race-start');
    socket.off('race-winner');
    socket.off('race-ended');
    socket.off('race-status');
    socket.off('race-player-move');
    socket.off('race-player-left');
    if (inLobby) { socket.emit('leave-race-lobby'); inLobby = false; }
    renderer.dispose();
    container.innerHTML = '';
    document.getElementById('race-overlay').style.display = 'flex';
    document.getElementById('race-hud').style.display = 'none';
    document.getElementById('race-winner-display').style.display = 'none';
  };
}

// ===========================
// ===== PARKOUR 2D ==========
// ===========================

const PARKOUR_LEVEL = buildParkourLevel();

function buildParkourLevel() {
  const platforms = [];
  const lava = [];
  const jumppads = [];

  // Section 1: Start (easy)
  platforms.push({ x: 0,   y: 360, w: 240, h: 20 });
  platforms.push({ x: 290, y: 340, w: 120, h: 20 });
  platforms.push({ x: 460, y: 320, w: 100, h: 20 });
  lava.push(     { x: 240, y: 380, w: 50,  h: 20 });

  // Section 2: Jump pads
  platforms.push({ x: 610, y: 340, w: 120, h: 20 });
  jumppads.push( { x: 650, y: 320, w: 60,  h: 15 });
  platforms.push({ x: 780, y: 200, w: 100, h: 20 });
  platforms.push({ x: 930, y: 220, w: 80,  h: 20 });
  lava.push(     { x: 730, y: 380, w: 50,  h: 20 });

  // Section 3: Zigzag
  for (let i = 0; i < 6; i++) {
    const side = i % 2 === 0 ? 0 : 120;
    platforms.push({ x: 1060 + i * 140 + side, y: 280 - i * 15, w: 90, h: 20 });
  }
  lava.push({ x: 1600, y: 380, w: 80, h: 20 });

  // Section 4: Long lava crossing
  jumppads.push({ x: 1900, y: 340, w: 60, h: 15 });
  platforms.push({ x: 1840, y: 360, w: 100, h: 20 });
  lava.push({ x: 1940, y: 380, w: 200, h: 20 });
  platforms.push({ x: 2140, y: 300, w: 100, h: 20 });
  platforms.push({ x: 2290, y: 280, w: 80, h: 20 });

  // Section 5: High platforms
  platforms.push({ x: 2420, y: 200, w: 80, h: 20 });
  platforms.push({ x: 2560, y: 160, w: 80, h: 20 });
  jumppads.push({ x: 2710, y: 300, w: 60, h: 15 });
  platforms.push({ x: 2710, y: 320, w: 100, h: 20 });
  platforms.push({ x: 2870, y: 120, w: 100, h: 20 });
  lava.push({ x: 2970, y: 380, w: 100, h: 20 });

  // Section 6: Multiple jumppads
  platforms.push({ x: 3070, y: 300, w: 80, h: 20 });
  jumppads.push({ x: 3100, y: 280, w: 50, h: 15 });
  platforms.push({ x: 3230, y: 100, w: 80, h: 20 });
  jumppads.push({ x: 3260, y: 80, w: 50, h: 15 });
  platforms.push({ x: 3400, y: 260, w: 100, h: 20 });

  // Section 7: Lava maze
  lava.push({ x: 3500, y: 380, w: 60, h: 20 });
  platforms.push({ x: 3560, y: 340, w: 80, h: 20 });
  lava.push({ x: 3640, y: 380, w: 80, h: 20 });
  platforms.push({ x: 3720, y: 320, w: 80, h: 20 });
  lava.push({ x: 3800, y: 380, w: 100, h: 20 });
  platforms.push({ x: 3900, y: 300, w: 100, h: 20 });

  // Section 8: Final stretch
  platforms.push({ x: 4060, y: 280, w: 80, h: 20 });
  jumppads.push({ x: 4080, y: 260, w: 60, h: 15 });
  platforms.push({ x: 4200, y: 140, w: 80, h: 20 });
  platforms.push({ x: 4340, y: 200, w: 80, h: 20 });
  platforms.push({ x: 4480, y: 240, w: 80, h: 20 });

  // Finish
  platforms.push({ x: 4620, y: 220, w: 200, h: 20, finish: true });

  return { platforms, lava, jumppads, startX: 60, startY: 340, width: 4900, height: 450 };
}

let parkourActive = false;

function initParkour() {
  parkourActive = false;
  const canvas = document.getElementById('parkour-canvas');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const ctx = canvas.getContext('2d');

  const player = {
    x: PARKOUR_LEVEL.startX, y: PARKOUR_LEVEL.startY - 30,
    w: 24, h: 32, vx: 0, vy: 0, onGround: false, finished: false
  };

  const otherParkourPlayers = new Map();
  let camX = 0;
  const keys = {};
  let animId;
  let lastTime = 0;
  let progress = 0;
  let frameCount = 0;

  const GRAVITY = 900;
  const MOVE_SPEED = 180;
  const JUMP_FORCE = -420;
  const JUMPPAD_FORCE = -700;

  function resetPlayer() {
    player.x = PARKOUR_LEVEL.startX;
    player.y = PARKOUR_LEVEL.startY - 36;
    player.vx = 0; player.vy = 0;
    player.onGround = false;
    player.finished = false;
  }

  function update(dt) {
    if (!parkourActive || player.finished) return;

    // Horizontal movement
    player.vx = 0;
    if (keys['ArrowLeft'] || keys['KeyA'] || keys['a']) player.vx = -MOVE_SPEED;
    if (keys['ArrowRight'] || keys['KeyD'] || keys['d']) player.vx = MOVE_SPEED;

    // Gravity
    player.vy += GRAVITY * dt;
    player.x += player.vx * dt;
    player.y += player.vy * dt;

    player.onGround = false;

    // Platform collisions
    for (const plat of PARKOUR_LEVEL.platforms) {
      if (collides(player, plat)) {
        if (player.vy > 0 && player.y + player.h - player.vy * dt <= plat.y + 5) {
          player.y = plat.y - player.h;
          player.vy = 0;
          player.onGround = true;
          if (plat.finish && !player.finished) {
            player.finished = true;
            document.getElementById('parkour-finish-msg').style.display = 'block';
            socket.emit('parkour-finish');
          }
        } else {
          // Side collision
          if (player.vx > 0) player.x = plat.x - player.w;
          else if (player.vx < 0) player.x = plat.x + plat.w;
        }
      }
    }

    // Lava collisions
    for (const lv of PARKOUR_LEVEL.lava) {
      if (collides(player, lv)) { resetPlayer(); return; }
    }

    // Jumppad collisions
    for (const jp of PARKOUR_LEVEL.jumppads) {
      if (collides(player, jp) && player.vy >= 0) {
        player.vy = JUMPPAD_FORCE;
        player.onGround = false;
      }
    }

    // Jump
    if ((keys[' '] || keys['Space'] || keys['ArrowUp'] || keys['KeyW'] || keys['w']) && player.onGround) {
      player.vy = JUMP_FORCE;
      player.onGround = false;
    }

    // Fall off screen = reset
    if (player.y > canvas.height + 100) resetPlayer();

    // Camera follows player
    camX = player.x - canvas.width / 2 + player.w / 2;
    camX = Math.max(0, Math.min(PARKOUR_LEVEL.width - canvas.width, camX));

    // Progress
    progress = Math.min(1, Math.max(0, player.x / (PARKOUR_LEVEL.width - 200)));
    document.getElementById('parkour-progress').textContent = `Progress: ${Math.round(progress * 100)}%`;

    // Emit to server every few frames
    frameCount++;
    if (frameCount % 3 === 0) {
      socket.emit('parkour-update', { x: player.x, y: player.y, progress });
    }
  }

  function collides(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function drawScene() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Sky gradient
    const skyGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    skyGrad.addColorStop(0, '#1a1a3e');
    skyGrad.addColorStop(1, '#2a1a2e');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(-camX, 0);

    // Platforms
    for (const plat of PARKOUR_LEVEL.platforms) {
      if (plat.finish) {
        ctx.fillStyle = '#ffd700';
        ctx.fillRect(plat.x, plat.y, plat.w, plat.h);
        ctx.fillStyle = '#ff0';
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('FINISH!', plat.x + plat.w/2, plat.y - 6);
      } else {
        ctx.fillStyle = '#4a7a2a';
        ctx.fillRect(plat.x, plat.y, plat.w, 6);
        ctx.fillStyle = '#5a3a1a';
        ctx.fillRect(plat.x, plat.y + 6, plat.w, plat.h - 6);
      }
    }

    // Lava
    const lavaAnim = (Date.now() % 800) / 800;
    for (const lv of PARKOUR_LEVEL.lava) {
      const grad = ctx.createLinearGradient(lv.x, lv.y, lv.x + lv.w, lv.y + lv.h);
      grad.addColorStop(0, `hsl(${20 + lavaAnim*10}, 100%, 50%)`);
      grad.addColorStop(0.5, `hsl(${40 - lavaAnim*20}, 100%, 60%)`);
      grad.addColorStop(1, `hsl(${10 + lavaAnim*15}, 100%, 45%)`);
      ctx.fillStyle = grad;
      ctx.fillRect(lv.x, lv.y, lv.w, lv.h);
      ctx.fillStyle = 'rgba(255,200,0,0.4)';
      ctx.fillRect(lv.x, lv.y, lv.w, 4);
    }

    // Jump pads
    for (const jp of PARKOUR_LEVEL.jumppads) {
      ctx.fillStyle = '#ffe000';
      ctx.fillRect(jp.x, jp.y, jp.w, jp.h);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('▲', jp.x + jp.w/2, jp.y + jp.h - 2);
    }

    // Other players
    for (const [sid, op] of otherParkourPlayers) {
      ctx.fillStyle = op.color;
      ctx.fillRect(op.x, op.y, 24, 32);
      ctx.fillStyle = '#fff';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(op.username, op.x + 12, op.y - 4);
    }

    // Local player
    if (parkourActive) {
      ctx.fillStyle = '#5580ff';
      ctx.fillRect(player.x, player.y, player.w, player.h);
      // Eyes
      ctx.fillStyle = '#fff';
      ctx.fillRect(player.x + 5, player.y + 6, 6, 6);
      ctx.fillRect(player.x + 13, player.y + 6, 6, 6);
      ctx.fillStyle = '#000';
      ctx.fillRect(player.x + 7, player.y + 8, 3, 3);
      ctx.fillRect(player.x + 15, player.y + 8, 3, 3);
      // Username above
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(currentUser?.username || '', player.x + 12, player.y - 4);
    }

    ctx.restore();

    // Progress bar
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(canvas.width/2 - 150, 10, 300, 14);
    ctx.fillStyle = '#5580ff';
    ctx.fillRect(canvas.width/2 - 150, 10, progress * 300, 14);
    ctx.fillStyle = '#fff';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Finish Line', canvas.width/2, 38);
  }

  function gameLoop(ts) {
    animId = requestAnimationFrame(gameLoop);
    const dt = Math.min((ts - lastTime) / 1000, 0.05);
    lastTime = ts;
    if (parkourActive) update(dt);
    drawScene();
  }

  function onKeyDown(e) { keys[e.code] = true; keys[e.key] = true; if ([' ','ArrowUp','ArrowDown'].includes(e.key)) e.preventDefault(); }
  function onKeyUp(e) { keys[e.code] = false; keys[e.key] = false; }
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  // Parkour multiplayer
  socket.emit('join-parkour');
  const playerColors2 = ['#ff6644','#44ff66','#ff44ff','#44ffff','#ffaa44','#aa44ff'];
  let colorIdx = 0;

  socket.on('parkour-all-players', (players) => {
    for (const p of players) {
      if (p.socketId !== socket.id) {
        otherParkourPlayers.set(p.socketId, {
          username: p.username, x: p.x, y: p.y,
          color: playerColors2[(colorIdx++) % playerColors2.length]
        });
      }
    }
    document.getElementById('parkour-players-count').textContent = `Players: ${otherParkourPlayers.size + 1}`;
  });

  socket.on('parkour-player-joined', ({ socketId, username }) => {
    otherParkourPlayers.set(socketId, { username, x: PARKOUR_LEVEL.startX, y: PARKOUR_LEVEL.startY - 36, color: playerColors2[(colorIdx++) % playerColors2.length] });
    document.getElementById('parkour-players-count').textContent = `Players: ${otherParkourPlayers.size + 1}`;
  });

  socket.on('parkour-player-move', ({ socketId, x, y }) => {
    if (otherParkourPlayers.has(socketId)) {
      const op = otherParkourPlayers.get(socketId);
      op.x = x; op.y = y;
    }
  });

  socket.on('parkour-player-left', (socketId) => {
    otherParkourPlayers.delete(socketId);
    document.getElementById('parkour-players-count').textContent = `Players: ${otherParkourPlayers.size + 1}`;
  });

  socket.on('parkour-player-finished', ({ username }) => {
    if (username !== currentUser?.username) {
      // Show brief notification
      const note = document.createElement('div');
      note.textContent = `${username} finished!`;
      note.style.cssText = 'position:fixed;top:80px;right:20px;background:rgba(0,0,0,0.8);color:#ffd700;padding:10px 16px;border-radius:8px;font-weight:700;z-index:100;';
      document.body.appendChild(note);
      setTimeout(() => note.remove(), 3000);
    }
  });

  function onResize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
  window.addEventListener('resize', onResize);

  requestAnimationFrame(ts => { lastTime = ts; gameLoop(ts); });

  activeCleanup = () => {
    parkourActive = false;
    cancelAnimationFrame(animId);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('resize', onResize);
    socket.emit('leave-parkour');
    socket.off('parkour-all-players');
    socket.off('parkour-player-joined');
    socket.off('parkour-player-move');
    socket.off('parkour-player-left');
    socket.off('parkour-player-finished');
    document.getElementById('parkour-finish-msg').style.display = 'none';
    document.getElementById('parkour-overlay').style.display = 'flex';
  };
}

function startParkour() {
  parkourActive = true;
  document.getElementById('parkour-overlay').style.display = 'none';
}

// ===========================
// ===== PLAY USER BUILD =====
// ===========================

function playBuild(buildId) {
  socket.emit('load-build', buildId, res => {
    if (!res.success) { alert('Error loading build: ' + res.error); return; }
    const build = res.build;
    showScreen('play-build');
    document.getElementById('play-build-name').textContent = `🎮 ${build.name} by ${build.author}`;
    if (build.type === '2d') {
      playBuild2D(build);
    } else {
      playBuild3D(build);
    }
  });
}

function playBuild3D(build) {
  const container = document.getElementById('play-canvas-3d');
  container.innerHTML = '';
  document.getElementById('play-canvas-2d').style.display = 'none';
  container.style.display = 'block';

  const W = container.clientWidth || window.innerWidth;
  const H = container.clientHeight || window.innerHeight;
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(W, H);
  renderer.shadowMap.enabled = true;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.Fog(0x87ceeb, 80, 200);

  const camera = new THREE.PerspectiveCamera(70, W/H, 0.1, 500);

  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const sun = new THREE.DirectionalLight(0xffffff, 0.6);
  sun.position.set(20, 40, 20);
  scene.add(sun);

  // Build objects
  const LAVA_OBJS = [];
  const JUMPPAD_OBJS = [];
  const SOLID_OBJS = [];

  (build.data || []).forEach(obj => {
    const def = OBJECT_DEFS[obj.type] || OBJECT_DEFS['part'];
    const geo = new THREE.BoxGeometry(def.w, def.h, def.d);
    const mat = new THREE.MeshLambertMaterial({ color: def.color });
    if (def.emissive) mat.emissive = new THREE.Color(def.color);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(obj.x, obj.y, obj.z);
    mesh.scale.set(obj.sx || 1, obj.sy || 1, obj.sz || 1);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.type = obj.type;
    scene.add(mesh);

    // Build bounding box for collision
    const bb = new THREE.Box3().setFromObject(mesh);
    if (obj.type === 'lava') LAVA_OBJS.push(bb);
    else if (obj.type === 'jumppad') JUMPPAD_OBJS.push({ box: bb, mesh });
    else SOLID_OBJS.push(bb);
  });

  // Player
  const playerGeo = new THREE.BoxGeometry(1, 2, 1);
  const playerMat = new THREE.MeshLambertMaterial({ color: 0x5580ff });
  const playerMesh = new THREE.Mesh(playerGeo, playerMat);
  playerMesh.castShadow = true;
  playerMesh.position.set(0, 3, 0);
  scene.add(playerMesh);

  const vel3 = { x: 0, y: 0, z: 0 };
  const keys = {};
  const GRAVITY = -25;
  let onGround = false;
  const otherBuildPlayers = new Map();
  const buildPlayerColors = [0xff4444, 0x44ff44, 0xff44ff, 0xffaa44, 0x44ffff, 0xaa44ff];
  let bpColorIdx = 0;
  const buildId = build.id;

  function getOrMakeBuildPlayer(sid, username) {
    if (!otherBuildPlayers.has(sid)) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(1, 2, 1),
        new THREE.MeshLambertMaterial({ color: buildPlayerColors[(bpColorIdx++) % buildPlayerColors.length] })
      );
      m.castShadow = true;
      scene.add(m);
      otherBuildPlayers.set(sid, { mesh: m, username });
    }
    return otherBuildPlayers.get(sid);
  }

  socket.emit('join-build-game', buildId);

  socket.on('build-game-players', (players) => {
    players.forEach(p => {
      const op = getOrMakeBuildPlayer(p.socketId, p.username);
      op.mesh.position.set(p.x, p.y, p.z);
    });
  });

  socket.on('build-game-player-joined', ({ socketId, username, x, y, z }) => {
    const op = getOrMakeBuildPlayer(socketId, username);
    op.mesh.position.set(x, y, z);
  });

  socket.on('build-game-player-move', ({ socketId, x, y, z }) => {
    if (otherBuildPlayers.has(socketId)) {
      otherBuildPlayers.get(socketId).mesh.position.set(x, y, z);
    }
  });

  socket.on('build-game-player-left', (socketId) => {
    if (otherBuildPlayers.has(socketId)) {
      scene.remove(otherBuildPlayers.get(socketId).mesh);
      otherBuildPlayers.delete(socketId);
    }
  });

  let posTimer = 0;

  function updatePlay(dt) {
    posTimer += dt;
    if (posTimer > 0.05) {
      posTimer = 0;
      socket.emit('build-game-position', { buildId, x: playerMesh.position.x, y: playerMesh.position.y, z: playerMesh.position.z });
    }
    vel3.y += GRAVITY * dt;

    let moveX = 0, moveZ = 0;
    if (keys['ArrowLeft'] || keys['KeyA'] || keys['a']) moveX = -1;
    if (keys['ArrowRight'] || keys['KeyD'] || keys['d']) moveX = 1;
    if (keys['ArrowUp'] || keys['KeyW'] || keys['w']) moveZ = -1;
    if (keys['ArrowDown'] || keys['KeyS'] || keys['s']) moveZ = 1;

    playerMesh.position.x += moveX * 8 * dt;
    playerMesh.position.z += moveZ * 8 * dt;
    playerMesh.position.y += vel3.y * dt;

    onGround = false;
    if (playerMesh.position.y <= 1) {
      playerMesh.position.y = 1;
      vel3.y = 0;
      onGround = true;
    }

    const pb = new THREE.Box3().setFromObject(playerMesh);
    for (const bb of SOLID_OBJS) {
      if (pb.intersectsBox(bb)) {
        if (vel3.y < 0) {
          playerMesh.position.y = bb.max.y + 1;
          vel3.y = 0;
          onGround = true;
        }
      }
    }

    for (const lv of LAVA_OBJS) {
      if (pb.intersectsBox(lv)) { playerMesh.position.set(0, 3, 0); vel3.y = 0; }
    }

    for (const jp of JUMPPAD_OBJS) {
      if (pb.intersectsBox(jp.box) && vel3.y <= 0) {
        vel3.y = 16;
      }
    }

    if ((keys[' '] || keys['Space']) && onGround) { vel3.y = 12; onGround = false; }

    camera.position.lerp(
      new THREE.Vector3(playerMesh.position.x, playerMesh.position.y + 6, playerMesh.position.z + 12),
      0.1
    );
    camera.lookAt(playerMesh.position);
  }

  function onKD(e) { keys[e.code] = true; keys[e.key] = true; }
  function onKU(e) { keys[e.code] = false; keys[e.key] = false; }
  window.addEventListener('keydown', onKD);
  window.addEventListener('keyup', onKU);

  const clock = new THREE.Clock();
  let animId;
  function animate() {
    animId = requestAnimationFrame(animate);
    updatePlay(Math.min(clock.getDelta(), 0.05));
    renderer.render(scene, camera);
  }
  animate();

  function onResize() {
    const w = container.clientWidth, h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.addEventListener('resize', onResize);

  activeCleanup = () => {
    cancelAnimationFrame(animId);
    window.removeEventListener('keydown', onKD);
    window.removeEventListener('keyup', onKU);
    window.removeEventListener('resize', onResize);
    socket.emit('leave-build-game', buildId);
    socket.off('build-game-players');
    socket.off('build-game-player-joined');
    socket.off('build-game-player-move');
    socket.off('build-game-player-left');
    renderer.dispose();
    container.innerHTML = '';
  };
}

function playBuild2D(build) {
  const canvas = document.getElementById('play-canvas-2d');
  document.getElementById('play-canvas-3d').style.display = 'none';
  canvas.style.display = 'block';
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const ctx = canvas.getContext('2d');

  const GRID = 40;
  // 2D build stores y increasing upward. Canvas y increases downward.
  // Ground reference: bottom 80px from screen
  const BASE_Y = canvas.height - 80;

  const COLORS_2D = {
    baseplate: '#888', grassplate: '#4a4', part: '#66f',
    lava: '#f64', ladder: '#8b5e3c', jumppad: '#ffe000', car: '#28f', sword: '#ccc'
  };

  // Pre-compute canvas-space rectangles for all objects (physics stays in canvas space)
  const objs = (build.data || []).map(obj => ({
    type: obj.type,
    cx: obj.x * GRID,
    cy: BASE_Y - (obj.y + obj.h) * GRID,
    cw: Math.max(1, obj.w) * GRID,
    ch: Math.max(1, obj.h) * GRID
  }));

  const GRAVITY = 900, MOVE_SPEED = 180, JUMP_FORCE = -420, JUMPPAD_FORCE = -700;
  const SPAWN = { x: 60, y: BASE_Y - 80 };
  const player = { x: SPAWN.x, y: SPAWN.y, w: 24, h: 32, vx: 0, vy: 0, onGround: false };
  const keys = {};
  let camX = 0;
  let animId, lastTime = 0;

  function respawn() { player.x = SPAWN.x; player.y = SPAWN.y; player.vx = 0; player.vy = 0; player.onGround = false; }

  function colRect(a, bx, by, bw, bh) {
    return a.x < bx + bw && a.x + a.w > bx && a.y < by + bh && a.y + a.h > by;
  }

  function update2d(dt) {
    player.vx = 0;
    if (keys['ArrowLeft'] || keys['a'] || keys['KeyA']) player.vx = -MOVE_SPEED;
    if (keys['ArrowRight'] || keys['d'] || keys['KeyD']) player.vx = MOVE_SPEED;

    player.vy += GRAVITY * dt;
    player.x += player.vx * dt;
    player.y += player.vy * dt;
    player.onGround = false;

    // Fell off screen
    if (player.y > canvas.height + 60) { respawn(); return; }

    for (const obj of objs) {
      if (!colRect(player, obj.cx, obj.cy, obj.cw, obj.ch)) continue;
      if (obj.type === 'lava') { respawn(); return; }
      if (obj.type === 'jumppad' && player.vy >= 0) { player.vy = JUMPPAD_FORCE; player.onGround = false; continue; }
      // AABB push-out
      const overlapT = (player.y + player.h) - obj.cy;
      const overlapB = (obj.cy + obj.ch) - player.y;
      const overlapL = (player.x + player.w) - obj.cx;
      const overlapR = (obj.cx + obj.cw) - player.x;
      const minO = Math.min(overlapT, overlapB, overlapL, overlapR);
      if (minO === overlapT && player.vy >= 0) { player.y = obj.cy - player.h; player.vy = 0; player.onGround = true; }
      else if (minO === overlapB && player.vy < 0) { player.y = obj.cy + obj.ch; player.vy = 0; }
      else if (minO === overlapL) player.x = obj.cx - player.w;
      else player.x = obj.cx + obj.cw;
    }

    if ((keys[' '] || keys['Space'] || keys['ArrowUp'] || keys['KeyW'] || keys['w']) && player.onGround) {
      player.vy = JUMP_FORCE; player.onGround = false;
    }

    camX = player.x - canvas.width / 2;
  }

  function draw2d() {
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(-camX, 0);
    for (const obj of objs) {
      ctx.fillStyle = COLORS_2D[obj.type] || '#888';
      ctx.fillRect(obj.cx, obj.cy, obj.cw, obj.ch);
      if (obj.type === 'jumppad') {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('▲', obj.cx + obj.cw / 2, obj.cy + obj.ch - 3);
      }
    }
    // Player
    ctx.fillStyle = '#5580ff';
    ctx.fillRect(player.x, player.y, player.w, player.h);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(currentUser?.username || '', player.x + player.w / 2, player.y - 4);
    ctx.restore();
  }

  function loop(ts) {
    animId = requestAnimationFrame(loop);
    const dt = Math.min((ts - lastTime) / 1000, 0.05);
    lastTime = ts;
    update2d(dt);
    draw2d();
  }

  function onKD(e) { keys[e.code] = true; keys[e.key] = true; }
  function onKU(e) { keys[e.code] = false; keys[e.key] = false; }
  window.addEventListener('keydown', onKD);
  window.addEventListener('keyup', onKU);
  requestAnimationFrame(ts => { lastTime = ts; loop(ts); });

  function onResize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', onResize);

  activeCleanup = () => {
    cancelAnimationFrame(animId);
    window.removeEventListener('keydown', onKD);
    window.removeEventListener('keyup', onKU);
    window.removeEventListener('resize', onResize);
    canvas.style.display = 'none';
  };
}
