import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// ─── Engine ───────────────────────────────────────────────────────────
// Core game engine: scene, renderer, controls, postprocessing,
// interaction, particles, procedural audio, and HUD.

export class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    this.interactives = new Map();
    this.particleSystems = [];
    this.currentTarget = null;
    this.narrativeOpen = false;

    this._initRenderer();
    this._initScene();
    this._initPostProcessing();
    this._initControls();
    this._initInteraction();
    this._initAudio();
    this._initHUD();

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  // ── Renderer ──────────────────────────────────────────────────────
  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.4;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 100);
    this.camera.position.set(0, 1.6, 0);
    this.clock = new THREE.Clock();

    // Default fog
    this.scene.fog = new THREE.FogExp2(0x0a1628, 0.025);
    this.scene.background = new THREE.Color(0x0a1628);
  }

  _initPostProcessing() {
    this.composer = new EffectComposer(this.renderer);

    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.8,   // strength
      0.4,   // radius
      0.85   // threshold
    );
    this.composer.addPass(this.bloomPass);

    const outputPass = new OutputPass();
    this.composer.addPass(outputPass);
  }

  // ── Controls ──────────────────────────────────────────────────────
  _initControls() {
    this.pointerControls = new PointerLockControls(this.camera, this.canvas);

    // Movement state
    this.moveState = { forward: false, backward: false, left: false, right: false };
    this.velocity = new THREE.Vector3();
    this.direction = new THREE.Vector3();
    this.moveSpeed = 5.0;

    document.addEventListener('keydown', (e) => this._onKeyDown(e));
    document.addEventListener('keyup', (e) => this._onKeyUp(e));
  }

  _onKeyDown(e) {
    if (this.narrativeOpen) return;
    switch (e.code) {
      case 'KeyW': case 'ArrowUp':    this.moveState.forward = true; break;
      case 'KeyS': case 'ArrowDown':  this.moveState.backward = true; break;
      case 'KeyA': case 'ArrowLeft':  this.moveState.left = true; break;
      case 'KeyD': case 'ArrowRight': this.moveState.right = true; break;
    }
  }

  _onKeyUp(e) {
    switch (e.code) {
      case 'KeyW': case 'ArrowUp':    this.moveState.forward = false; break;
      case 'KeyS': case 'ArrowDown':  this.moveState.backward = false; break;
      case 'KeyA': case 'ArrowLeft':  this.moveState.left = false; break;
      case 'KeyD': case 'ArrowRight': this.moveState.right = false; break;
    }
  }

  lockControls() {
    this.pointerControls.lock();
  }

  get isLocked() {
    return this.pointerControls.isLocked;
  }

  _updateMovement(delta) {
    if (!this.isLocked || this.narrativeOpen) return;

    // Friction
    this.velocity.x -= this.velocity.x * 8.0 * delta;
    this.velocity.z -= this.velocity.z * 8.0 * delta;

    this.direction.z = Number(this.moveState.forward) - Number(this.moveState.backward);
    this.direction.x = Number(this.moveState.right) - Number(this.moveState.left);
    this.direction.normalize();

    if (this.moveState.forward || this.moveState.backward) {
      this.velocity.z -= this.direction.z * this.moveSpeed * delta;
    }
    if (this.moveState.left || this.moveState.right) {
      this.velocity.x -= this.direction.x * this.moveSpeed * delta;
    }

    this.pointerControls.moveRight(-this.velocity.x * delta * 10);
    this.pointerControls.moveForward(-this.velocity.z * delta * 10);

    // Clamp Y position (no flying)
    this.camera.position.y = 1.6;

    // Room bounds clamping (set per room)
    if (this.roomBounds) {
      const b = this.roomBounds;
      this.camera.position.x = Math.max(b.minX + 0.3, Math.min(b.maxX - 0.3, this.camera.position.x));
      this.camera.position.z = Math.max(b.minZ + 0.3, Math.min(b.maxZ - 0.3, this.camera.position.z));
    }
  }

  setRoomBounds(minX, maxX, minZ, maxZ) {
    this.roomBounds = { minX, maxX, minZ, maxZ };
  }

  // ── Interaction System ────────────────────────────────────────────
  _initInteraction() {
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 4.0; // Interaction range
    this.screenCenter = new THREE.Vector2(0, 0);
    this.mouseHeld = false;
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;

    document.addEventListener('click', (e) => this._onClick(e));
    document.addEventListener('mousedown', () => { this.mouseHeld = true; });
    document.addEventListener('mouseup', () => { this.mouseHeld = false; });
    document.addEventListener('mousemove', (e) => {
      if (this.mouseHeld && this.isLocked) {
        this.mouseDeltaX += e.movementX;
        this.mouseDeltaY += e.movementY;
      }
    });
  }

  registerInteractive(mesh, config) {
    // config: { type: 'click'|'adjust'|'read', prompt, icon, onInteract, onAdjust(dx,dy), data }
    mesh.userData.interactive = true;
    this.interactives.set(mesh.uuid, { mesh, ...config });
  }

  unregisterInteractive(mesh) {
    this.interactives.delete(mesh.uuid);
  }

  clearInteractives() {
    this.interactives.clear();
    this.currentTarget = null;
    this.hidePrompt();
  }

  _isInScene(obj) {
    let current = obj;
    while (current) {
      if (current === this.scene) return true;
      current = current.parent;
    }
    return false;
  }

  _updateInteraction() {
    if (!this.isLocked || this.narrativeOpen) {
      if (this.currentTarget) {
        this.currentTarget = null;
        this.hidePrompt();
      }
      return;
    }

    this.raycaster.setFromCamera(this.screenCenter, this.camera);

    // Only check interactives whose meshes are in the active scene
    const meshes = Array.from(this.interactives.values())
      .filter(i => this._isInScene(i.mesh))
      .map(i => i.mesh);
    const intersects = this.raycaster.intersectObjects(meshes, true);

    if (intersects.length > 0) {
      // Walk up to find the registered object
      let obj = intersects[0].object;
      let config = this.interactives.get(obj.uuid);
      while (!config && obj.parent) {
        obj = obj.parent;
        config = this.interactives.get(obj.uuid);
      }

      if (config && config !== this.currentTarget) {
        this.currentTarget = config;
        this.showPrompt(config.prompt || 'Interact', config.icon || '✋');
      }

      // Handle adjust-type interaction (continuous mouse drag)
      if (config && config.type === 'adjust' && this.mouseHeld && config.onAdjust) {
        config.onAdjust(this.mouseDeltaX, this.mouseDeltaY);
      }
    } else {
      if (this.currentTarget) {
        this.currentTarget = null;
        this.hidePrompt();
      }
    }

    // Reset mouse deltas each frame
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
  }

  _onClick() {
    if (!this.isLocked || this.narrativeOpen) return;
    if (this.currentTarget && this.currentTarget.onInteract) {
      this.currentTarget.onInteract();
    }
  }

  // ── Particle Systems ──────────────────────────────────────────────
  addDust(bounds, count = 200) {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities = [];

    for (let i = 0; i < count; i++) {
      positions[i * 3]     = bounds.minX + Math.random() * (bounds.maxX - bounds.minX);
      positions[i * 3 + 1] = Math.random() * bounds.height;
      positions[i * 3 + 2] = bounds.minZ + Math.random() * (bounds.maxZ - bounds.minZ);
      velocities.push(new THREE.Vector3(
        (Math.random() - 0.5) * 0.02,
        (Math.random() - 0.5) * 0.01,
        (Math.random() - 0.5) * 0.02
      ));
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      size: 0.02,
      color: 0x8899aa,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    const points = new THREE.Points(geometry, material);
    this.scene.add(points);

    const system = {
      points,
      velocities,
      bounds,
      update(delta) {
        const pos = points.geometry.attributes.position;
        for (let i = 0; i < count; i++) {
          pos.array[i * 3]     += velocities[i].x * delta;
          pos.array[i * 3 + 1] += velocities[i].y * delta;
          pos.array[i * 3 + 2] += velocities[i].z * delta;

          // Wrap around
          if (pos.array[i * 3]     < bounds.minX) pos.array[i * 3]     = bounds.maxX;
          if (pos.array[i * 3]     > bounds.maxX) pos.array[i * 3]     = bounds.minX;
          if (pos.array[i * 3 + 1] < 0) pos.array[i * 3 + 1] = bounds.height;
          if (pos.array[i * 3 + 1] > bounds.height) pos.array[i * 3 + 1] = 0;
          if (pos.array[i * 3 + 2] < bounds.minZ) pos.array[i * 3 + 2] = bounds.maxZ;
          if (pos.array[i * 3 + 2] > bounds.maxZ) pos.array[i * 3 + 2] = bounds.minZ;
        }
        pos.needsUpdate = true;
      }
    };

    this.particleSystems.push(system);
    return system;
  }

  addSteam(position, direction, count = 80) {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const ages = new Float32Array(count);
    const speeds = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      positions[i * 3]     = position.x;
      positions[i * 3 + 1] = position.y;
      positions[i * 3 + 2] = position.z;
      ages[i] = Math.random(); // Stagger initial ages
      speeds[i] = 0.5 + Math.random() * 1.0;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      size: 0.06,
      color: 0xaabbcc,
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    const points = new THREE.Points(geometry, material);
    points.visible = false; // Start hidden
    this.scene.add(points);

    const dir = direction.clone().normalize();

    const system = {
      points,
      active: false,
      intensity: 0,
      update(delta) {
        if (!this.active && this.intensity <= 0) {
          points.visible = false;
          return;
        }
        points.visible = true;
        material.opacity = 0.3 * this.intensity;

        const pos = points.geometry.attributes.position;
        for (let i = 0; i < count; i++) {
          ages[i] += delta * speeds[i];
          if (ages[i] > 1.0) {
            ages[i] = 0;
            pos.array[i * 3]     = position.x + (Math.random() - 0.5) * 0.1;
            pos.array[i * 3 + 1] = position.y + (Math.random() - 0.5) * 0.1;
            pos.array[i * 3 + 2] = position.z + (Math.random() - 0.5) * 0.1;
          }

          const speed = speeds[i] * this.intensity;
          pos.array[i * 3]     += dir.x * speed * delta + (Math.random() - 0.5) * 0.02;
          pos.array[i * 3 + 1] += dir.y * speed * delta + Math.random() * 0.01;
          pos.array[i * 3 + 2] += dir.z * speed * delta + (Math.random() - 0.5) * 0.02;
        }
        pos.needsUpdate = true;
      },
      setIntensity(val) {
        this.intensity = Math.max(0, Math.min(1, val));
        this.active = val > 0;
      }
    };

    this.particleSystems.push(system);
    return system;
  }

  addSparks(position, count = 30) {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocitiesArr = [];
    const ages = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      positions[i * 3]     = position.x;
      positions[i * 3 + 1] = position.y;
      positions[i * 3 + 2] = position.z;
      velocitiesArr.push(new THREE.Vector3(
        (Math.random() - 0.5) * 3,
        Math.random() * 2 + 1,
        (Math.random() - 0.5) * 3
      ));
      ages[i] = Math.random();
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      size: 0.03,
      color: 0xffaa44,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    const points = new THREE.Points(geometry, material);
    points.visible = false;
    this.scene.add(points);

    const system = {
      points,
      active: false,
      update(delta) {
        if (!this.active) {
          points.visible = false;
          return;
        }
        points.visible = true;

        const pos = points.geometry.attributes.position;
        for (let i = 0; i < count; i++) {
          ages[i] += delta * 2;
          if (ages[i] > 1.0) {
            ages[i] = 0;
            pos.array[i * 3]     = position.x + (Math.random() - 0.5) * 0.1;
            pos.array[i * 3 + 1] = position.y;
            pos.array[i * 3 + 2] = position.z + (Math.random() - 0.5) * 0.1;
            velocitiesArr[i].set(
              (Math.random() - 0.5) * 3,
              Math.random() * 2 + 1,
              (Math.random() - 0.5) * 3
            );
          }
          velocitiesArr[i].y -= 5 * delta; // gravity
          pos.array[i * 3]     += velocitiesArr[i].x * delta;
          pos.array[i * 3 + 1] += velocitiesArr[i].y * delta;
          pos.array[i * 3 + 2] += velocitiesArr[i].z * delta;
        }
        pos.needsUpdate = true;
      },
      trigger() {
        this.active = true;
        setTimeout(() => { this.active = false; }, 800);
      }
    };

    this.particleSystems.push(system);
    return system;
  }

  clearParticles() {
    for (const sys of this.particleSystems) {
      this.scene.remove(sys.points);
      sys.points.geometry.dispose();
      sys.points.material.dispose();
    }
    this.particleSystems = [];
  }

  // ── Audio (Procedural) ────────────────────────────────────────────
  _initAudio() {
    this.audioCtx = null; // Lazy init on user gesture
    this.ambientNodes = [];
  }

  _ensureAudio() {
    if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  playAmbient(frequency = 60, type = 'sine', volume = 0.08) {
    const ctx = this._ensureAudio();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    gain.gain.value = 0;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    // Fade in
    gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 2);

    // Add subtle modulation
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.1 + Math.random() * 0.2;
    lfoGain.gain.value = frequency * 0.02;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    lfo.start();

    this.ambientNodes.push({ osc, gain, lfo, lfoGain });
    return this.ambientNodes.length - 1;
  }

  stopAmbient() {
    for (const node of this.ambientNodes) {
      const ctx = this.audioCtx;
      if (ctx) {
        node.gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 1);
        setTimeout(() => {
          node.osc.stop();
          node.lfo.stop();
        }, 1500);
      }
    }
    this.ambientNodes = [];
  }

  playEffect(type, volume = 0.15) {
    const ctx = this._ensureAudio();
    const gain = ctx.createGain();
    gain.gain.value = volume;
    gain.connect(ctx.destination);

    switch (type) {
      case 'click': {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 800;
        osc.connect(gain);
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
        osc.stop(ctx.currentTime + 0.1);
        break;
      }
      case 'clunk': {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = 120;
        osc.connect(gain);
        osc.start();
        osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.3);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        osc.stop(ctx.currentTime + 0.4);
        break;
      }
      case 'alarm': {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = 440;
        osc.connect(gain);
        gain.gain.value = volume * 0.6;
        osc.start();
        const now = ctx.currentTime;
        for (let i = 0; i < 4; i++) {
          osc.frequency.setValueAtTime(440, now + i * 0.2);
          osc.frequency.setValueAtTime(520, now + i * 0.2 + 0.1);
        }
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
        osc.stop(now + 0.8);
        break;
      }
      case 'hiss': {
        const bufferSize = ctx.sampleRate * 0.5;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
        }
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        const filter = ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 3000;
        source.connect(filter);
        filter.connect(gain);
        gain.gain.value = volume * 0.4;
        source.start();
        break;
      }
      case 'success': {
        const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
        notes.forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = freq;
          g.gain.value = 0;
          osc.connect(g);
          g.connect(ctx.destination);
          osc.start(ctx.currentTime + i * 0.15);
          g.gain.linearRampToValueAtTime(volume, ctx.currentTime + i * 0.15 + 0.05);
          g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 0.5);
          osc.stop(ctx.currentTime + i * 0.15 + 0.5);
        });
        break;
      }
      case 'powerup': {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 200;
        osc.connect(gain);
        osc.start();
        osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.8);
        gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.0);
        osc.stop(ctx.currentTime + 1.0);
        break;
      }
      case 'valve': {
        // Metallic creak
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = 80 + Math.random() * 40;
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 800;
        filter.Q.value = 5;
        osc.connect(filter);
        filter.connect(gain);
        gain.gain.value = volume * 0.3;
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
        osc.stop(ctx.currentTime + 0.15);
        break;
      }
      case 'drip': {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 1200 + Math.random() * 600;
        osc.connect(gain);
        gain.gain.value = volume * 0.2;
        osc.start();
        osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
        osc.stop(ctx.currentTime + 0.1);
        break;
      }
    }
  }

  // ── HUD ───────────────────────────────────────────────────────────
  _initHUD() {
    this.promptEl = document.getElementById('interaction-prompt');
    this.promptIconEl = document.getElementById('prompt-icon');
    this.promptTextEl = document.getElementById('prompt-text');
    this.narrativePanel = document.getElementById('narrative-panel');
    this.narrativeTitle = document.getElementById('narrative-title');
    this.narrativeBody = document.getElementById('narrative-body');
    this.narrativeCloseBtn = document.getElementById('narrative-close');
    this.roomTitleEl = document.getElementById('room-title');
    this.roomTitleText = document.getElementById('room-title-text');
    this.roomSubtitleText = document.getElementById('room-subtitle-text');
    this.completionBanner = document.getElementById('completion-banner');
    this.completionText = document.getElementById('completion-text');
    this.objectiveHint = document.getElementById('objective-hint');
    this.objectiveText = document.getElementById('objective-text');
    this.hudEl = document.getElementById('hud');

    this.narrativeCloseBtn.addEventListener('click', () => this.hideNarrative());
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.narrativeOpen) {
        this.hideNarrative();
      }
    });
  }

  showHUD() { this.hudEl.classList.remove('hidden'); }
  hideHUD() { this.hudEl.classList.add('hidden'); }

  showPrompt(text, icon = '✋') {
    this.promptTextEl.textContent = text;
    this.promptIconEl.textContent = icon;
    this.promptEl.classList.remove('hidden');
  }

  hidePrompt() {
    this.promptEl.classList.add('hidden');
  }

  showNarrative(title, bodyHTML) {
    this.narrativeTitle.textContent = title;
    this.narrativeBody.innerHTML = bodyHTML;
    this.narrativePanel.classList.remove('hidden');
    this.narrativeOpen = true;
    this.pointerControls.unlock();
  }

  hideNarrative() {
    this.narrativePanel.classList.add('hidden');
    this.narrativeOpen = false;
    this.lockControls();
  }

  showRoomTitle(title, subtitle) {
    this.roomTitleText.textContent = title;
    this.roomSubtitleText.textContent = subtitle || '';
    this.roomTitleEl.classList.remove('hidden');
    setTimeout(() => this.roomTitleEl.classList.add('hidden'), 3000);
  }

  showCompletion(text) {
    this.completionText.textContent = text;
    this.completionBanner.classList.remove('hidden');
    setTimeout(() => this.completionBanner.classList.add('hidden'), 3000);
  }

  showObjective(text) {
    this.objectiveText.textContent = text;
    this.objectiveHint.classList.remove('hidden');
  }

  hideObjective() {
    this.objectiveHint.classList.add('hidden');
  }

  // ── Lifecycle ─────────────────────────────────────────────────────
  update() {
    const delta = this.clock.getDelta();
    this._updateMovement(delta);
    this._updateInteraction();

    // Update particles
    for (const sys of this.particleSystems) {
      sys.update(delta);
    }

    // Render
    this.composer.render();

    return delta;
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.composer.setSize(w, h);
    this.bloomPass.resolution.set(w, h);
  }
}

// ─── Geometry Helpers ─────────────────────────────────────────────────
// Shared utilities for building rooms.

export const Materials = {
  wall: (color = 0x1a3a5c) => new THREE.MeshStandardMaterial({
    color, roughness: 0.85, metalness: 0.1
  }),
  floor: (color = 0x0d1b2a) => new THREE.MeshStandardMaterial({
    color, roughness: 0.9, metalness: 0.05
  }),
  ceiling: (color = 0x162d45) => new THREE.MeshStandardMaterial({
    color, roughness: 0.9, metalness: 0.05
  }),
  metal: (color = 0x4a5568) => new THREE.MeshStandardMaterial({
    color, roughness: 0.3, metalness: 0.8
  }),
  metalAccent: (color = 0xf4a261) => new THREE.MeshStandardMaterial({
    color, roughness: 0.4, metalness: 0.7
  }),
  emissive: (color = 0x4ecdc4, intensity = 2) => new THREE.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: intensity, roughness: 0.2, metalness: 0.5
  }),
  emissiveWarn: (color = 0xe63946, intensity = 2) => new THREE.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: intensity, roughness: 0.2, metalness: 0.5
  }),
  emissiveOk: (color = 0x2a9d8f, intensity = 2) => new THREE.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: intensity, roughness: 0.2, metalness: 0.5
  }),
  glass: () => new THREE.MeshStandardMaterial({
    color: 0x88ccee, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.3
  }),
  screen: (color = 0x112233) => new THREE.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: 0.5, roughness: 0.1, metalness: 0.3
  }),
  lightBeam: () => new THREE.MeshBasicMaterial({
    color: 0xffffcc, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending
  })
};

export function createRoom(width, height, depth, wallMat, floorMat, ceilMat) {
  const group = new THREE.Group();

  // Floor
  const floorGeo = new THREE.PlaneGeometry(width, depth);
  const floor = new THREE.Mesh(floorGeo, floorMat || Materials.floor());
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);

  // Ceiling
  const ceilGeo = new THREE.PlaneGeometry(width, depth);
  const ceil = new THREE.Mesh(ceilGeo, ceilMat || Materials.ceiling());
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = height;
  group.add(ceil);

  // Walls
  const wallGeo = new THREE.PlaneGeometry(width, height);
  const wallGeoSide = new THREE.PlaneGeometry(depth, height);

  // Back wall
  const backWall = new THREE.Mesh(wallGeo, wallMat || Materials.wall());
  backWall.position.set(0, height / 2, -depth / 2);
  group.add(backWall);

  // Front wall
  const frontWall = new THREE.Mesh(wallGeo, wallMat || Materials.wall());
  frontWall.position.set(0, height / 2, depth / 2);
  frontWall.rotation.y = Math.PI;
  group.add(frontWall);

  // Left wall
  const leftWall = new THREE.Mesh(wallGeoSide, wallMat || Materials.wall());
  leftWall.position.set(-width / 2, height / 2, 0);
  leftWall.rotation.y = Math.PI / 2;
  group.add(leftWall);

  // Right wall
  const rightWall = new THREE.Mesh(wallGeoSide, wallMat || Materials.wall());
  rightWall.position.set(width / 2, height / 2, 0);
  rightWall.rotation.y = -Math.PI / 2;
  group.add(rightWall);

  return { group, floor, ceil, backWall, frontWall, leftWall, rightWall };
}

export function createDoor(width = 1.2, height = 2.2, color = 0x2d4a6f) {
  const group = new THREE.Group();

  // Door frame
  const frameMat = Materials.metal(0x3a3a3a);
  const frameThickness = 0.08;

  // Top
  const topFrame = new THREE.Mesh(
    new THREE.BoxGeometry(width + frameThickness * 2, frameThickness, 0.15),
    frameMat
  );
  topFrame.position.y = height;
  group.add(topFrame);

  // Left
  const leftFrame = new THREE.Mesh(
    new THREE.BoxGeometry(frameThickness, height, 0.15),
    frameMat
  );
  leftFrame.position.set(-width / 2 - frameThickness / 2, height / 2, 0);
  group.add(leftFrame);

  // Right
  const rightFrame = new THREE.Mesh(
    new THREE.BoxGeometry(frameThickness, height, 0.15),
    frameMat
  );
  rightFrame.position.set(width / 2 + frameThickness / 2, height / 2, 0);
  group.add(rightFrame);

  // Door panel
  const doorMat = new THREE.MeshStandardMaterial({
    color, roughness: 0.5, metalness: 0.6
  });
  const doorPanel = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, 0.08),
    doorMat
  );
  doorPanel.position.y = height / 2;
  group.add(doorPanel);

  // Status light
  const lightGeo = new THREE.SphereGeometry(0.04, 8, 8);
  const lightMat = Materials.emissiveWarn(0xe63946, 3);
  const statusLight = new THREE.Mesh(lightGeo, lightMat);
  statusLight.position.set(0, height + 0.1, 0.05);
  group.add(statusLight);

  return { group, doorPanel, statusLight, lightMat };
}

export function createGauge(radius = 0.15, label = '') {
  const group = new THREE.Group();

  // Gauge face
  const face = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 32),
    new THREE.MeshStandardMaterial({
      color: 0x111111, roughness: 0.3, metalness: 0.2
    })
  );
  group.add(face);

  // Gauge ring
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(radius - 0.01, radius + 0.01, 32),
    Materials.emissive(0x4ecdc4, 1.5)
  );
  ring.position.z = 0.001;
  group.add(ring);

  // Tick marks
  for (let i = 0; i <= 10; i++) {
    const angle = (-Math.PI * 0.75) + (i / 10) * (Math.PI * 1.5);
    const inner = radius * 0.7;
    const outer = radius * 0.85;
    const tickGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(Math.cos(angle) * inner, Math.sin(angle) * inner, 0.002),
      new THREE.Vector3(Math.cos(angle) * outer, Math.sin(angle) * outer, 0.002)
    ]);
    const tick = new THREE.Line(tickGeo, new THREE.LineBasicMaterial({ color: 0x4ecdc4 }));
    group.add(tick);
  }

  // Needle
  const needleGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0.003),
    new THREE.Vector3(0, radius * 0.65, 0.003)
  ]);
  const needleMat = new THREE.LineBasicMaterial({ color: 0xe63946, linewidth: 2 });
  const needle = new THREE.Line(needleGeo, needleMat);
  group.add(needle);

  // Center cap
  const cap = new THREE.Mesh(
    new THREE.CircleGeometry(0.015, 16),
    Materials.metal(0x888888)
  );
  cap.position.z = 0.004;
  group.add(cap);

  // Set needle to a value (0-1)
  function setValue(val) {
    const angle = (-Math.PI * 0.75) + val * (Math.PI * 1.5);
    needle.rotation.z = angle - Math.PI / 2;
  }

  setValue(0);

  return { group, needle, ring, setValue };
}

export function createValveWheel(radius = 0.2) {
  const group = new THREE.Group();

  // Central hub
  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 0.06, 16),
    Materials.metal(0x666666)
  );
  hub.rotation.x = Math.PI / 2;
  group.add(hub);

  // Rim
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(radius, 0.015, 8, 32),
    Materials.metalAccent(0xcc4444)
  );
  group.add(rim);

  // Spokes
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2;
    const spoke = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.008, radius * 2, 6),
      Materials.metal(0x555555)
    );
    spoke.rotation.z = angle;
    group.add(spoke);
  }

  return { group };
}

export function createTextPlane(text, width = 1, height = 0.5, fontSize = 24, color = '#4ecdc4', bgColor = 'rgba(10,22,40,0.9)') {
  const canvas = document.createElement('canvas');
  const scale = 2;
  canvas.width = width * 200 * scale;
  canvas.height = height * 200 * scale;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = color;
  ctx.font = `${fontSize * scale}px Courier New`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Word wrap
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';
  const maxWidth = canvas.width * 0.85;

  for (const word of words) {
    const testLine = currentLine ? currentLine + ' ' + word : word;
    if (ctx.measureText(testLine).width > maxWidth) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  lines.push(currentLine);

  const lineHeight = fontSize * scale * 1.4;
  const startY = canvas.height / 2 - (lines.length - 1) * lineHeight / 2;
  lines.forEach((line, i) => {
    ctx.fillText(line, canvas.width / 2, startY + i * lineHeight);
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.8,
    metalness: 0.0,
    emissive: new THREE.Color(color),
    emissiveIntensity: 0.1,
    emissiveMap: texture
  });

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  return mesh;
}

export function addSpotlight(scene, position, target, color = 0xfff4e6, intensity = 3, angle = 0.5) {
  const light = new THREE.SpotLight(color, intensity, 15, angle, 0.5, 1.5);
  light.position.copy(position);
  light.target.position.copy(target);
  light.castShadow = true;
  light.shadow.mapSize.set(512, 512);
  scene.add(light);
  scene.add(light.target);
  return light;
}

export function addPointLight(scene, position, color = 0x4ecdc4, intensity = 1, distance = 8) {
  const light = new THREE.PointLight(color, intensity, distance, 1.5);
  light.position.copy(position);
  scene.add(light);
  return light;
}
