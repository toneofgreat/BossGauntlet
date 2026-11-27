// area1.js - Nessa's bridge + river life, the waterfall (cave behind the water, Rookie's shack in the cavern),
// the rat field, the Rat King's sunken ring + old mill ruin, and the palisade gate to the village (gate2 visuals).

export function buildArea1(W) {
  buildBridge(W);
  buildWaterfall(W);
  buildRatField(W);
  buildRatKing(W);
  buildGate2(W);
}

const PI = Math.PI;

function buildBridge(W) {
  const { K, P, THREE } = W;
  const M = (n, o) => K.mat(n, o);
  const Z = W.zone("bridge");
  const z = Z.z, h = W.h;
  const st = M("stoneBrick", { color: "#938d82" }), stD = M("stoneBrick", { color: "#7f796e" });
  const plank = M("woodPlank", { color: "#8a6a46" }), dk = M("woodDark");
  const DECK = 2.2;
  // ---- stone arch: span z 52..68, springing y -0.6, crown underside y 1.75
  const S = 16, f = 2.35, Rr = (S * S / 4 + f * f) / (2 * f), cy = 1.75 - Rr;
  const a0 = Math.asin((S / 2) / Rr);
  const n = 26;
  for (let i = 0; i < n; i++) {
    const a = -a0 + (2 * a0 * (i + 0.5)) / n;
    const r = Rr + 0.3;
    const zz = 60 + Math.sin(a) * r, yy = cy + Math.cos(a) * r;
    z.box(i % 2 ? st : stD, 0, yy, zz, 4.4, 0.6, (2 * a0 * Rr) / n + 0.02, { rx: a, tex: 1.2 });
  }
  // arch collider (walkable top approximated by steps; mainly keeps players from walking through)
  for (let i = 0; i < 8; i++) {
    const a = -a0 + (2 * a0 * (i + 0.5)) / 8;
    const zz = 60 + Math.sin(a) * (Rr + 0.3), yy = cy + Math.cos(a) * (Rr + 0.3);
    z.colBox(0, yy, zz, 4.4, 0.6, (2 * a0 * Rr) / 8, { surface: "stone" });
  }
  // spandrel walls between arch and deck on both faces
  for (let q = 52.2; q <= 67.8; q += 0.8) {
    const dz = q - 60;
    const archTop = cy + Math.sqrt(Math.max(0, (Rr + 0.6) * (Rr + 0.6) - dz * dz));
    const top = DECK - 0.25, hh = top - archTop;
    if (hh <= 0.05) continue;
    for (const sx of [-2.05, 2.05]) z.box((q * 10) % 2 < 1 ? st : stD, sx, archTop + hh / 2, q, 0.32, hh, 0.82, { tex: 1.2 });
  }
  // abutments + wing walls
  for (const sz of [-1, 1]) {
    const zc = 60 + sz * 7.3;   // under the deck ends (51.1 / 68.9): at 9.6 the abutment tops stuck 1 m out of the ramps and blocked the road
    const gy = Math.min(h(0, zc), 0);
    const hh = DECK - 0.25 - (gy - 2.5);
    z.box(st, 0, gy - 2.5 + hh / 2, zc, 4.6, hh, 3.2, { col: true, tex: 1.2 });
    for (const sx of [-1, 1]) z.box(stD, sx * 2.9, gy - 1.2 + (DECK + 1.2 - gy) / 2 - 0.4, zc + sz * 1.6, 0.6, DECK + 0.8 - gy, 3.0, { ry: sx * sz * 0.35, tex: 1.2 });
  }
  // timber deck
  z.box(dk, -1.4, DECK - 0.22, 60, 0.25, 0.25, 18.4); z.box(dk, 1.4, DECK - 0.22, 60, 0.25, 0.25, 18.4); z.box(dk, 0, DECK - 0.22, 60, 0.25, 0.25, 18.4);
  for (let q = 51.1; q < 69; q += 0.32) z.inst(K.boxGeo(4.3, 0.08, 0.3, 1.5), plank, 0, DECK - 0.05, q, { ry: ((q * 7) % 3 - 1) * 0.004 });
  z.colBox(0, DECK - 0.2, 60, 4.4, 0.4, 18.2, { surface: "wood" });
  // ramps onto the deck
  const g0 = h(0, 46.5), g1 = h(0, 73.5);
  z.ramp(0, g0, 46.2, 0, DECK, 51.1, 4.2, "wood");
  z.ramp(0, DECK, 68.9, 0, g1, 73.8, 4.2, "wood");
  for (let i = 0; i < 10; i++) {
    const t = (i + 0.5) / 10;
    z.inst(K.boxGeo(4.3, 0.1, 0.52, 1.5), plank, 0, g0 + (DECK - g0) * t - 0.05, 46.2 + 4.9 * t, { rx: -Math.atan2(DECK - g0, 4.9) });
    z.inst(K.boxGeo(4.3, 0.1, 0.52, 1.5), plank, 0, DECK + (g1 - DECK) * t - 0.05, 68.9 + 4.9 * t, { rx: Math.atan2(DECK - g1, 4.9) });
  }
  for (const [za, zb, ya, yb] of [[46.2, 51.1, g0, DECK], [68.9, 73.8, DECK, g1]]) {
    for (const sx of [-2.25, 2.25]) z.box(st, sx, (ya + yb) / 2 - 0.6, (za + zb) / 2, 0.4, Math.max(ya, yb) - Math.min(ya, yb) + 1.4, zb - za, { tex: 1.2 });
  }
  // railings (posts + two rails), colliders
  for (const sx of [-2.1, 2.1]) {
    for (let q = 51; q <= 69.01; q += 1.5) z.inst(K.boxGeo(0.16, 1.15, 0.16), dk, sx, DECK + 0.55, q);
    z.box(dk, sx, DECK + 1.08, 60, 0.12, 0.12, 18.2);
    z.box(dk, sx, DECK + 0.6, 60, 0.08, 0.08, 18.2);
    z.colBox(sx, DECK + 0.6, 60, 0.2, 1.2, 18.2, { walk: false });
    for (const [za, zb, ya, yb] of [[46.2, 51.1, g0, DECK], [68.9, 73.8, DECK, g1]]) {
      const len = Math.hypot(zb - za, yb - ya), ang = Math.atan2(yb - ya, zb - za);
      z.box(dk, sx, (ya + yb) / 2 + 1.05, (za + zb) / 2, 0.1, 0.1, len, { rx: -ang });
      z.colBox(sx, (ya + yb) / 2 + 0.6, (za + zb) / 2, 0.2, 1.2 + Math.abs(yb - ya), zb - za, { walk: false });
    }
  }
  P.lantern(z, 2.1, DECK + 1.15, 51.2, Z.fx.flames);
  P.lantern(z, -2.1, DECK + 1.15, 68.8, Z.fx.flames);
  // ---- under-bridge nook (secret): ledge + stepping stones from the north bank
  z.box(stD, -1.6, -1.47, 60, 2.8, 2.25, 3.6, { col: true, tex: 1.2 });
  z.box(K.flat("#6e6a5e", 0.9), -1.6, -0.34, 60, 2.9, 0.06, 3.7);
  for (const [sx, sy, sz, r] of [[-2.7, -0.25, 55.3, 0.55], [-2.4, -0.3, 56.9, 0.5], [-2.0, -0.32, 58.0, 0.45]]) {
    z.cyl(M("rock", { color: "#7e7a70" }), sx, sy - 1.1, sz, r * 0.9, r, 2.2, { col: true, seg: 9 });
  }
  // the nook's furnishings: a stool, a candle stub, a fishing rod, a carved note
  z.cyl(M("woodPlank", { color: "#7a5a3a" }), -2.4, -0.1, 60.8, 0.18, 0.2, 0.5, { seg: 8 });
  P.candle(z, -0.7, -0.31, 59.0, Z.fx.flames, { layer: "main" });
  z.cyl(M("woodPlank", { color: "#a08050" }), -0.8, 0.6, 61.2, 0.015, 0.02, 2.4, { rx: 0.9, seg: 5 });
  z.geo(K.planeGeo(0.6, 0.35), K.texMat("trollnote", K.signTex(["NO TROLLS", "(checked)"], { w: 256, h: 150, style: "stone" })), -1.6, 0.4, 61.92, { ry: PI });
  P.redEyes(z, 1.8, 0.2, 63.5, PI, {});
  P.redEyes(z, 1.2, 0.0, 56.8, 0, {});
  W.point("underBridge", -1.6, -0.31, 60);
  // ---- Nessa's toll booth (no toll)
  z.frame(5.6, h(5.6, 72.6), 72.6, -PI / 2 + 0.25, () => {
    P.house(z, { w: 2.4, d: 2.0, h: 2.3, roof: "tile", pitch: 32, plaster: "#d8ccb0", beams: true, chimney: false, windows: false, found: 0.8, floorY: 0.2, doorAngle: 1.4, roofColor: "#6a4a38" });
  });
  P.signpost(z, 3.6, 75.0, 0.4, ["BRIDGE", "no toll, no trolls"], { w: 1.3, y: h(3.6, 75) });
  P.barrel(z, 4.4, 68.4, { y: h(4.4, 68.4) });
  // ---- river life: reeds, rocks in the water, a jetty + rowboat, lily pads, ducks
  const reed = K.coneGeo(0.03, 1.3, 4), reedM = M("leaves", { color: "#6a8a3a" }), reedD = K.flat("#6a5a3a");
  for (let i = 0; i < 220; i++) {
    const side = i % 2 ? 1 : -1;
    const x = -60 + ((i * 53) % 120) + Math.sin(i) * 0.6;
    if (Math.abs(x) < 4) continue;
    const zz = 60 + side * (5.2 + ((i * 17) % 10) * 0.12);
    const y = Math.max(-0.9, h(x, zz)) + 0.55;
    z.inst(reed, reedM, x, y, zz, { layer: "c0", rz: ((i * 7) % 5 - 2) * 0.06, sy: 0.8 + (i % 4) * 0.15 });
    z.inst(reed, reedD, x, y - 0.2, zz, { layer: "ng", rz: ((i * 7) % 5 - 2) * 0.25, sy: 0.6 });
  }
  for (let i = 0; i < 18; i++) {
    const x = -55 + i * 6.3 + Math.sin(i * 3) * 2;
    if (Math.abs(x) < 5) continue;
    P.rock(z, x, -1.5, 57 + ((i * 7) % 10), 0.6 + (i % 3) * 0.35, i + 40, { color: "#6e6c66" });
  }
  const pad = K.circleGeo(0.28, 10), padM = M("leaves", { color: "#4a7a36" });
  for (let i = 0; i < 30; i++) z.inst(pad, padM, 18 + (i % 6) * 1.3 + Math.sin(i) * 0.4, -0.58, 55.6 + ((i / 6) | 0) * 0.5, { layer: "c0", ry: i });
  // jetty
  z.frame(-22, 0, 54.2, 0, () => {
    for (let q = -1.5; q < 4.5; q += 0.28) z.inst(K.boxGeo(1.6, 0.06, 0.26, 1.5), plank, 0, 0.12, q);
    for (const sx of [-0.7, 0.7]) for (const q of [-1.2, 1.2, 3.8]) z.cyl(dk, sx, -0.9, q, 0.09, 0.09, 2.2, { seg: 6 });
    z.colBox(0, 0.0, 1.5, 1.6, 0.3, 6.0, { surface: "wood" });
    z.frame(1.6, -0.6, 3.0, 0.15, () => {
      z.geo(K.latheGeo("boat", [[0, -0.05], [0.55, 0.0], [0.62, 0.35], [0.6, 0.4], [0, 0.32]], 12), M("woodPlank", { color: "#6e5236" }), 0, -0.05, 0, { sz: 3.0, sx: 1.0 });
      z.box(plank, 0, 0.25, 0.3, 1.0, 0.05, 0.25);
    });
  });
  // ducks (live props; bob + drift; red eyes in cycle 1)
  const ducks = [];
  for (let i = 0; i < 5; i++) {
    const d = P.duck();
    d.position.set(-30 + i * 13 + (i % 2) * 3, -0.62, 57.5 + (i % 3) * 2.2);
    d.userData.c = { x: d.position.x, z: d.position.z, r: 1.2 + (i % 3) * 0.6, s: 0.12 + i * 0.03, p: i * 1.7 };
    Z.root.add(d);
    ducks.push(d);
  }
  W.anim("bridge", (dt, t) => {
    for (let i = 0; i < ducks.length; i++) {
      const d = ducks[i], c = d.userData.c;
      const a = t * c.s + c.p;
      d.position.x = c.x + Math.sin(a) * c.r;
      d.position.z = c.z + Math.cos(a) * c.r * 0.6;
      d.position.y = -0.62 + Math.sin(t * 2.1 + c.p) * 0.015;
      d.rotation.y = a + PI / 2;
    }
  }, 70);
  z.excludeRect(-3, 44, 3, 76);
  z.exclude(5.6, 72.6, 3);
  z.finish();
}

function buildWaterfall(W) {
  const { K, P, THREE } = W;
  const M = (n, o) => K.mat(n, o);
  const Z = W.zone("waterfall");
  const z = Z.z;
  const rockM = M("rock", { color: "#706c64" }), rockD = M("rock", { color: "#5e5a54" });
  // ---- my own near-vertical cliff face in front of the terrain slope (x -64.6..-66), z 38..82
  const mouth = { z0: 58.3, z1: 61.7, y0: 0.6, y1: 4.0 };
  // layered strata slabs over ENGINE's cliff slope (x -66..-69): flat, overlapping, lighter at the top
  for (let i = 0; i < 28; i++) {
    const zz = 38.5 + i * 1.6;
    for (let row = 0; row < 16; row++) {
      const yy = -2.6 + row * 1.0 + ((i * 7 + row * 3) % 5) * 0.1;
      if (zz > mouth.z0 - 1.0 && zz < mouth.z1 + 1.0 && yy < mouth.y1 + 0.5) continue;
      const k = (i * 3 + row * 5) % 7;
      const xx = -65.6 - Math.max(0, Math.min(3.2, (yy + 1) * 0.24)) + (k % 3) * 0.25;
      P.rock(z, xx, yy, zz + (k - 3) * 0.15, 1.3 + (k % 3) * 0.25, i * 11 + row * 17 + 1,
        { color: row > 11 ? "#9a958a" : row % 2 ? "#85807a" : "#908a80", sx: 0.8, sy: 0.75, sz: 1.3 });
    }
    P.rock(z, -68.6, 13.2, zz, 1.9, i * 3 + 7, { color: "#7e7a70", sx: 1.5, sy: 0.6 });
  }
  // frame the mouth
  P.rock(z, -65.6, mouth.y1 - 0.2, 60, 2.3, 3, { sx: 0.8, sy: 0.6, sz: 1.3, color: "#5e5a52" });
  P.rock(z, -65.5, -1.5, mouth.z0 - 0.9, 1.4, 5, { sy: 2.2, color: "#66625a" });
  P.rock(z, -65.5, -1.5, mouth.z1 + 0.9, 1.4, 6, { sy: 2.2, color: "#66625a" });
  z.colBox(-65.4, 6.5, 47, 1.6, 22, 18.4, { walk: false, surface: "rock" });
  z.colBox(-65.4, 6.5, 73, 1.6, 22, 18.4, { walk: false, surface: "rock" });
  z.colBox(-65.4, 9.5, 60, 1.6, 11, 6, { walk: false, surface: "rock" });
  // ledge path from the north bank to the mouth, behind the falling water
  const ledge = [[-61.8, 0.15, 52.4, 1.3], [-63.4, 0.4, 54.0, 1.1], [-64.4, 0.62, 55.7, 0.95], [-64.9, 0.8, 57.4, 0.9]];
  for (const [x, y, zz, r] of ledge) {
    z.cyl(rockD, x, y - 1.6, zz, r * 0.9, r, 3.2, { col: true, seg: 9 });
    z.geo(K.circleGeo(r * 0.92, 9), K.flat("#5e5a50", 0.4, 0.1), x, y + 0.01, zz);
  }
  // wet sheen strip
  // ---- the waterfall sheet (if ENGINE's water module doesn't already draw one)
  const engineFall = !!W.engine.water;   // ENGINE water.js draws the waterfall sheet + mist (CONTRACT 5.6)
  if (!engineFall) {
    const fallMat = new THREE.ShaderMaterial({
      uniforms: { uTime: K.timeU },
      vertexShader: `varying vec2 vUv; varying float vY; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vY = w.y; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform float uTime; varying vec2 vUv; varying float vY;
        float h(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
        float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
        void main(){
          vec2 p = vec2(vUv.x * 22.0, vUv.y * 6.0 + uTime * 2.6);
          float s = n(p) * 0.6 + n(p * 2.3 + 3.1) * 0.4;
          float streak = smoothstep(0.35, 0.95, s);
          float edge = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
          vec3 c = mix(vec3(0.52, 0.62, 0.66), vec3(0.95, 0.97, 0.98), streak);
          float foam = smoothstep(0.15, 0.0, vUv.y);
          c = mix(c, vec3(1.0), foam);
          gl_FragColor = vec4(c, (0.55 + 0.4 * streak + foam * 0.4) * edge);
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    // curved sheet: lip at (-67.2, 14.3), base at (-63.4, -0.6), z 55..65
    const segY = 24;
    const g = new THREE.PlaneGeometry(10, 1, 12, segY);
    const p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const v = uv.getY(i);       // 0 bottom .. 1 top
      const u = uv.getX(i);
      const y = -0.6 + v * 14.9;
      const x = -63.4 - 3.8 * Math.pow(v, 0.6);
      p.setXYZ(i, x, y, 55 + u * 10);
    }
    g.computeVertexNormals(); g.computeBoundingSphere();
    const sheet = new THREE.Mesh(g, fallMat);
    sheet.renderOrder = 6;
    Z.root.add(sheet);
    // a second, thinner veil in front for depth
    const sheet2 = new THREE.Mesh(g, fallMat);
    sheet2.position.set(0.5, 0, 0.0); sheet2.scale.set(1, 1, 1);
    sheet2.renderOrder = 6;
    Z.root.add(sheet2);
    Z.fx.mist.add(-63.2, -0.5, 60, 26, 3.2, 5, 2.6);
    Z.fx.mist.add(-62.0, -0.2, 57, 8, 2.4, 6, 2);
    Z.fx.mist.add(-62.0, -0.2, 63, 8, 2.4, 6, 2);
    // foam disc at the plunge
    const foam = new THREE.Mesh(K.circleGeo(5.5, 24), new THREE.MeshBasicMaterial({ color: "#e8eeee", transparent: true, opacity: 0.35, depthWrite: false }));
    foam.position.set(-62.8, -0.57, 60); foam.scale.set(0.6, 1, 1.1); foam.renderOrder = 5;
    Z.root.add(foam);
  }
  W.sound("waterfall", { x: -63.5, y: 1, z: 60 }, 60);
  // ---- depth punch for the cave mouth (we look "into" the terrain)
  const pm = z.punch(K.planeGeo(mouth.z1 - mouth.z0, mouth.y1 - mouth.y0), -64.8, (mouth.y0 + mouth.y1) / 2, 60, { ry: PI / 2 });
  W.punch(pm, (cam) => cam.x > -64.8 && cam.x < 20 && Math.abs(cam.z - 60) < 80);

  // ---- lid over ENGINE's CAVE_POCKET terrain hole (x -96..-69, z 56.5..63.5): upper riverbed + shadow
  z.box(rockD, -82.5, 10.9, 60, 27.6, 1.2, 7.8, { col: true, surface: "rock" });
  // ---- the cave tunnel (x -64.8 .. -82) and cavern (Rookie's shack)
  const cave = z.layer("cave", { cast: false, receive: true, renderOrder: 11, hideDist: 70, anchor: { x: -78, y: 2, z: 60 } });
  void cave;
  const C = { layer: "cave" };
  const cr = K.flat("#4a4640", 0.95), cf = K.flat("#3e3a34", 1), wet = K.flat("#2e2c2a", 0.3, 0.1);
  const F = 1.0;
  // tunnel floor rises gently from the mouth (0.8) to the cave floor (1.0)
  z.box(cf, -73.4, F - 0.25, 60, 17.4, 0.5, 3.6, { ...C, col: true, surface: "rock" });
  for (const sz of [-1, 1]) z.box(cr, -73.4, F + 2.0, 60 + sz * 2.0, 17.4, 4.6, 0.5, { ...C, col: true, walk: false, tex: 2.5 });
  z.box(cr, -73.4, F + 4.3, 60, 17.4, 0.5, 4.5, { ...C, col: true, tex: 2.5 });
  for (let i = 0; i < 14; i++) {
    const x = -65.8 - i * 1.2, sz = i % 2 ? 1 : -1;
    P.rock(z, x, F + 0.4 + (i % 3) * 1.2, 60 + sz * 1.6, 0.7 + (i % 3) * 0.2, i + 60, { layer: "cave", color: "#4e4a44" });
    z.geo(K.coneGeo(0.12 + (i % 3) * 0.05, 0.5 + (i % 4) * 0.3, 5), cr, x - 0.4, F + 3.9 - (i % 4) * 0.12, 60 + ((i * 3) % 5 - 2) * 0.6, { ...C, rx: PI });
  }
  z.box(wet, -72, F + 0.01, 60, 10, 0.02, 1.4, C);
  W.point("waterfallCave", -75, F, 60);
  // cavern room: x -96..-81, z 52..68
  const cx = -88.5, cz = 60, rx = 7.2, rz = 7.8;
  z.box(cf, cx, F - 0.25, cz, 15.4, 0.5, 16.4, { ...C, col: true, surface: "rock" });
  z.box(cr, cx, F + 6.2, cz, 15.4, 0.5, 16.4, { ...C, col: true });
  const wallN = 22;
  for (let i = 0; i < wallN; i++) {
    const a = (i / wallN) * PI * 2;
    const wx = cx + Math.cos(a) * rx, wz = cz + Math.sin(a) * rz;
    if (Math.cos(a) > 0.92) continue;    // tunnel opening on the +X side
    const len = 2.4;
    z.box(cr, wx, F + 3.0, wz, 1.2, 6.4, len, { ...C, ry: -a, col: true, walk: false, tex: 2.5 });
    P.rock(z, wx - Math.cos(a) * 0.4, F + 0.2, wz - Math.sin(a) * 0.4, 1.1 + (i % 3) * 0.4, i + 80, { layer: "cave", color: "#4a4640", sy: 1.6 });
  }
  // the gap between tunnel end and the cavern wall ring
  for (const sz of [-1, 1]) z.box(cr, -81.6, F + 3.0, cz + sz * 4.6, 1.4, 6.4, 5.4, { ...C, col: true, walk: false });
  for (let i = 0; i < 18; i++) {
    const a = i * 2.4, rr = 2 + (i % 5);
    z.geo(K.coneGeo(0.18 + (i % 3) * 0.08, 0.8 + (i % 4) * 0.4, 6), cr, cx + Math.cos(a) * rr, F + 5.8, cz + Math.sin(a) * rr, { ...C, rx: PI });
  }
  // glowing mushrooms
  const mush = K.glow("#58e0c8", 1.1);
  for (let i = 0; i < 26; i++) {
    const a = i * 0.9 + 0.3, rr = 5.2 + (i % 3) * 0.6;
    const mx = cx + Math.cos(a) * rr, mz = cz + Math.sin(a) * rr * 1.05;
    if (Math.cos(a) > 0.85) continue;
    z.geo(K.sphereGeo(0.09 + (i % 3) * 0.04, 8, 4), mush, mx, F + 0.12, mz, { layer: "cave", sy: 0.5 });
    z.cyl(K.flat("#c8c0a8"), mx, F + 0.05, mz, 0.02, 0.025, 0.1, { ...C, seg: 5 });
  }
  // Rookie's shack: open-fronted lean-to facing the tunnel (+X)
  z.frame(-91.0, F, 60, PI / 2, () => {
    const wm = M("woodPlank", { color: "#7a5a3a" }), d2 = M("woodDark");
    z.box(wm, 0, 0.1, 0, 4.2, 0.2, 3.6, { ...C, col: true, surface: "wood" });
    z.box(wm, 0, 1.4, -1.75, 4.2, 2.6, 0.12, { ...C, col: true, walk: false });
    for (const sx of [-2.05, 2.05]) z.box(wm, sx, 1.3, 0, 0.12, 2.4, 3.6, { ...C, col: true, walk: false });
    for (const sx of [-2.05, 2.05]) z.box(d2, sx, 1.4, 1.75, 0.16, 2.8, 0.16, C);
    z.box(M("thatch"), 0, 2.85, 0.1, 4.8, 0.25, 4.3, { ...C, rx: 0.18 });
    // inside: cot, mirror, cape hook, chalkboard "BOSS RULES", books
    P.bed(z, -1.3, -0.5, 0, { y: 0.2, layer: "cave", blanket: "clothBlue" });
    z.box(K.flat("#20262a", 0.1, 0.6), 1.4, 1.5, -1.66, 0.6, 0.9, 0.03, C);
    z.box(d2, 1.4, 1.5, -1.69, 0.7, 1.0, 0.02, C);
    const board = K.signTex(["BOSS RULES", "1. be scary", "2. don't trip", "3. BE SCARY"], { w: 384, h: 288, style: "paper" });
    z.geo(K.planeGeo(1.0, 0.75), K.texMat("bossrules", board), 0.1, 1.6, -1.68, C);
    const poster = K.signTex(["ROOKIE", "BOSS", "(in training)"], { w: 256, h: 340, style: "paper" });
    z.geo(K.planeGeo(0.6, 0.8), K.texMat("rookieposter", poster), 2.0, 1.7, 0.6, { ...C, ry: -PI / 2 });
    for (let i = 0; i < 4; i++) z.box(K.flat(["#7a2a22", "#2a4a7a", "#5a6a2a", "#6a3a6a"][i]), -0.6 + i * 0.09, 0.42 + i * 0.02, 1.2, 0.08, 0.32, 0.24, { ...C, rz: i === 3 ? 0.4 : 0 });
    z.cyl(M("clothRed", { color: "#5a1a6a" }), -1.95, 1.4, 1.1, 0.02, 0.25, 1.2, { ...C, seg: 8 });
  });
  P.dummy(z, -85.0, 63.6, -2.2, { y: F, layer: "cave" });
  P.dummy(z, -85.4, 56.4, -1.0, { y: F, layer: "cave" });
  // campfire + the zone's one light
  z.frame(-84.6, F, 60, 0, () => {
    for (let i = 0; i < 8; i++) { const a = (i / 8) * PI * 2; P.rock(z, Math.cos(a) * 0.55, -0.1, Math.sin(a) * 0.55, 0.22, i + 3, { layer: "cave", color: "#5a5650" }); }
    for (let i = 0; i < 3; i++) z.cyl(M("bark"), 0, 0.12, 0, 0.06, 0.06, 0.8, { ...C, rz: PI / 2, ry: i * 1.05, seg: 6 });
    const w = z.world(0, 0.2, 0); Z.fx.flames.add(w.x, w.y, w.z, 10, 0.5, 0.9, 1.1);
    Z.fx.motes.add(w.x, w.y + 0.6, w.z, 14, 0.06, 3, 0.5);
  });
  P.crate(z, -94.0, 55.5, 0.9, { y: F, layer: "cave" }); P.crate(z, -93.7, 54.6, 0.6, { y: F + 0.9, layer: "cave", col: false });
  P.barrel(z, -93.2, 65.2, { y: F, layer: "cave" });
  const caveLight = new THREE.PointLight("#ffa050", 9, 14, 2);
  z.object(caveLight, -84.6, F + 1.0, 60);
  W.light("rookieShack", caveLight, { flicker: true, base: 9 });
  // keep the sun out of the cavern + tunnel
  z.shadowLid(-80, 9.5, 60, 34, 1, 20);
  W.point("rookieShack", -88, F, 60);
  z.finish();
}

function buildRatField(W) {
  const { K, P, THREE } = W;
  const M = (n, o) => K.mat(n, o);
  const Z = W.zone("ratField");
  const z = Z.z, h = W.h;
  // perimeter rail fence (gaps at the road ends and a few broken spans)
  const fence = (x0, z0, x1, z1, broken) => P.fenceRun(z, x0, z0, x1, z1, { ground: h, broken });
  fence(-35, 75, -2.6, 75, (i) => i === 7); fence(2.6, 75, 35, 75);
  fence(-35, 125, -2.6, 125); fence(2.6, 125, 35, 125, (i) => i === 3 || i === 4);
  fence(-35, 75, -35, 125, (i) => i === 11); fence(35, 75, 35, 125);
  // haystacks; kitten #2 at the base of the one at (18, 108)
  const stacks = [[18, 109.6, 1.5], [-20, 112, 1.6], [-26, 96, 1.3], [24, 88, 1.4], [-8, 118, 1.2], [9, 93, 1.1], [28, 118, 1.5]];
  for (const [x, zz, r] of stacks) P.haystack(z, x, zz, r, { y: h(x, zz) - 0.05 });
  for (let i = 0; i < 9; i++) {
    const x = -14 + (i % 3) * 1.15, zz = 102 + ((i / 3) | 0) * 0.6;
    P.hayBale(z, x, h(x, zz) + (i > 5 ? 0.5 : 0), zz, 0.1, { col: i <= 5 });
  }
  P.hayBale(z, 12.5, h(12.5, 116), 116, 1.2); P.hayBale(z, 13.4, h(13.4, 116.6), 116.6, 0.9);
  // kitten #2 hides in the hay
  const kit1 = P.kitten("#d8d0c4");
  kit1.position.set(18.0, h(18, 108) + 0.0, 107.85); kit1.rotation.y = 0.4;
  Z.root.add(kit1);
  W.prop("kitten1", kit1);
  W.point("kitten1", 18.0, h(18, 108), 107.85);
  // water trough, feed sacks, cart, scarecrows
  z.frame(-12, h(-12, 86), 86, 0.3, () => {
    z.box(M("woodPlank", { color: "#6a4e32" }), 0, 0.35, 0, 2.4, 0.7, 0.7, { col: true });
    z.box(K.flat("#2c3a3a", 0.08, 0.3), 0, 0.62, 0, 2.2, 0.04, 0.5);
  });
  for (let i = 0; i < 5; i++) {
    const x = -10.8 + i * 0.55, zz = 87.6;
    z.geo(K.sphereGeo(0.32, 8, 6), M("cardboard", { color: "#c8b48a" }), x, h(x, zz) + 0.28, zz, { sx: 0.8, sy: 1.0, sz: 0.6 });
  }
  P.cart(z, 26, 104, 1.9, { y: h(26, 104), load: "barrels" });
  P.scarecrow(z, -2, 108, PI, { y: h(-2, 108) });
  P.scarecrow(z, 22, 80, -2.2, { y: h(22, 80) });
  // rat burrows: dark holes + dirt rings
  const hole = K.circleGeo(0.35, 10), holeM = K.flat("#120e0a", 1), ring = K.ringGeo(0.3, 0.75, 12, 1);
  for (let i = 0; i < 14; i++) {
    const x = -28 + ((i * 37) % 56), zz = 82 + ((i * 23) % 38);
    z.inst(hole, holeM, x, h(x, zz) + 0.03, zz, { layer: "flat" });
    z.inst(ring, M("dirt", { color: "#6a5038" }), x, h(x, zz) + 0.02, zz, { layer: "flat" });
  }
  // cheese crumbs (the rats are here for a reason)
  for (let i = 0; i < 40; i++) {
    const x = -25 + ((i * 41) % 50), zz = 84 + ((i * 29) % 36);
    z.inst(K.boxGeo(0.12, 0.07, 0.09), M("cheese"), x, h(x, zz) + 0.035, zz, { layer: "small", ry: i });
  }
  // an old stone wall stub + a lone field tree is vegetation; Tobin's stool by the fence
  z.frame(-27, h(-27, 120), 120, 0.4, () => {
    for (let i = 0; i < 7; i++) z.box(M("stoneBrick", { color: "#8a857a" }), i * 0.9 - 3, 0.35 + (i % 2) * 0.05, 0, 0.92, 0.7 - (i % 3) * 0.15, 0.6, { col: true, ry: (i % 3 - 1) * 0.05 });
  });
  z.cyl(M("woodPlank", { color: "#8a6a46" }), -22.8, h(-22.8, 76.2) + 0.22, 76.2, 0.17, 0.2, 0.44, { seg: 8, col: true });
  P.signpost(z, -4.2, 77.5, 0.3, ["RAT FIELD", "mind your ankles"], { w: 1.4, y: h(-4.2, 77.5) });
  P.signpost(z, 4.0, 122.5, -0.3, ["OLD MILL", "rat king. probably."], { w: 1.4, y: h(4, 122.5) });
  // cycle 1: eyes in the burrows and behind the haystacks
  for (let i = 0; i < 14; i++) {
    const x = -28 + ((i * 37) % 56), zz = 82 + ((i * 23) % 38);
    P.redEyes(z, x, h(x, zz) + 0.12, zz, i, { r: 0.025, sp: 0.07 });
  }
  for (const [x, zz, r] of stacks) P.redEyes(z, x + r * 0.7, h(x, zz) + 0.4, zz - r * 0.7, -0.8, { r: 0.03 });
  z.finish();
}

function buildRatKing(W) {
  const { K, P, THREE } = W;
  const M = (n, o) => K.mat(n, o);
  const Z = W.zone("ratKing");
  const z = Z.z, h = W.h;
  const C = { x: 0, z: 148 }, FY = -1.5, R0 = 16.3, R1 = 17.4;
  const st = M("stoneBrick", { color: "#8c867a" }), stD = M("stoneBrick", { color: "#77716a" });
  // cobbled floor of the sunken ring
  z.geo(K.circleGeo(R0, 48, 2.5), M("cobble", { color: "#7a746a" }), C.x, FY + 0.02, C.z, { layer: "flat" });
  for (let i = 0; i < 14; i++) {
    const a = i * 2.1, r = 3 + (i % 5) * 2.4;
    z.box(K.flat("#3a362e"), C.x + Math.sin(a) * r, FY + 0.035, C.z + Math.cos(a) * r, 0.05, 0.01, 1.4 + (i % 3), { layer: "flat", ry: a * 1.7 });
  }
  // ring wall of blocks with the entrance gap facing -Z (angle PI)
  const N = 64;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * PI * 2;
    if (Math.abs(((a - PI + PI) % (2 * PI)) - PI) < 0.14) continue;
    const mx = C.x + Math.sin(a) * (R0 + R1) / 2, mz = C.z + Math.cos(a) * (R0 + R1) / 2;
    const top = 1.3 + ((i * 7) % 5) * 0.12 - (i % 9 === 4 ? 0.9 : 0);
    const hh = top - (FY - 1);
    z.box(i % 2 ? st : stD, mx, FY - 1 + hh / 2, mz, 1.75, hh, R1 - R0, { ry: a + PI / 2, tex: 1.2 });
    z.box(M("stoneBrick", { color: "#9a958a" }), mx, top + 0.08, mz, 1.8, 0.16, R1 - R0 + 0.15, { ry: a + PI / 2 });
    if (i % 2 === 0) z.colBox(mx, FY + 1.2, mz, 3.6, 5.4, R1 - R0, { ry: a + PI / 2, walk: false });
    // pillars + torches every 8 blocks
    if (i % 8 === 2) {
      const px = C.x + Math.sin(a) * (R0 - 0.3), pz = C.z + Math.cos(a) * (R0 - 0.3);
      const broken = i % 16 === 2;
      const ph = broken ? 2.6 : 4.6;
      z.cyl(st, px, FY + ph / 2, pz, 0.42, 0.5, ph, { seg: 10, col: true });
      z.cyl(stD, px, FY + 0.15, pz, 0.62, 0.66, 0.3, { seg: 10 });
      if (!broken) z.box(stD, px, FY + ph + 0.15, pz, 1.1, 0.3, 1.1, { ry: a });
      else P.rock(z, px + Math.sin(a + 1) * 1.4, FY, pz + Math.cos(a + 1) * 1.4, 0.55, i, { color: "#8c867a" });
      P.torch(z, px - Math.sin(a) * 0.5, FY + 2.4, pz - Math.cos(a) * 0.5, a + PI, Z.fx.flames);
    }
  }
  // entrance: worn steps down + gateposts + the arena gate (prop "ratKingGate": portcullis bars)
  const gz = C.z - (R0 + R1) / 2;
  for (const sx of [-2.4, 2.4]) {
    z.box(st, sx, FY + 1.6, gz, 1.1, 4.6, 1.6, { col: true, tex: 1.2 });
    z.box(stD, sx, FY + 4.0, gz, 1.3, 0.3, 1.8);
  }
  z.box(stD, 0, FY + 4.3, gz, 6.0, 0.6, 1.2, { tex: 1.2 });
  // gatehouse block above the lintel: the raised portcullis slides up into it (hidden when open)
  z.box(st, 0, FY + 6.5, gz, 5.4, 3.8, 1.25, { tex: 1.2 });
  z.box(stD, 0, FY + 8.55, gz, 6.0, 0.35, 1.5, { tex: 1.2 });
  for (const cx of [-2.4, -0.8, 0.8, 2.4]) z.box(stD, cx, FY + 9.0, gz, 0.7, 0.6, 1.3);
  const gate = new THREE.Group();
  const barM = M("woodDark");
  for (let i = 0; i < 9; i++) { const b = new THREE.Mesh(K.boxGeo(0.14, 3.6, 0.14), barM); b.position.set(-1.6 + i * 0.4, 1.8, 0); b.castShadow = true; gate.add(b); }
  for (const yy of [0.6, 1.8, 3.0]) { const b = new THREE.Mesh(K.boxGeo(3.6, 0.12, 0.1), barM); b.position.set(0, yy, 0.08); gate.add(b); }
  for (let i = 0; i < 9; i++) { const tip = new THREE.Mesh(K.coneGeo(0.09, 0.3, 4), M("iron")); tip.position.set(-1.6 + i * 0.4, -0.12, 0); tip.rotation.x = PI; gate.add(tip); }
  z.object(gate, 0, FY + 4.0, gz, 0);
  gate.userData.openY = FY + 4.0; gate.userData.closedY = FY + 0.1;
  const gateCol = z.colBox(0, FY + 1.8, gz, 3.8, 3.6, 0.5, { walk: false });
  W.colEnabled(gateCol, false);
  let gateT = 0, gateTarget = 0;
  gate.userData.setClosed = (v) => { gateTarget = v ? 1 : 0; W.colEnabled(gateCol, !!v); };
  gate.userData.isClosed = () => gateTarget > 0;
  W.anim("ratKing", (dt) => {
    if (gateT === gateTarget) return;
    gateT += Math.sign(gateTarget - gateT) * dt * (gateTarget ? 2.2 : 0.8);
    gateT = Math.max(0, Math.min(1, gateT));
    gate.position.y = gate.userData.openY + (gate.userData.closedY - gate.userData.openY) * gateT;
  }, 400);
  W.prop("ratKingGate", gate);
  // the Rat King's junk throne + giant cheese wheels + bones + bottle caps
  z.frame(0, FY, 161.5, PI, () => {
    for (let i = 0; i < 6; i++) P.crate(z, -2 + (i % 3) * 1.4, 0.3 + (i % 2) * 0.3, 1.0, { y: (i > 2 ? 1.0 : 0), ry: i * 0.4, col: i <= 2 });
    z.cyl(M("cheese"), 0, 2.4, 0.4, 1.2, 1.2, 0.5, { rx: PI / 2 - 0.3, seg: 20 });
    z.box(M("clothRed", { color: "#6a2a2a" }), 0, 1.2, 1.25, 2.6, 0.05, 1.6, { rx: 0.4 });
  });
  for (let i = 0; i < 4; i++) {
    const a = 0.8 + i * 1.4, r = 11 + (i % 2) * 2;
    z.frame(C.x + Math.sin(a) * r, FY, C.z + Math.cos(a) * r, a, () => {
      z.cyl(M("cheese"), 0, 0.5, 0, 1.0, 1.0, 1.0, { seg: 20, col: true });
      z.box(M("cheese", { color: "#e8b83a" }), 0.62, 0.5, 0, 0.5, 1.0, 1.0, { ry: 0.1 });
    });
  }
  for (let i = 0; i < 5; i++) { const a = i * 1.3 + 0.4, r = 6 + i * 1.6; P.bones(z, C.x + Math.sin(a) * r, FY + 0.02, C.z + Math.cos(a) * r, i + 3); }
  const cap = K.cylGeo(0.16, 0.18, 0.05, 14), capM = M("gold", { color: "#c8a040" });
  for (let i = 0; i < 40; i++) { const a = i * 2.39, r = 2 + (i % 13); z.inst(cap, capM, C.x + Math.sin(a) * r, FY + 0.03, C.z + Math.cos(a) * r, { layer: "small", rz: (i % 3) * 0.3 }); }
  // ---- the old mill ruin (round tower, broken top, stuck water wheel, millstones)
  const mx = 17.2, mz = 157.4, mr = 3.2;
  const mby = Math.min(h(mx, mz), 0) - 1.5;
  const ring2 = 24;
  for (let i = 0; i < ring2; i++) {
    const a = (i / ring2) * PI * 2;
    if (i === 15 || i === 16) continue;      // doorway facing the ring
    const top = 5.4 + Math.sin(i * 1.7) * 1.6 + (i % 5 === 0 ? 1.8 : 0) - (i > 4 && i < 9 ? 2.8 : 0);
    const hh = top - mby;
    z.box(i % 2 ? st : stD, mx + Math.sin(a) * mr, mby + hh / 2, mz + Math.cos(a) * mr, 0.95, hh, 0.7, { ry: a, tex: 1.2 });
  }
  z.colCyl(mx, mby, mz, mr + 0.35, 9);
  z.box(barM, mx, mby + 4.2, mz, 6.4, 0.25, 0.25, { ry: 0.6 });
  z.box(barM, mx + 0.8, mby + 2.0, mz - 1.2, 0.2, 0.2, 5.0, { rx: 0.9, ry: 0.2 });
  z.frame(mx + mr + 0.6, mby + 0.5, mz + 0.6, PI / 2, () => {
    z.geo(K.torusGeo(2.6, 0.12, 6, 28), barM, 0, 2.6, 0, { rz: 0.12 });
    z.geo(K.torusGeo(2.6, 0.12, 6, 28), barM, 0, 2.6, 0.9, { rz: 0.12 });
    for (let s = 0; s < 12; s++) {
      if (s === 7) continue;
      const a = (s / 12) * PI * 2;
      z.box(M("woodPlank", { color: "#6a5034" }), Math.sin(a) * 2.3, 2.6 + Math.cos(a) * 2.3, 0.45, 0.08, 0.9, 1.1, { rz: -a });
      z.box(barM, Math.sin(a) * 1.2, 2.6 + Math.cos(a) * 1.2, 0.45, 0.08, 2.4, 0.08, { rz: -a });
    }
    z.cyl(barM, 0, 2.6, 0.45, 0.2, 0.2, 1.6, { rx: PI / 2 });
  });
  z.colBox(mx + mr + 0.6, mby + 3, mz + 1.05, 1.4, 6, 5.4, { walk: false });
  for (let i = 0; i < 2; i++) z.cyl(M("rock", { color: "#9a958a" }), mx - 4.5 + i * 1.7, h(mx - 4.5, mz + 3) + 0.2 + i * 0.1, mz + 3.4 + i * 0.6, 0.85, 0.85, 0.3, { seg: 16, rx: i * 0.25, col: true });
  W.point("mill", mx, mby + 1.5, mz);
  z.excludeRect(-19, 129, 22, 167);
  z.exclude(mx, mz, 6);
  z.finish();
}

function buildGate2(W) {
  const { K, P, THREE } = W;
  const M = (n, o) => K.mat(n, o);
  const Z = W.zone("gate2");
  const z = Z.z, h = W.h;
  const GZ = 178;
  // full-width palisade (x -220..220) with the gate opening x -3..3
  const log = K.cylGeo(0.19, 0.21, 3.4, 7, 2), tip = K.coneGeo(0.2, 0.5, 7), logM = M("bark", { color: "#5e4a36" });
  let k = 0;
  for (let x = -219.8; x <= 219.8; x += 0.4) {
    if (Math.abs(x) < 6.2) continue;
    const y = h(x, GZ);
    const jitter = ((k * 37) % 7 - 3) * 0.05;
    z.inst(log, logM, x, y + 1.5 + jitter, GZ + ((k % 3) - 1) * 0.04, { ry: k });
    z.inst(tip, logM, x, y + 3.45 + jitter, GZ + ((k % 3) - 1) * 0.04, { ry: k });
    k++;
  }
  // a back rail + colliders per 8 m segment following the terrain
  for (let x0 = -220; x0 < 220; x0 += 8) {
    const x1 = Math.min(220, x0 + 8);
    const a = Math.max(x0, x0 < 0 ? -220 : 6.2), b = Math.min(x1, x0 < 0 ? -6.2 : 220);
    if (b - a <= 0.1) continue;
    const cx = (a + b) / 2, y = Math.min(h(a, GZ), h(b, GZ), h(cx, GZ));
    z.colBox(cx, y + 1.2, GZ, b - a, 6.5, 0.6, { walk: false, surface: "wood" });
    z.inst(K.boxGeo(b - a, 0.18, 0.12), M("woodDark"), cx, h(cx, GZ) + 2.3, GZ + 0.25);
  }
  // gatehouse: two log towers with platforms and roofs
  for (const sx of [-1, 1]) {
    z.frame(sx * 4.7, h(sx * 4.7, GZ), GZ, 0, () => {
      for (const px of [-1.1, 1.1]) for (const pz of [-1.1, 1.1]) z.cyl(logM, px, 3.1, pz, 0.2, 0.22, 6.2, { seg: 8 });
      for (let i = 0; i < 7; i++) z.box(M("bark", { color: "#5a4632" }), 0, 0.3 + i * 0.4, -1.2, 2.4, 0.38, 0.3, { ry: 0 });
      z.colBox(0, 3, 0, 2.6, 6, 2.6, { walk: false, surface: "wood" });
      z.box(M("woodPlank", { color: "#7a5a3a" }), 0, 4.4, 0, 3.0, 0.15, 3.0);
      for (const [px, pz, w2, d2] of [[0, 1.45, 3.0, 0.1], [0, -1.45, 3.0, 0.1], [1.45, 0, 0.1, 3.0], [-1.45, 0, 0.1, 3.0]]) z.box(M("woodPlank", { color: "#6a4e30" }), px, 4.95, pz, w2, 0.9, d2);
      z.geo(K.coneGeo(2.4, 1.6, 4), M("thatch"), 0, 6.9, 0, { ry: PI / 4 });
      P.torch(z, -sx * 1.25, 2.6, 1.3, 0, Z.fx.flames);
    });
  }
  // lintel beam + village name board
  z.box(M("woodDark"), 0, h(0, GZ) + 4.6, GZ, 9.8, 0.4, 0.45);
  const tex = K.signTex(["BRINDLEWICK"], { w: 512, h: 128 });
  z.geo(K.planeGeo(3.6, 0.9), K.texMat("brindlewick", tex), 0, h(0, GZ) + 5.3, GZ - 0.3, { ry: PI });
  z.box(M("woodPlank", { color: "#5a4028" }), 0, h(0, GZ) + 5.3, GZ - 0.22, 3.8, 1.05, 0.1);
  // the two gate leaves (hinged at x=+-3, swing toward +Z when opened)
  const leaves = [];
  for (const sx of [-1, 1]) {
    const hinge = new THREE.Group();
    const leafG = new THREE.Group();
    for (let i = 0; i < 8; i++) {
      const b = new THREE.Mesh(K.cylGeo(0.17, 0.18, 3.6, 7, 2), logM);
      b.position.set(-sx * (0.2 + i * 0.37), 1.8, 0); b.castShadow = true; leafG.add(b);
      const tp = new THREE.Mesh(K.coneGeo(0.18, 0.4, 7), logM); tp.position.set(-sx * (0.2 + i * 0.37), 3.8, 0); leafG.add(tp);
    }
    for (const yy of [0.8, 2.6]) { const r = new THREE.Mesh(K.boxGeo(3.0, 0.2, 0.12), M("woodDark")); r.position.set(-sx * 1.5, yy, 0.22); leafG.add(r); }
    const brace = new THREE.Mesh(K.boxGeo(0.14, 2.6, 0.1), M("woodDark")); brace.position.set(-sx * 1.5, 1.7, 0.26); brace.rotation.z = sx * 0.6; leafG.add(brace);
    hinge.add(leafG);
    z.object(hinge, sx * 3.0, h(0, GZ), GZ, 0);
    hinge.userData.side = sx;
    leaves.push(hinge);
  }
  const col = z.colBox(0, h(0, GZ) + 1.8, GZ, 6.0, 3.6, 0.5, { walk: false, surface: "wood" });
  W.gateVisual("area2", { leaves, col, kind: "swing", pos: { x: 0, y: h(0, GZ), z: GZ } });
  P.signpost(z, -2.6, GZ - 4.0, -0.2, ["AREA 2", "villagers only"], { w: 1.3, y: h(-2.6, GZ - 4) });
  z.excludeRect(-220, GZ - 1.2, 220, GZ + 1.2);
  z.excludeRect(-8, GZ - 3, 8, GZ + 3);
  z.finish();
}
