// renderer.js - WebGL renderer, scene, camera, resize handling and the shared tileable noise texture.
// Tone mapping / sRGB happen in postfx's composite pass, so the renderer renders linear HDR into postfx's target.

import { tfbm } from "./noise.js";

export function createRenderer(THREE, canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: false, alpha: false, stencil: false, depth: true,
    powerPreference: "high-performance", preserveDrawingBuffer: false
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.info.autoReset = false;
  renderer.setClearColor(0x000000, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xbfcfe0, 0.0035);
  scene.background = null;
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 2600);
  camera.position.set(0, 3, -6);
  scene.add(camera);

  let pr = 1;
  let w = 1, h = 1;
  const listeners = [];
  function measure() {
    w = Math.max(1, window.innerWidth | 0);
    h = Math.max(1, window.innerHeight | 0);
  }
  function apply() {
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    canvas.style.width = "100%"; canvas.style.height = "100%";
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    for (let i = 0; i < listeners.length; i++) { try { listeners[i](w, h, pr); } catch (e) { console.warn("[renderer]", e); } }
  }
  measure();
  let pending = 0;
  window.addEventListener("resize", () => {
    clearTimeout(pending);
    pending = setTimeout(() => { measure(); apply(); }, 60);
  });
  window.addEventListener("orientationchange", () => setTimeout(() => { measure(); apply(); }, 250));

  return {
    renderer, scene, camera,
    get width() { return w; }, get height() { return h; }, get pixelRatio() { return pr; },
    setPixelRatio(p) { pr = Math.max(0.5, Math.min(2, p)); apply(); },
    onResize(fn) { listeners.push(fn); },
    apply
  };
}

// 256x256 RGBA tileable noise: r = low freq, g = mid, b = high, a = fine detail. Linear (not colour) data.
export function createNoiseTexture(THREE) {
  const S = 256;
  const data = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S;
      const i = (y * S + x) * 4;
      data[i] = to8(tfbm(u * 4, v * 4, 4, 4, 11));
      data[i + 1] = to8(tfbm(u * 8, v * 8, 8, 4, 23));
      data[i + 2] = to8(tfbm(u * 16, v * 16, 16, 3, 37));
      data[i + 3] = to8(tfbm(u * 32, v * 32, 32, 2, 51));
    }
  }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.colorSpace = THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}
function to8(v) {
  // tfbm returns roughly 0..1; stretch a little for contrast
  const c = (v - 0.5) * 1.35 + 0.5;
  return Math.max(0, Math.min(255, Math.round(c * 255)));
}
