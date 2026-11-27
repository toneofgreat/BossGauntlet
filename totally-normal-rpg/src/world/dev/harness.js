// WORLD dev harness: a stub ENGINE (terrain per CONTRACT 5.6 spec, materials, physics recorder, sun + fog presets,
// crude vegetation) so WORLD can be built and screenshotted without the real engine.
// Open /totally-normal-rpg/src/world/dev/harness.html (?cols=1 shows colliders). window.__shot({...}) for tools.

import * as THREE from "../../engine/three.js";
import * as T from "../../engine/terrain.js";
import { createMaterials } from "../../engine/materials.js";
import * as World from "../index.js";

const params = new URLSearchParams(location.search);
const SHOW_COLS = params.get("cols") === "1";

// ---------------------------------------------------------------- noise + terrain spec
function hash(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, z) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < 4; i++) { s += a * vnoise(x * f, z * f); a *= 0.5; f *= 2.03; } return s; }
const sm = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
function padW(d, r) { return 1 - sm((d - r) / 12); }
function stubRegionAt(x, z) {
  if (x >= -220 && x <= 220 && z >= -120 && z <= 560) return "main";
  if (Math.abs(x) <= 400 && Math.abs(z + 2000) <= 400) return "desert";
  if (x >= -2300 && x <= -1700 && z >= -250 && z <= 250) return "forest";
  if (Math.abs(x) <= 300 && Math.abs(z + 4150) <= 300) return "hollowDesert";
  return "none";
}
function stubHeightAt(x, z) {
  const reg = stubRegionAt(x, z);
  if (reg === "main") {
    let y = (fbm(x * 0.012, z * 0.012) - 0.5) * 12;
    let w = 0, py = 0;
    const pad = (ww, yy) => { if (ww > w) { w = ww; py = yy; } };
    pad(padW(Math.hypot(x, z), 36), 0);
    pad(padW(Math.max(Math.abs(x) - 40, Math.abs(z - 100) - 30, 0), 0), 0);
    pad(padW(Math.hypot(x, z - 148), 18), -1.5);
    pad(padW(Math.hypot(x, z - 240), 50), 0);
    pad(padW(Math.hypot(x + 80, z - 236), 18), 0);
    pad(padW(Math.hypot(x, z - 300), 22), 0);
    pad(padW(Math.hypot(x - 30, z + 6), 10), 0);
    pad(padW(Math.max(Math.abs(x) - 50, Math.max(395 - z, z - 515), 0), 0), 18);
    if (z > 330 && z < 405) { const ry = Math.max(0, Math.min(18, (18 * (z - 335)) / 65)); pad(padW(Math.max(Math.abs(x) - 4, 0), 0) * (z < 335 ? sm((z - 330) / 5) : 1), ry); }
    y = y + (py - y) * w;
    // road mask (keep it smooth)
    // river
    const rd = Math.max(54 - z, z - 66);
    if (rd < 2) { const k = sm((2 - rd) / 4); y = y + (-2.5 - y) * k; }
    // waterfall cliff
    if (z > 40 && z < 80 && x < -66) { const k = sm((-66 - x) / 4) * sm(Math.min(z - 40, 80 - z) / 3); y = y + (14 - y) * k; }
    // void
    if (x < -40 && z > -40 && z < 30) { const k = sm((-40 - x) / 3) * sm(Math.min(z + 40, 30 - z) / 2); y = y + (-400 - y) * k; }
    return y;
  }
  if (reg === "desert") {
    let y = (fbm(x * 0.01 + 50, z * 0.01) - 0.5) * 8;
    const w = padW(Math.hypot(x, z + 1700), 25);
    return y * (1 - w);
  }
  if (reg === "forest") return (fbm(x * 0.02, z * 0.02) - 0.5) * 3 * (1 - padW(Math.abs(z), 3) * 0.7);
  if (reg === "hollowDesert") {
    let y = (fbm(x * 0.01, z * 0.01 + 9) - 0.5) * 8;
    const w = Math.max(padW(Math.hypot(x, z + 4150), 70), padW(Math.hypot(x, z + 3990), 20));
    return y * (1 - w);
  }
  return -1e9;
}

for (const r of Object.keys(T.REGIONS)) T.bakeRegionSync(r);
const heightAt = T.heightAt, regionAt = T.regionAt;
void stubHeightAt;
// ---------------------------------------------------------------- renderer + scene
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
window.__phase = "boot";
renderer.domElement.addEventListener("webglcontextlost", () => { (window.__errs = window.__errs || []).push("context lost during " + window.__phase + " yields " + window.__yields + " t " + Math.round(performance.now()) + " canvases " + window.__cv.n + " MPx " + (window.__cv.px / 1e6).toFixed(1)); });
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 1500);
camera.position.set(0, 4, 18);
const hemi = new THREE.HemisphereLight("#bcd4f0", "#5a4a32", 1.1);
scene.add(hemi);
const sun = new THREE.DirectionalLight("#fff2dc", 3.0);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const sc = sun.shadow.camera; sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 260;
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);
const PRESETS = {
  day: { sky: "#9cc4ea", fog: 0.0042, sun: [0.5, 0.8, 0.35], si: 3.0, sc: "#fff2dc", hs: "#bcd4f0", hg: "#5a4a32", hi: 1.1 },
  afternoon: { sky: "#a8c8e4", fog: 0.004, sun: [-0.4, 0.7, 0.5], si: 2.9, sc: "#fff0d0", hs: "#c0d4ea", hg: "#5a4a32", hi: 1.05 },
  golden: { sky: "#e8c090", fog: 0.0035, sun: [-0.7, 0.35, 0.5], si: 2.8, sc: "#ffc890", hs: "#e0c0a0", hg: "#4a3a2a", hi: 0.9 },
  throne: { sky: "#3a3028", fog: 0.01, sun: [-0.5, 0.6, 0.2], si: 0.8, sc: "#ffd0a0", hs: "#8a7a6a", hg: "#2a2018", hi: 0.7 },
  kingDark: { sky: "#000000", fog: 0.06, sun: [0.2, 1, 0.1], si: 0.05, sc: "#8090ff", hs: "#101018", hg: "#000000", hi: 0.15 },
  desertFog: { sky: "#e8dcc8", fog: 0.018, sun: [0.3, 0.8, -0.4], si: 2.6, sc: "#fff4e0", hs: "#f0e6d4", hg: "#b8a080", hi: 1.3 },
  forest: { sky: "#7a8a80", fog: 0.02, sun: [0.3, 0.7, 0.3], si: 1.2, sc: "#e0e8d0", hs: "#8a9a8a", hg: "#2a2a1a", hi: 0.7 },
  houseInterior: { sky: "#4a4a50", fog: 0.02, sun: [0.3, 0.7, 0.3], si: 0.6, sc: "#c0c8d0", hs: "#6a6a70", hg: "#2a2420", hi: 0.5 },
  hollowDesert: { sky: "#f4ecdc", fog: 0.006, sun: [0.2, 0.9, -0.3], si: 3.2, sc: "#fffaf0", hs: "#f8f0e0", hg: "#c8b090", hi: 1.4 },
  final: { sky: "#f4f4f4", fog: 0.004, sun: [0.3, 0.8, 0.3], si: 2.5, sc: "#ffffff", hs: "#ffffff", hg: "#8a8a8a", hi: 1.2 },
};
let atmo = "day";
const fogColor = new THREE.Color();
scene.fog = new THREE.FogExp2("#9cc4ea", 0.004);
function setAtmosphere(id) {
  const p = PRESETS[id] || PRESETS.day; atmo = id;
  fogColor.set(p.sky);
  if (state.run.cycle >= 1) fogColor.lerp(new THREE.Color("#8a3a30"), 0.4);
  scene.background = fogColor.clone(); scene.fog.color.copy(fogColor); scene.fog.density = p.fog;
  sun.position.set(p.sun[0], p.sun[1], p.sun[2]).normalize().multiplyScalar(120);
  sun.intensity = p.si; sun.color.set(p.sc); hemi.color.set(p.hs); hemi.groundColor.set(p.hg); hemi.intensity = p.hi;
}

// ---------------------------------------------------------------- materials (procedural, greyscale-ish detail)
const texCache = {};
function tex(name) {
  if (texCache[name]) return texCache[name];
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = "#c8c8c8"; g.fillRect(0, 0, 256, 256);
  const noise = (n, a) => { for (let i = 0; i < n; i++) { const v = 150 + Math.random() * 100 | 0; g.fillStyle = `rgba(${v},${v},${v},${a})`; g.fillRect(Math.random() * 256, Math.random() * 256, 3, 3); } };
  noise(4000, 0.25);
  g.strokeStyle = "rgba(60,60,60,0.55)";
  if (/plank|woodDark|cardboard/.test(name)) { for (let y = 0; y < 256; y += 32) { g.lineWidth = 2; g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); } for (let i = 0; i < 60; i++) { g.lineWidth = 1; g.strokeStyle = "rgba(90,90,90,0.25)"; g.beginPath(); const y = Math.random() * 256; g.moveTo(0, y); g.bezierCurveTo(80, y + 3, 160, y - 3, 256, y); g.stroke(); } }
  if (/Brick|cobble/.test(name)) { for (let y = 0; y < 256; y += 42) { g.lineWidth = 3; g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); for (let x = ((y / 42) % 2) * 32; x < 256; x += 64) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 42); g.stroke(); } } }
  if (/roofTile/.test(name)) for (let y = 0; y < 256; y += 24) for (let x = ((y / 24) % 2) * 16; x < 256; x += 32) { g.lineWidth = 2; g.beginPath(); g.arc(x + 16, y, 16, 0, Math.PI); g.stroke(); }
  if (/thatch|straw/.test(name)) for (let i = 0; i < 900; i++) { const x = Math.random() * 256, y = Math.random() * 256; g.strokeStyle = `rgba(${80 + Math.random() * 80},${70 + Math.random() * 60},40,0.35)`; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 6, y + 18); g.stroke(); }
  if (/bark/.test(name)) for (let x = 0; x < 256; x += 10) { g.lineWidth = 2 + Math.random() * 3; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (Math.random() - 0.5) * 10, 256); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  texCache[name] = t; return t;
}
const BASE = {
  grass: "#5f8a3c", dirt: "#7a5e3e", rock: "#8a8780", sand: "#d8c49a", bark: "#5a4330", leaves: "#476b2e", woodPlank: "#9a7449",
  woodDark: "#4e3826", thatch: "#b89a5a", roofTile: "#8e4a33", stoneBrick: "#8f8a80", cobble: "#7d786e", plaster: "#e6dcc6",
  clothRed: "#9c2a26", clothBlue: "#2c4a7e", clothWhite: "#e8e4da", clothGreen: "#3f6a3a", leather: "#6b4a2e", iron: "#7b7f86",
  gold: "#d4a537", cheese: "#f2c84b", furRat: "#6d5f52", furCat: "#8a7a6a", skin: "#e0b090", hair: "#3a2a1a", obsidian: "#0b0b10",
  ink: "#050507", glassBlack: "#141a20", portal: "#1a0f2a", bone: "#e8e0cc", cactus: "#4f7a45", straw: "#d7b866", paper: "#efe6cf",
  cardboard: "#a58256", rust: "#8a4a2a",
};
const matCache = {};
const stubMaterials = {
  get(name, opts) {
    const key = name + "|" + (opts && opts.color || "");
    if (matCache[key]) return matCache[key];
    const metal = /iron|gold|rust/.test(name) ? 0.7 : 0;
    const m = new THREE.MeshStandardMaterial({ color: (opts && opts.color) || BASE[name] || "#888", map: tex(name), roughness: metal ? 0.45 : 0.88, metalness: metal });
    matCache[key] = m; return m;
  },
  texture: tex,
};

let materials = stubMaterials;
try { materials = createMaterials(THREE, { renderer, yieldFrame: () => Promise.resolve() }); } catch (e) { console.warn("real materials unavailable", e); }
// ---------------------------------------------------------------- terrain meshes
const regionMeshes = {};
function terrainMesh(reg, x0, z0, x1, z1, step) {
  const nx = Math.round((x1 - x0) / step), nz = Math.round((z1 - z0) / step);
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, nx, nz);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position, col = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + (x0 + x1) / 2, z = p.getZ(i) + (z0 + z1) / 2;
    let y = heightAt(x, z); if (y < -1e8) y = -50;
    p.setXYZ(i, x, y, z);
    if (reg === "main") {
      const road = (Math.abs(x) < 2.2 && z > 10 && z < 400) || Math.abs(Math.hypot(x, z - 240) - 34) < 2;
      if (y < -1.2) c.set("#6a6250"); else if (road) c.set("#8a7050"); else c.setHSL(0.24 + hash(x, z) * 0.03, 0.42, 0.3 + fbm(x * 0.1, z * 0.1) * 0.08);
      if (y > 10 && x < -60) c.set("#7a766e");
    } else if (reg === "forest") c.setHSL(0.2, 0.35, 0.18 + hash(x, z) * 0.04);
    else c.setHSL(0.11, 0.42, 0.68 + fbm(x * 0.05, z * 0.05) * 0.08);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  m.receiveShadow = true;
  scene.add(m);
  (regionMeshes[reg] = regionMeshes[reg] || []).push(m);
}
terrainMesh("main", -220, -120, 220, 560, 2);
terrainMesh("desert", -400, -2400, 400, -1600, 6);
terrainMesh("forest", -2300, -250, -1700, 250, 4);
terrainMesh("hollowDesert", -300, -4450, 300, -3850, 6);
const river = new THREE.Mesh(new THREE.PlaneGeometry(440, 12), new THREE.MeshStandardMaterial({ color: "#3a6a7a", roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.85 }));
river.rotation.x = -Math.PI / 2; river.position.set(0, -0.6, 60); scene.add(river);
(regionMeshes.main).push(river);
function showRegion(reg) { for (const k in regionMeshes) for (const m of regionMeshes[k]) m.visible = k === reg; for (const v of vegGroups) v.g.visible = v.reg === reg; }

// ---------------------------------------------------------------- physics recorder
const cols = [];
const colGroup = new THREE.Group(); scene.add(colGroup);
const wire = new THREE.MeshBasicMaterial({ color: "#ff00ff", wireframe: true });
const wire2 = new THREE.MeshBasicMaterial({ color: "#00ffaa", wireframe: true });
const physics = {
  addBox(o) { const id = cols.length; cols.push({ t: "box", o, on: true }); if (SHOW_COLS) { const m = new THREE.Mesh(new THREE.BoxGeometry(o.size.x, o.size.y, o.size.z), o.walkable === false ? wire : wire2); m.position.set(o.center.x, o.center.y, o.center.z); m.rotation.y = o.yaw || 0; colGroup.add(m); cols[id].m = m; } return id; },
  addCylinder(o) { const id = cols.length; cols.push({ t: "cyl", o, on: true }); if (SHOW_COLS) { const m = new THREE.Mesh(new THREE.CylinderGeometry(o.radius, o.radius, o.height, 10), wire2); m.position.set(o.base.x, o.base.y + o.height / 2, o.base.z); colGroup.add(m); cols[id].m = m; } return id; },
  addRamp(o) { const id = cols.length; cols.push({ t: "ramp", o, on: true }); if (SHOW_COLS) { const len = Math.hypot(o.to.x - o.from.x, o.to.y - o.from.y, o.to.z - o.from.z); const m = new THREE.Mesh(new THREE.BoxGeometry(o.width, 0.1, len), wire2); m.position.set((o.from.x + o.to.x) / 2, (o.from.y + o.to.y) / 2, (o.from.z + o.to.z) / 2); m.lookAt(o.to.x, o.to.y, o.to.z); colGroup.add(m); cols[id].m = m; } return id; },
  addTrigger(o) { const id = cols.length; cols.push({ t: "trig", o, on: true }); return id; },
  setEnabled(id, v) { if (cols[id]) { cols[id].on = v; if (cols[id].m) cols[id].m.visible = v; } },
  move() {}, remove() {}, clearTag() {}, setKillY() {},
  raycast() { return null },
  groundAt(x, z) { return { y: heightAt(x, z), surface: "grass", id: -1 }; },
};

// ---------------------------------------------------------------- crude vegetation (to judge exclusions)
const excl = [];
const vegGroups = [];
const vegetation = {
  exclude(x, z, r) { excl.push({ c: true, x, z, r }); },
  excludeRect(x0, z0, x1, z1) { excl.push({ c: false, x0, z0, x1, z1 }); },
  setRegionVisible() {},
  scatter() {
    const blocked = (x, z) => excl.some((e) => (e.c ? Math.hypot(x - e.x, z - e.z) < e.r : x > e.x0 && x < e.x1 && z > e.z0 && z < e.z1));
    const mk = (reg, n, area, geo, mat, ok, s) => {
      const im = new THREE.InstancedMesh(geo, mat, n); let k = 0; const m4 = new THREE.Matrix4();
      for (let i = 0; i < n * 4 && k < n; i++) {
        const x = area[0] + Math.random() * (area[2] - area[0]), z = area[1] + Math.random() * (area[3] - area[1]);
        if (!ok(x, z) || blocked(x, z)) continue;
        const y = heightAt(x, z), sc2 = s * (0.7 + Math.random() * 0.6);
        m4.makeScale(sc2, sc2, sc2).setPosition(x, y, z); im.setMatrixAt(k++, m4);
      }
      im.count = k; im.castShadow = true; im.receiveShadow = true; const g = new THREE.Group(); g.add(im); scene.add(g); vegGroups.push({ g, reg });
    };
    const tree = new THREE.ConeGeometry(2.2, 8, 7); tree.translate(0, 4.5, 0);
    const trunk = new THREE.CylinderGeometry(0.25, 0.35, 2, 6); trunk.translate(0, 1, 0);
    const okMain = (x, z) => { const y = heightAt(x, z); if (y < -1 || y > 13) return false; if (Math.abs(x) < 4) return false; if (Math.hypot(x, z) < 38 || Math.hypot(x, z - 240) < 52 || (Math.abs(x) < 52 && z > 390)) return false; if (Math.abs(x) < 42 && z > 72 && z < 130) return false; if (Math.hypot(x, z - 148) < 22 || Math.hypot(x, z - 300) < 24) return false; return true; };
    mk("main", 900, [-220, -120, 220, 560], tree, new THREE.MeshStandardMaterial({ color: "#3f5f2a", roughness: 0.9 }), okMain, 1);
    mk("main", 900, [-220, -120, 220, 560], trunk, new THREE.MeshStandardMaterial({ color: "#4a3626" }), () => false, 1);
    const okF = (x, z) => Math.abs(z) > 4 && Math.hypot(x + 2160, z) > 25;
    mk("forest", 2500, [-2300, -250, -1700, 250], tree, new THREE.MeshStandardMaterial({ color: "#2a4228", roughness: 0.9 }), okF, 1.4);
    const cact = new THREE.CylinderGeometry(0.3, 0.35, 4, 8); cact.translate(0, 2, 0);
    mk("desert", 300, [-400, -2400, 400, -1600], cact, new THREE.MeshStandardMaterial({ color: "#4f7a45" }), () => true, 1);
    mk("hollowDesert", 120, [-300, -4450, 300, -3850], cact, new THREE.MeshStandardMaterial({ color: "#4f7a45" }), (x, z) => Math.hypot(x, z + 4150) > 70, 1);
    showRegion(region);
  },
};

// ---------------------------------------------------------------- the rest of the engine stub
const systems = [];
let gameTime = 0;
const player = {
  object: new THREE.Group(), velocity: new THREE.Vector3(), yaw: 0, onGround: true,
  teleport(p, yaw) { player.object.position.set(p.x, p.y, p.z); if (yaw != null) player.yaw = yaw; player.velocity.set(0, 0, 0); },
  forward(out) { return out.set(Math.sin(player.yaw), 0, Math.cos(player.yaw)); },
  knockback() {}, setControl() {}, setLook() {}, isMoving() { return false; },
};
player.position = player.object.position;
{
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 1.1, 4, 8), new THREE.MeshStandardMaterial({ color: "#2c5a8a" }));
  body.position.y = 0.9; body.castShadow = true; player.object.add(body);
  scene.add(player.object);
}
let region = "main";
const engine = {
  renderer, scene, camera, physics, materials, vegetation, player,
  terrain: { heightAt, regionAt, surfaceAt: () => "grass" },
  quality: { level: 2, onChange() { return () => {}; } },
  water: { setVisible() {} },
  postfx: { flash() {}, set() {}, reset() {} },
  camera3p: { shake() {}, take() { return { set() {}, move() { return Promise.resolve(); }, release() {} }; } },
  input: { idleSeconds: () => 0, move: { x: 0, y: 0 } },
  addSystem(name, fn, pr) { systems.push({ name, fn, pr: pr || 50 }); systems.sort((a, b) => a.pr - b.pr); return () => {}; },
  yieldFrame: () => { window.__yields = (window.__yields || 0) + 1; return new Promise((r) => requestAnimationFrame(() => r())); },
  every() { return () => {}; }, after(s, fn) { const id = setTimeout(fn, s * 1000); return () => clearTimeout(id); },
  setAtmosphere, pushAtmosphere() {}, popAtmosphere() {},
  showRegion(r) { region = r; showRegion(r); },
  get time() { return gameTime; }, get realTime() { return performance.now() / 1000; },
  start() {},
};
const handlers = {};
const bus = {
  on(n, f) { (handlers[n] = handlers[n] || []).push(f); return () => {}; },
  once(n, f) { return bus.on(n, f); },
  off() {},
  emit(n, p) { const l = handlers[n]; if (l) for (const f of l) { try { f(p); } catch (e) { console.error(e); } } if (window.__busLog) window.__busLog.push(n); },
};
const state = {
  v: 1,
  profile: { name: "Dev", onlineName: "", secrets: {}, endings: {}, runs: 0, playMs: 0, signReads: 0, npcsTalked: {} },
  settings: { reduceFlashing: false, quality: "auto", hints: true },
  run: { cycle: 0, level: 0, phase: "intro", equip: {}, owned: {}, kills: {}, flags: {}, buried: {}, deaths: 0, startedAt: 0, kingWins: 0 },
  choiceSnapshot: null,
  player: { hp: 100, maxHp: 100, alive: true },
  world: { zone: "lobby", region: "main" },
  ui: { screen: "game", modal: false },
  rt: { playing: true, paused: false, timeScale: 1, god: false, fast: 1, cinematic: false, idleLock: false },
};
const ctx = { THREE, bus, state, scene, camera, renderer, engine, save: null, audio: null, ui: { fade: () => Promise.resolve(), toast: (t) => console.log("[toast]", t) },
  world: null, combat: { canEnter: (id) => ({ ok: !!window.__open, need: 50, have: 0 }), fightActive: () => false }, story: null, events: null };
window.__tnrpg = { ctx };
setAtmosphere("day");

const t0 = performance.now();
window.__phase = "world.init";
ctx.world = await World.init(ctx);
window.__phase = "after init";
const buildMs = performance.now() - t0;
vegetation.scatter();
bus.emit("game:start", { newGame: true, cycle: 0 });

// ---------------------------------------------------------------- loop + free camera
const keys = {};
addEventListener("keydown", (e) => { keys[e.code] = true; });
addEventListener("keyup", (e) => { keys[e.code] = false; });
let yaw = Math.PI, pitch = -0.15, drag = false, lx = 0, ly = 0, auto = true;
addEventListener("pointerdown", (e) => { drag = true; lx = e.clientX; ly = e.clientY; auto = false; });
addEventListener("pointerup", () => { drag = false; });
addEventListener("pointermove", (e) => { if (!drag) return; yaw -= (e.clientX - lx) * 0.004; pitch -= (e.clientY - ly) * 0.004; lx = e.clientX; ly = e.clientY; });
const fwd = new THREE.Vector3();
function step(dt) {
  gameTime += dt;
  if (!auto) {
    const sp = (keys.ShiftLeft ? 40 : 10) * dt;
    fwd.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    if (keys.KeyW) camera.position.addScaledVector(fwd, sp);
    if (keys.KeyS) camera.position.addScaledVector(fwd, -sp);
    if (keys.KeyA) camera.position.x += Math.cos(yaw) * sp, camera.position.z -= Math.sin(yaw) * sp;
    if (keys.KeyD) camera.position.x -= Math.cos(yaw) * sp, camera.position.z += Math.sin(yaw) * sp;
    camera.lookAt(camera.position.x + fwd.x, camera.position.y + fwd.y, camera.position.z + fwd.z);
    player.position.set(camera.position.x + fwd.x * 6, heightAt(camera.position.x + fwd.x * 6, camera.position.z + fwd.z * 6), camera.position.z + fwd.z * 6);
  }
  for (const s of systems) s.fn(dt, gameTime);
  sun.target.position.copy(player.position);
  sun.position.normalize().multiplyScalar(120).add(player.position);
}
let last = performance.now();
function frame() {
  const now = performance.now(); const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!window.__manual && window.__ready) { step(dt); renderer.render(scene, camera); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
addEventListener("resize", () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });

// ---------------------------------------------------------------- screenshot API
window.__shot = async (o) => {
  window.__manual = true;
  window.__phase = "shot";
  if (o.cycle != null && o.cycle !== state.run.cycle) { state.run.cycle = o.cycle; bus.emit("run:reset", { cycle: o.cycle }); bus.emit("game:start", { newGame: true, cycle: o.cycle }); }
  const look = o.look, cam = o.cam;
  const target = o.player || look;
  const zid = ctx.world.zoneAt(target[0], target[1] + 0.5, target[2]);
  if (zid) await ctx.world.goto(zid, { pos: { x: target[0], y: target[1], z: target[2] }, fade: false });
  player.position.set(target[0], target[1], target[2]);
  camera.position.set(cam[0], cam[1], cam[2]);
  camera.fov = o.fov || 60; camera.updateProjectionMatrix();
  camera.lookAt(look[0], look[1], look[2]);
  if (o.atmo) setAtmosphere(o.atmo);
  for (let i = 0; i < 6; i++) step(0.3);
  renderer.info.reset();
  renderer.info.autoReset = false;
  renderer.render(scene, camera);
  const info = { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, zone: ctx.world.current };
  renderer.shadowMap.autoUpdate = false; renderer.info.reset(); renderer.render(scene, camera);
  info.mainCalls = renderer.info.render.calls; info.mainTris = renderer.info.render.triangles; renderer.shadowMap.autoUpdate = true;
  renderer.info.autoReset = true;
  return info;
};
window.__stats = () => {
  let meshes = 0, tris = 0;
  scene.traverse((o) => { if (o.isMesh) { meshes++; const g = o.geometry; const n = g.index ? g.index.count / 3 : g.attributes.position.count / 3; tris += n * (o.isInstancedMesh ? o.count : 1); } });
  return { buildMs: Math.round(buildMs), colliders: cols.length, meshes, tris: Math.round(tris), errors: window.__errs || [] };
};
window.__breakdown = () => {
  const out = {};
  const walk = (o, key) => {
    if (!o.visible) return;
    if (o.isMesh || o.isPoints || o.isLine) {
      const mats = Array.isArray(o.material) ? o.material.length : 1;
      out[key] = (out[key] || 0) + mats;
    }
    for (const c of o.children) walk(c, key === 'scene' ? (c.name || c.type) : key.startsWith('world') ? key + '/' + (c.name || c.type) : key);
  };
  for (const c of scene.children) walk(c, c.name === 'world' ? 'world' : (c.name || c.type));
  return Object.entries(out).sort((a, b) => b[1] - a[1]).slice(0, 25);
};
window.__stepN = (n, dt) => { window.__manual = true; for (let i = 0; i < n; i++) step(dt || 0.05); };
window.__pick = (px, py) => { const rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2(px / innerWidth * 2 - 1, -(py / innerHeight) * 2 + 1), camera); const hits = rc.intersectObject(scene, true).filter((h) => h.object.visible); return hits.slice(0, 3).map((h) => { const names = []; let o = h.object; while (o) { names.push(o.name || o.type); o = o.parent; } return names.join("<") + " @" + h.point.toArray().map((v) => v.toFixed(1)).join(",") + " mat " + (h.object.material.name || h.object.material.type); }); };
window.__busLog = [];
window.__ready = true;
