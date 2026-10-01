/* ===========================================================================
   core.js - renderer, input, sound, HUD and the save file. Everything that is
   not a chapter and not a piece of scenery lives here.
   ========================================================================= */
import * as THREE from '../vendor/three.module.js';
import { FX } from './fx.js';
export { FX };

export const $ = (id) => document.getElementById(id);
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, l, dt) => lerp(a, b, 1 - Math.exp(-l * dt));
export const rnd = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
export const rndInt = (a, b) => Math.floor(rnd(a, b + 1));
export function angWrap(a) { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; }
export function angTowards(a, b, max) { const d = angWrap(b - a); return a + clamp(d, -max, max); }

/* ============================================================= RENDERER == */
export const R = {
  renderer: null, scene: null, camera: null, clock: null,
  width: 0, height: 0, dpr: 1, frame: 0, elapsed: 0,
  shake: 0, shakeT: 0,
  init() {
    const cv = $('gl');
    // a phone does not have the fill rate for shadow maps at two device pixels
    const small = window.matchMedia('(hover:none), (pointer:coarse)').matches || 'ontouchstart' in window;
    this.renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: !small, powerPreference: 'high-performance' });
    this.dpr = Math.min(small ? 1.25 : 2, window.devicePixelRatio || 1);
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.shadowMap.enabled = !small;
    this.small = small;
    this.renderer.shadowMap.type = small ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // the post chain does its own tone mapping, so the renderer must not also
    // do it: three only applies tone mapping when it draws to the canvas, and
    // with post on, the canvas is a fullscreen quad
    FX.init(this.renderer, small);
    if (FX.on) this.renderer.toneMapping = THREE.NoToneMapping;
    this.camera = new THREE.PerspectiveCamera(56, 1, 0.08, 900);
    this.clock = new THREE.Clock();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 150));
  },
  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.width = w; this.height = h;
    this.renderer.setSize(w, h, false);
    FX.setSize(w, h, this.dpr);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  },
  setScene(s) { this.scene = s; },
  kick(amount, time) { this.shake = Math.max(this.shake, amount); this.shakeT = Math.max(this.shakeT, time || 0.3); },
  applyShake(dt) {
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const k = this.shake * Math.min(1, this.shakeT * 3);
      this.camera.position.x += rnd(-k, k);
      this.camera.position.y += rnd(-k, k);
      this.camera.position.z += rnd(-k, k);
      if (this.shakeT <= 0) this.shake = 0;
    }
  },
  render(dt) { if (this.scene) FX.render(this.renderer, this.scene, this.camera, dt || 0.016); },
  /* a hand holding the camera: never quite still, and worse when frightened */
  breathe(dt, stress) {
    this.bt = (this.bt || 0) + dt;
    const s = 0.004 + (stress || 0) * 0.02;
    const c = this.camera;
    c.position.y += Math.sin(this.bt * 1.6) * s;
    c.position.x += Math.sin(this.bt * 0.87 + 1.3) * s * 0.9;
    c.position.z += Math.sin(this.bt * 0.71 + 2.2) * s * 0.7;
    c.rotation.z += Math.sin(this.bt * 0.53) * 0.0035 + (stress || 0) * Math.sin(this.bt * 6.1) * 0.005;
  },
  dispose(obj) {
    obj.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        ms.forEach((m) => { if (m && m.__owned) m.dispose(); });
      }
    });
  }
};

/* ================================================================ INPUT == */
export const IN = {
  keys: {}, down: {},                  // down = pressed this frame
  mx: 0, my: 0, dx: 0, dy: 0,          // look delta
  pointerDown: false, castQueued: false, jumpQueued: false,
  stick: { active: false, id: -1, cx: 0, cy: 0, x: 0, y: 0 },
  look: { active: false, id: -1, lx: 0, ly: 0 },
  touch: false, sens: 0.0027,
  init() {
    this.touch = window.matchMedia('(hover:none), (pointer:coarse)').matches || 'ontouchstart' in window;
    if (this.touch) document.body.classList.add('touch');

    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (!this.keys[k]) this.down[k] = true;
      this.keys[k] = true;
      if (k === ' ' || k.startsWith('arrow')) e.preventDefault();
      if (k === ' ') this.jumpQueued = true;
    });
    window.addEventListener('keyup', (e) => { this.keys[e.key.toLowerCase()] = false; });
    window.addEventListener('blur', () => { this.keys = {}; this.stick.active = false; this.stick.x = this.stick.y = 0; });

    const cv = $('gl');
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('mousedown', (e) => {
      this.pointerDown = true;
      if (e.button === 0) this.castQueued = true;
      this.look.active = true; this.look.lx = e.clientX; this.look.ly = e.clientY;
      e.preventDefault();
    });
    window.addEventListener('mouseup', () => { this.pointerDown = false; this.look.active = false; });
    window.addEventListener('mousemove', (e) => {
      this.mx = e.clientX; this.my = e.clientY;
      if (this.look.active) {
        this.dx += (e.clientX - this.look.lx) * this.sens;
        this.dy += (e.clientY - this.look.ly) * this.sens;
        this.look.lx = e.clientX; this.look.ly = e.clientY;
      }
    });

    /* ---- touch: left half drives, right half looks ---- */
    const stickEl = $('stick'), nub = $('nub');
    const place = (x, y) => { stickEl.style.left = (x - 66) + 'px'; stickEl.style.top = (y - 66) + 'px'; stickEl.style.bottom = 'auto'; };
    const rest = () => { stickEl.style.left = '16px'; stickEl.style.top = 'auto'; stickEl.style.bottom = '16px'; nub.style.transform = 'translate(0,0)'; };
    const inMenu = (e) => {
      const t = e.target;
      return !!(t && t.closest && t.closest('.screen'));
    };
    const onStart = (e) => {
      if (inMenu(e)) return;
      for (const t of e.changedTouches) {
        if (t.clientX < window.innerWidth * 0.5) {
          if (this.stick.active) continue;
          this.stick.active = true; this.stick.id = t.identifier;
          this.stick.cx = t.clientX; this.stick.cy = t.clientY; this.stick.x = this.stick.y = 0;
          place(t.clientX, t.clientY);
        } else if (!this.look.active) {
          this.look.active = true; this.look.id = t.identifier;
          this.look.lx = t.clientX; this.look.ly = t.clientY;
        }
      }
      e.preventDefault();
    };
    const onMove = (e) => {
      if (inMenu(e)) return;
      for (const t of e.changedTouches) {
        if (this.stick.active && t.identifier === this.stick.id) {
          let dx = t.clientX - this.stick.cx, dy = t.clientY - this.stick.cy;
          const m = Math.hypot(dx, dy), max = 52;
          if (m > max) { dx = dx / m * max; dy = dy / m * max; }
          this.stick.x = dx / max; this.stick.y = dy / max;
          nub.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
        } else if (this.look.active && t.identifier === this.look.id) {
          this.dx += (t.clientX - this.look.lx) * this.sens * 1.5;
          this.dy += (t.clientY - this.look.ly) * this.sens * 1.5;
          this.look.lx = t.clientX; this.look.ly = t.clientY;
        }
      }
      e.preventDefault();
    };
    const onEnd = (e) => {
      for (const t of e.changedTouches) {
        if (this.stick.active && t.identifier === this.stick.id) { this.stick.active = false; this.stick.x = this.stick.y = 0; rest(); }
        if (this.look.active && t.identifier === this.look.id) this.look.active = false;
      }
    };
    // on the whole window: the canvas and the HUD are siblings, so neither one
    // of them alone sees every touch
    window.addEventListener('touchstart', onStart, { passive: false });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);

    const tap = (el, fn) => {
      el.addEventListener('touchstart', (e) => { fn(); e.preventDefault(); e.stopPropagation(); }, { passive: false });
      el.addEventListener('mousedown', (e) => { fn(); e.preventDefault(); e.stopPropagation(); });
    };
    tap($('castBtn'), () => { this.castQueued = true; });
    tap($('jumpBtn'), () => { this.jumpQueued = true; });
  },
  /* movement on the ground plane, -1..1, already normalised */
  move() {
    if (this.stick.active) {
      const m = Math.hypot(this.stick.x, this.stick.y);
      if (m < 0.14) return { x: 0, y: 0 };
      return { x: this.stick.x, y: this.stick.y };
    }
    let x = (this.keys.d || this.keys.arrowright ? 1 : 0) - (this.keys.a || this.keys.arrowleft ? 1 : 0);
    let y = (this.keys.s || this.keys.arrowdown ? 1 : 0) - (this.keys.w || this.keys.arrowup ? 1 : 0);
    const m = Math.hypot(x, y);
    return m > 1 ? { x: x / m, y: y / m } : { x, y };
  },
  running() { return !!(this.keys.shift); },
  takeLook() { const d = { x: this.dx, y: this.dy }; this.dx = this.dy = 0; return d; },
  takeCast() { const c = this.castQueued; this.castQueued = false; return c; },
  takeJump() { const j = this.jumpQueued; this.jumpQueued = false; return j; },
  endFrame() { this.down = {}; }
};

/* ================================================================ SOUND == */
export const AU = {
  ctx: null, master: null, musicGain: null, ambGain: null, on: true, nodes: [],
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { this.ctx = new AC(); } catch (e) { return; }
    this.master = this.ctx.createGain(); this.master.gain.value = 0.8;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain(); this.musicGain.gain.value = 0.0; this.musicGain.connect(this.master);
    this.ambGain = this.ctx.createGain(); this.ambGain.gain.value = 0.0; this.ambGain.connect(this.master);
  },
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  tone(o) {
    if (!this.ctx || !this.on) return;
    const c = this.ctx, t0 = c.currentTime + (o.at || 0), dur = o.dur || 0.25;
    const osc = c.createOscillator(), g = c.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f || 440, t0);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(18, o.f2), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(o.g === undefined ? 0.2 : o.g, t0 + (o.atk || 0.012));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(o.bus || this.master);
    osc.start(t0); osc.stop(t0 + dur + 0.05);
  },
  noise(o) {
    if (!this.ctx || !this.on) return;
    const c = this.ctx, t0 = c.currentTime + (o.at || 0), dur = o.dur || 0.25;
    const n = Math.max(1, (c.sampleRate * dur) | 0), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, o.curve || 1);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = o.filter || 'bandpass';
    f.frequency.value = o.f || 800; f.Q.value = o.q || 1;
    const g = c.createGain(); g.gain.setValueAtTime(o.g === undefined ? 0.25 : o.g, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(o.bus || this.master);
    src.start(t0); src.stop(t0 + dur + 0.03);
  },
  /* noise with a filter that moves: whispering, breathing, dragging */
  hiss(o) {
    if (!this.ctx || !this.on) return;
    const c = this.ctx, t0 = c.currentTime + (o.at || 0), dur = o.dur || 1.2;
    const n = Math.max(1, (c.sampleRate * dur) | 0), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.sin((i / n) * Math.PI);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'bandpass';
    f.Q.value = o.q || 6;
    f.frequency.setValueAtTime(o.f || 600, t0);
    f.frequency.linearRampToValueAtTime(o.f2 || 1500, t0 + dur);
    const g = c.createGain();
    const lvl = o.g === undefined ? 0.07 : o.g;
    g.gain.setValueAtTime(lvl, t0);
    g.gain.setValueAtTime(lvl, t0 + dur * 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(o.bus || this.master);
    src.start(t0); src.stop(t0 + dur + 0.05);
  },
  sfx(name) {
    if (!this.ctx || !this.on) return;
    switch (name) {
      case 'whisper': this.hiss({ f: 380, f2: 1700, dur: 1.5, g: 0.05, q: 9 });
        this.hiss({ f: 900, f2: 300, dur: 1.3, g: 0.035, q: 12, at: 0.35 }); break;
      case 'breath': this.hiss({ f: 260, f2: 900, dur: 0.9, g: 0.06, q: 3 }); break;
      case 'creak': this.tone({ f: 118, f2: 96, dur: 1.1, type: 'sawtooth', g: 0.05, atk: 0.35 });
        this.noise({ f: 1500, dur: 0.9, g: 0.04, filter: 'bandpass', q: 14, curve: 0.3 }); break;
      case 'drip': this.tone({ f: 1500, f2: 420, dur: 0.16, type: 'sine', g: 0.14 });
        this.tone({ f: 620, f2: 240, dur: 0.3, type: 'sine', g: 0.06, at: 0.02 }); break;
      case 'heart': this.tone({ f: 58, f2: 34, dur: 0.22, type: 'sine', g: 0.34, atk: 0.006 });
        this.tone({ f: 48, f2: 28, dur: 0.3, type: 'sine', g: 0.2, at: 0.21, atk: 0.006 }); break;
      case 'scream': this.hiss({ f: 700, f2: 2600, dur: 1.9, g: 0.05, q: 11 });
        this.tone({ f: 420, f2: 880, dur: 1.7, type: 'sawtooth', g: 0.05, atk: 0.5 }); break;
      case 'bone': this.noise({ f: 2200, dur: 0.22, g: 0.13, filter: 'bandpass', q: 4, curve: 2.2 });
        this.noise({ f: 700, dur: 0.3, g: 0.08, filter: 'lowpass' }); break;
      case 'rumble': this.noise({ f: 62, dur: 3.2, g: 0.3, filter: 'lowpass', curve: 0.25 }); break;
      case 'growl': this.tone({ f: 82, f2: 62, dur: 1.5, type: 'sawtooth', g: 0.16, atk: 0.2 });
        this.hiss({ f: 200, f2: 520, dur: 1.4, g: 0.05, q: 4 }); break;
      case 'cast': this.tone({ f: 620, f2: 1500, dur: 0.3, type: 'triangle', g: 0.16 });
        this.noise({ f: 2600, dur: 0.22, g: 0.1, filter: 'highpass' }); break;
      case 'zap': this.tone({ f: 900, f2: 180, dur: 0.26, type: 'sawtooth', g: 0.17 });
        this.noise({ f: 1400, dur: 0.2, g: 0.13 }); break;
      case 'lift': this.tone({ f: 300, f2: 900, dur: 0.6, type: 'sine', g: 0.14 }); break;
      case 'light': this.tone({ f: 1200, dur: 0.5, type: 'sine', g: 0.12 });
        this.tone({ f: 1800, dur: 0.4, type: 'sine', g: 0.07, at: 0.06 }); break;
      case 'shield': this.tone({ f: 220, f2: 440, dur: 0.4, type: 'square', g: 0.1 });
        this.noise({ f: 500, dur: 0.35, g: 0.09, filter: 'lowpass' }); break;
      case 'hit': this.noise({ f: 300, dur: 0.3, g: 0.3, filter: 'lowpass' });
        this.tone({ f: 130, f2: 50, dur: 0.3, type: 'sawtooth', g: 0.2 }); break;
      case 'hurt': this.tone({ f: 200, f2: 90, dur: 0.45, type: 'sawtooth', g: 0.22 });
        this.noise({ f: 700, dur: 0.3, g: 0.2 }); break;
      case 'good': [660, 880, 1320].forEach((f, i) => this.tone({ f, dur: 0.35, type: 'triangle', g: 0.15, at: i * 0.07 })); break;
      case 'bad': [330, 262, 196].forEach((f, i) => this.tone({ f, dur: 0.4, type: 'sine', g: 0.16, at: i * 0.1 })); break;
      case 'win': [523, 659, 784, 1046, 1319, 1568].forEach((f, i) => this.tone({ f, dur: 0.7, type: 'triangle', g: 0.17, at: i * 0.11 })); break;
      case 'lose': [392, 330, 262, 175].forEach((f, i) => this.tone({ f, dur: 0.7, type: 'sine', g: 0.18, at: i * 0.15 })); break;
      case 'page': this.noise({ f: 2400, dur: 0.14, g: 0.12, filter: 'highpass' }); break;
      case 'ui': this.tone({ f: 740, dur: 0.09, type: 'sine', g: 0.09 }); break;
      case 'catch': this.tone({ f: 1400, dur: 0.14, type: 'sine', g: 0.16 });
        this.tone({ f: 2100, dur: 0.24, type: 'sine', g: 0.12, at: 0.07 }); break;
      case 'whoosh': this.noise({ f: 500, dur: 0.5, g: 0.16, filter: 'bandpass', q: 0.6, curve: 0.4 }); break;
      case 'thunder': this.noise({ f: 90, dur: 2.2, g: 0.45, filter: 'lowpass', curve: 0.35 });
        this.noise({ f: 900, dur: 0.5, g: 0.22, filter: 'highpass' }); break;
      case 'snake': this.noise({ f: 5200, dur: 1.1, g: 0.16, filter: 'highpass', curve: 0.5 });
        this.tone({ f: 70, f2: 44, dur: 1.2, type: 'sawtooth', g: 0.14 }); break;
      case 'wolf': this.tone({ f: 340, f2: 520, dur: 1.1, type: 'sawtooth', g: 0.12 });
        this.tone({ f: 170, f2: 260, dur: 1.3, type: 'triangle', g: 0.1, at: 0.05 }); break;
      case 'ghost': this.tone({ f: 60, f2: 40, dur: 2.4, type: 'sawtooth', g: 0.22 });
        this.noise({ f: 200, dur: 2.0, g: 0.14, filter: 'lowpass' }); break;
      case 'pop': this.tone({ f: 500, f2: 1400, dur: 0.16, type: 'sine', g: 0.2 }); break;
      case 'unlock': [523, 784, 1046].forEach((f, i) => this.tone({ f, dur: 0.6, type: 'sine', g: 0.14, at: i * 0.1 })); break;
    }
  },
  /* a slow chord bed that you can swap per chapter */
  music: null,
  setMusic(kind, vol) {
    if (!this.ctx) return;
    this.stopMusic();
    if (!kind) return;
    const c = this.ctx, out = this.musicGain;
    out.gain.cancelScheduledValues(c.currentTime);
    out.gain.setTargetAtTime(vol === undefined ? 0.16 : vol, c.currentTime, 1.2);
    // minor, and where it is not minor it is one semitone off being it
    const CHORDS = {
      school: [[220, 262, 330], [196, 233, 294], [175, 208, 262], [185, 220, 277]],
      dark: [[98, 116, 139], [92, 110, 131], [87, 104, 123], [98, 117, 138]],
      flight: [[247, 294, 370], [220, 262, 330], [262, 311, 392], [233, 277, 349]],
      sad: [[131, 156, 196], [117, 139, 175], [110, 131, 165], [116, 138, 174]],
      win: [[262, 311, 392], [294, 349, 440], [311, 370, 466], [349, 415, 523]],
      dread: [[73, 87, 104], [69, 82, 98], [65, 78, 92], [69, 73, 98]]
    };
    const prog = CHORDS[kind] || CHORDS.school;
    const dark = kind === 'dark' || kind === 'sad' || kind === 'dread';
    let i = 0;
    const step = () => {
      const ch = prog[i % prog.length]; i++;
      ch.forEach((f, k) => {
        this.tone({ f: f / 2, dur: 4.6, type: k === 0 ? 'triangle' : 'sine', g: 0.048 - k * 0.008, atk: 1.4, bus: out });
      });
      // a fifth above, a hair out of tune: the sound of something not right
      if (dark) this.tone({ f: ch[0] * 1.497, dur: 4.2, type: 'sine', g: 0.016, atk: 1.8, bus: out });
    };
    step();
    this.music = setInterval(step, 4200);
    this.startDrone(dark ? 41 : 55, dark ? 0.1 : 0.05);
    if (dark) this.startSpooks();
  },
  /* a sub-bass bed that never resolves: the floor under the music */
  startDrone(f, g) {
    this.stopDrone();
    if (!this.ctx) return;
    const c = this.ctx, bus = c.createGain();
    bus.gain.value = 0; bus.connect(this.master);
    bus.gain.setTargetAtTime(g === undefined ? 0.08 : g, c.currentTime, 2.5);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 190; lp.Q.value = 0.6;
    lp.connect(bus);
    const oscs = [];
    [0, 0.31, -0.22].forEach((det, i) => {
      const o = c.createOscillator();
      o.type = i === 0 ? 'sawtooth' : 'triangle';
      o.frequency.value = f + det;
      const g2 = c.createGain(); g2.gain.value = i === 0 ? 0.5 : 0.28;
      o.connect(g2); g2.connect(lp);
      o.start();
      oscs.push(o);
    });
    // a very slow swell through the filter, so it breathes
    const lfo = c.createOscillator(); lfo.frequency.value = 0.06;
    const lg = c.createGain(); lg.gain.value = 26;
    lfo.connect(lg); lg.connect(lp.frequency); lfo.start();
    oscs.push(lfo);
    this.drone = { oscs, bus };
  },
  stopDrone() {
    if (!this.drone) return;
    const d = this.drone; this.drone = null;
    try {
      d.bus.gain.setTargetAtTime(0, this.ctx.currentTime, 0.6);
      setTimeout(() => d.oscs.forEach((o) => { try { o.stop(); } catch (e) {} }), 1600);
    } catch (e) {}
  },
  /* every so often, something in the room that is not you */
  startSpooks() {
    this.stopSpooks();
    const fire = () => {
      const r = Math.random();
      this.sfx(r < 0.42 ? 'whisper' : r < 0.66 ? 'creak' : r < 0.86 ? 'drip' : 'breath');
      this.spookT = setTimeout(fire, 9000 + Math.random() * 22000);
    };
    this.spookT = setTimeout(fire, 5000 + Math.random() * 9000);
  },
  stopSpooks() { if (this.spookT) { clearTimeout(this.spookT); this.spookT = null; } },
  /* the heart, while there is not much of you left */
  heartbeat(on, rate) {
    if (!this.ctx) return;
    if (!on) { if (this.heartT) { clearInterval(this.heartT); this.heartT = null; this.heartMs = 0; } return; }
    const ms = Math.round(60000 / (rate || 92));
    if (this.heartT && this.heartMs === ms) return;
    if (this.heartT) clearInterval(this.heartT);
    this.heartMs = ms;
    this.sfx('heart');
    this.heartT = setInterval(() => this.sfx('heart'), ms);
  },
  stopMusic() {
    if (this.music) { clearInterval(this.music); this.music = null; }
    this.stopDrone();
    this.stopSpooks();
    this.heartbeat(false);
    if (this.musicGain) this.musicGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.5);
  },
  amb: null,
  setAmbience(kind) {
    if (!this.ctx) return;
    this.stopAmbience();
    if (!kind) return;
    const c = this.ctx;
    const src = c.createBufferSource();
    const len = c.sampleRate * 3;
    const buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    src.buffer = buf; src.loop = true;
    const f = c.createBiquadFilter();
    const g = c.createGain();
    const spec = {
      hall: { type: 'lowpass', freq: 260, gain: 0.07 },
      wind: { type: 'bandpass', freq: 520, gain: 0.13 },
      storm: { type: 'lowpass', freq: 800, gain: 0.26 },
      cave: { type: 'lowpass', freq: 165, gain: 0.13 },
      crowd: { type: 'bandpass', freq: 900, gain: 0.13 },
      forest: { type: 'highpass', freq: 1500, gain: 0.07 }
    }[kind] || { type: 'lowpass', freq: 400, gain: 0.06 };
    f.type = spec.type; f.frequency.value = spec.freq; f.Q.value = 0.7;
    g.gain.value = 0;
    g.gain.setTargetAtTime(spec.gain, c.currentTime, 1.0);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start();
    this.amb = { src, g };
  },
  stopAmbience() {
    if (!this.amb) return;
    const a = this.amb; this.amb = null;
    try {
      a.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4);
      setTimeout(() => { try { a.src.stop(); } catch (e) {} }, 1200);
    } catch (e) {}
  }
};

/* =================================================================== HUD = */
export const UI = {
  toastT: 0,
  chapter(tag, goal) { $('chapTag').textContent = tag || ' '; $('goal').textContent = goal || ' '; },
  goal(text) { $('goal').textContent = text || ' '; },
  tally(html) { $('tally').innerHTML = html || '&nbsp;'; },
  hearts(n, max) {
    let h = '';
    for (let i = 0; i < (max || 0); i++) h += '<div class="heart' + (i < n ? '' : ' off') + '"></div>';
    const el = $('hearts');
    el.innerHTML = h;
    // two left and the hearts start beating, in the corner of your eye
    el.classList.toggle('low', max > 0 && n > 0 && n <= 2);
  },
  toast(text, secs) {
    const el = $('toast');
    el.textContent = text;
    el.style.opacity = '1';
    this.toastT = secs || 1.6;
  },
  tickToast(dt) {
    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT <= 0) $('toast').style.opacity = '0';
    }
  },
  flash(ms) {
    const f = $('flash');
    f.style.transition = 'none'; f.style.opacity = '0.85';
    requestAnimationFrame(() => { f.style.transition = 'opacity ' + ((ms || 400) / 1000) + 's'; f.style.opacity = '0'; });
  },
  hurt() {
    const h = $('hurt');
    h.style.transition = 'none'; h.style.opacity = '1';
    requestAnimationFrame(() => { h.style.transition = 'opacity .5s'; h.style.opacity = '0'; });
    FX.bleed(0.95);
    R.kick(0.09, 0.22);
    AU.sfx('heart');
  },
  castBar(frac) {
    const b = $('castbar');
    if (frac === null || frac === undefined) { b.style.display = 'none'; return; }
    b.style.display = 'block';
    b.firstElementChild.style.width = Math.round(clamp(frac, 0, 1) * 100) + '%';
  },
  /* ---- dialogue: say([[who, what], ...]) resolves when the player clicks through */
  _sayResolve: null, _lines: null, _i: 0,
  say(lines) {
    return new Promise((res) => {
      this._lines = lines.slice();
      this._i = 0;
      this._sayResolve = res;
      this._showLine();
    });
  },
  _showLine() {
    const el = $('say');
    if (this._i >= this._lines.length) {
      el.style.display = 'none';
      const r = this._sayResolve; this._sayResolve = null; this._lines = null;
      if (r) r();
      return;
    }
    const [who, what] = this._lines[this._i];
    el.style.display = 'block';
    el.querySelector('.who').textContent = who || '';
    el.querySelector('.what').textContent = what;
    el.querySelector('.more').textContent = this._i === this._lines.length - 1 ? 'CLICK TO GO ON' : 'CLICK / SPACE';
    AU.sfx('page');
  },
  advance() {
    if (!this._lines) return false;
    this._i++;
    this._showLine();
    return true;
  },
  talking() { return !!this._lines; },
  clearSay() {
    $('say').style.display = 'none';
    const r = this._sayResolve;
    this._sayResolve = null; this._lines = null;
    if (r) r();
  },
  spellbar(spells, activeIdx) {
    const bar = $('spellbar');
    if (!spells || !spells.length) { bar.innerHTML = ''; return; }
    bar.innerHTML = spells.map((s, i) =>
      '<div class="slot' + (i === activeIdx ? ' on' : '') + '" data-i="' + i + '">' +
      '<div class="g">' + s.glyph + '</div><div class="n">' + s.name + '</div></div>').join('');
  }
};
$('say').addEventListener('click', () => UI.advance());
window.addEventListener('keydown', (e) => {
  if ((e.key === ' ' || e.key === 'Enter') && UI.talking()) { UI.advance(); e.preventDefault(); }
});

/* ================================================================= SAVE == */
const SKEY = 'magic.v1';
export const SAVE = {
  data: null,
  fresh() {
    return {
      made: false,
      look: { skin: 3, hair: 0, hairCol: 1, eyes: 0, wear: 0, name: 'ALEX' },
      chapter: 0, done: [], spells: [], broom: false, stars: 0, deaths: 0, wand: null
    };
  },
  load() {
    this.data = this.fresh();
    try {
      const raw = JSON.parse(localStorage.getItem(SKEY));
      if (raw && typeof raw === 'object') {
        const f = this.fresh();
        for (const k in f) if (raw[k] !== undefined && typeof raw[k] === typeof f[k]) this.data[k] = raw[k];
        if (raw.look) for (const k in f.look) if (raw.look[k] !== undefined) this.data.look[k] = raw.look[k];
      }
    } catch (e) {}
    return this.data;
  },
  save() { try { localStorage.setItem(SKEY, JSON.stringify(this.data)); } catch (e) {} },
  wipe() { try { localStorage.removeItem(SKEY); } catch (e) {} this.data = this.fresh(); },
  has(spell) { return this.data.spells.indexOf(spell) >= 0; },
  learn(spell) { if (!this.has(spell)) { this.data.spells.push(spell); this.save(); } },
  finish(ch) { if (this.data.done.indexOf(ch) < 0) { this.data.done.push(ch); } this.save(); }
};

/* ============================================================== SCREENS == */
const SCREENS = ['titleScreen', 'make', 'boardScreen', 'cardScreen', 'pauseScreen'];
export function showScreen(id) {
  SCREENS.forEach((s) => $(s).classList.toggle('show', s === id));
  $('hud').style.display = id ? 'none' : '';
}
export function hideScreens() { showScreen(null); }
