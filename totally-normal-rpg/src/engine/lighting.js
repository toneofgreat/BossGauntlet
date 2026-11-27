// lighting.js - the one shadowed directional sun (tight frustum following the focus point, texel-snapped),
// hemisphere fill, and the sky-derived environment map (PMREM, regenerated only when the sky settles).

export function createLighting(THREE, engine) {
  const scene = engine.scene;
  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.name = "sun";
  sun.castShadow = true;
  const S = 20; // half extent of the tight shadow frustum (40 m)
  const cam = sun.shadow.camera;
  cam.left = -S; cam.right = S; cam.top = S; cam.bottom = -S; cam.near = 1; cam.far = 160;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.035;
  sun.shadow.radius = 3;
  scene.add(sun);
  scene.add(sun.target);

  const hemi = new THREE.HemisphereLight(0xbfd4ff, 0x5a5040, 0.6);
  hemi.name = "hemi";
  scene.add(hemi);

  const sunDir = new THREE.Vector3(0.4, 0.7, -0.5).normalize();
  const focus = new THREE.Vector3();
  const _r = new THREE.Vector3(), _u = new THREE.Vector3(), _f = new THREE.Vector3(), _t = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);

  let pmrem = null;
  let envRT = null;
  let envDirty = true;
  let envTimer = 0;
  let envEnabled = true;

  function setShadowSize(size, radius) {
    if (sun.shadow.mapSize.x !== size) {
      sun.shadow.mapSize.set(size, size);
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    }
    sun.shadow.radius = radius;
  }

  // texel-snapped follow: the frustum moves in whole shadow-map texels to avoid shimmering
  function follow(p) {
    focus.copy(p);
    _f.copy(sunDir).negate(); // light travel direction
    _r.crossVectors(UP, _f);
    if (_r.lengthSq() < 1e-6) _r.set(1, 0, 0);
    _r.normalize();
    _u.crossVectors(_f, _r).normalize();
    const texel = (2 * S) / sun.shadow.mapSize.x;
    const a = Math.round(focus.dot(_r) / texel) * texel;
    const b = Math.round(focus.dot(_u) / texel) * texel;
    const c = focus.dot(_f);
    _t.copy(_r).multiplyScalar(a).addScaledVector(_u, b).addScaledVector(_f, c);
    sun.target.position.copy(_t);
    sun.position.copy(_t).addScaledVector(sunDir, 80);
    sun.target.updateMatrixWorld();
  }

  function markEnvDirty() { envDirty = true; }

  function updateEnv(dt, skyScene, blending) {
    if (!envEnabled) return;
    envTimer -= dt;
    if (!envDirty || envTimer > 0) return;
    // while blending, refresh at most every 1.2 s; on settle refresh once
    envTimer = blending ? 1.2 : 0;
    if (!blending) envDirty = false;
    try {
      if (!pmrem) pmrem = new THREE.PMREMGenerator(engine.renderer);
      const old = envRT;
      envRT = pmrem.fromScene(skyScene, 0, 0.1, 1000, { size: 64 });
      scene.environment = envRT.texture;
      if (old) old.dispose();
    } catch (e) {
      console.warn("[lighting] env capture failed", e);
      envEnabled = false;
    }
  }

  return { sun, hemi, sunDir, focus, follow, setShadowSize, updateEnv, markEnvDirty, shadowHalf: S };
}
