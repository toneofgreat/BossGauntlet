// particles.js - the title screen's drifting dust (DESIGN 1): a cheap 2D canvas field, its own rAF loop that only
// runs while the canvas is visible. ~350 motes (120 on low quality), soft pre-rendered sprites, gentle turbulence,
// a few large out-of-focus bokeh motes, pushed away from the pointer (radius 120 px).
//   createParticles(canvas, { count, color:"#fff"|"#ff3030"|..., dark:false }) -> field
//   field.start() field.stop() field.setColor(css) field.setCount(n) field.leave() (accelerate up + thin out)
//   field.setPointer(x, y) field.clearPointer()

function makeSprite(color, size, hard) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  const r = size / 2;
  const grd = g.createRadialGradient(r, r, 0, r, r, r);
  grd.addColorStop(0, color);
  grd.addColorStop(hard ? 0.35 : 0.15, color);
  let clear = "rgba(0,0,0,0)";
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (m) { const v = parseInt(m[1], 16); clear = "rgba(" + (v >> 16) + "," + ((v >> 8) & 255) + "," + (v & 255) + ",0)"; }
  grd.addColorStop(1, clear);
  g.globalAlpha = 1;
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  return c;
}

export function createParticles(canvas, opts) {
  opts = opts || {};
  const g = canvas.getContext("2d", { alpha: true });
  const MAX = 420;
  // struct-of-arrays, allocated once
  const px = new Float32Array(MAX), py = new Float32Array(MAX), vx = new Float32Array(MAX), vy = new Float32Array(MAX);
  const sz = new Float32Array(MAX), al = new Float32Array(MAX), ph = new Float32Array(MAX), big = new Uint8Array(MAX);
  let count = Math.min(MAX, opts.count || 350);
  let W = 1, H = 1, dpr = 1;
  let running = false, raf = 0, last = 0, t = 0;
  let leaving = 0;          // 0..1 progress of the "leave" acceleration
  let pointerX = -1e4, pointerY = -1e4;
  let sprite = null, bokeh = null, color = opts.color || "#ffffff";
  let dark = !!opts.dark;

  function setColor(c) {
    color = c;
    sprite = makeSprite(c, 32, true);
    bokeh = makeSprite(c, 64, false);
  }
  setColor(color);

  function seed(i, anywhere) {
    px[i] = Math.random() * W;
    py[i] = anywhere ? Math.random() * H : H + 10 + Math.random() * 40;
    const b = Math.random() < 0.04;
    big[i] = b ? 1 : 0;
    sz[i] = b ? 10 + Math.random() * 18 : 1 + Math.random() * 2;
    al[i] = b ? 0.05 + Math.random() * 0.08 : 0.15 + Math.random() * 0.65;
    vx[i] = (Math.random() - 0.5) * 8;
    vy[i] = -(4 + Math.random() * 12) * (b ? 0.5 : 1);
    ph[i] = Math.random() * 1000;
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.max(1, canvas.clientWidth || window.innerWidth), h = Math.max(1, canvas.clientHeight || window.innerHeight);
    if (w === W && h === H && canvas.width === Math.round(w * dpr)) return;
    const first = W === 1;
    W = w; H = h;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    if (first) for (let i = 0; i < MAX; i++) seed(i, true);
  }

  function step(dt) {
    t += dt;
    const lv = leaving;
    const up = 1 + lv * 9, thin = lv;
    const pr2 = 120 * 120;
    for (let i = 0; i < count; i++) {
      // turbulence: two cheap sines per mote
      const p = ph[i];
      const ax = Math.sin(t * 0.37 + p) * 6 + Math.sin(t * 0.11 + p * 1.7 + py[i] * 0.004) * 5;
      const ay = Math.cos(t * 0.29 + p * 0.6) * 3;
      vx[i] += (ax - vx[i]) * 0.6 * dt;
      let dx = px[i] - pointerX, dy = py[i] - pointerY;
      const d2 = dx * dx + dy * dy;
      if (d2 < pr2 && d2 > 0.01) {
        const d = Math.sqrt(d2), f = (1 - d / 120) * 70;
        px[i] += (dx / d) * f * dt; py[i] += (dy / d) * f * dt;
      }
      px[i] += vx[i] * dt;
      py[i] += (vy[i] * up + ay) * dt;
      if (py[i] < -30 || px[i] < -40 || px[i] > W + 40) {
        if (thin > 0 && Math.random() < thin) { py[i] = -1e5; continue; }
        seed(i, false);
      }
    }
  }

  function draw() {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const fadeAll = 1 - leaving * 0.6;
    for (let i = 0; i < count; i++) {
      if (py[i] < -1000) continue;
      const s = sz[i];
      const tw = big[i] ? 1 : 0.75 + 0.25 * Math.sin(t * 1.3 + ph[i]);
      g.globalAlpha = al[i] * tw * fadeAll;
      g.drawImage(big[i] ? bokeh : sprite, px[i] - s * 1.6, py[i] - s * 1.6, s * 3.2, s * 3.2);
    }
    g.globalAlpha = 1;
  }

  function loop(now) {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
    last = now;
    if (leaving > 0 && leaving < 1) leaving = Math.min(1, leaving + dt / 2.5);
    resize();
    step(dt);
    draw();
  }

  return {
    start() {
      if (running) return;
      running = true; last = 0; leaving = 0;
      resize();
      for (let i = 0; i < MAX; i++) if (py[i] < -1000) seed(i, true);
      raf = requestAnimationFrame(loop);
    },
    stop() { running = false; cancelAnimationFrame(raf); },
    get running() { return running; },
    setColor,
    setCount(n) { count = Math.max(10, Math.min(MAX, n | 0)); },
    setDark(v) { dark = !!v; },
    leave() { leaving = 0.001; },
    setPointer(x, y) { pointerX = x; pointerY = y; },
    clearPointer() { pointerX = -1e4; pointerY = -1e4; },
    resize
  };
}
