// cinema.js - the cutscene / presentation director shared by every story level.
// Title cards, fades, letterbox, the first-person eye-blink, scripted camera shots, captions,
// hold-to-skip and the end card. It owns the overlay elements inside #cine (index.html holds the CSS)
// and, while a shot is active, the camera. Runs on REAL time (unscaled dt). API: see LEVELS.md.
//
// Nothing here allocates per frame except short style strings while an overlay is actually animating.

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sat = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (t) => { t = sat(t); return t * t * (3 - 2 * t); };
const EASE = {
  linear: (t) => t,
  in: (t) => t * t,
  out: (t) => 1 - (1 - t) * (1 - t),
  inOut: smooth,
};

export function createCinema(THREE, { camera, canvas, rig, audio, setTimeScale, onPlaying }) {
  const host = document.getElementById("cine");
  const mk = (cls, html) => { const d = document.createElement("div"); d.className = cls; if (html) d.innerHTML = html; host.appendChild(d); return d; };

  // ---------------- elements ----------------
  const tintEl = mk("cine-tint");
  const eyeEl = mk("cine-eye");
  const barT = mk("cine-bar"), barB = mk("cine-bar b");
  const fadeEl = mk("cine-fade");
  const cardEl = mk("cine-card", '<div><div class="kick"></div><div class="title"></div></div>');
  const cardKick = cardEl.querySelector(".kick"), cardTitle = cardEl.querySelector(".title");
  const capEl = mk("cine-cap");
  const skipEl = mk("cine-skip", '<span class="ring"></span><span class="lab"></span>');
  const skipRing = skipEl.querySelector(".ring"), skipLab = skipEl.querySelector(".lab");

  // ---------------- small scheduler (real time) ----------------
  const timers = [];
  let gen = 0;
  function after(t, fn) { timers.push({ t, fn, gen }); }

  // ---------------- fade ----------------
  const fd = { cur: 0, from: 0, to: 0, t: 0, dur: 0, cb: null, shown: -1, color: "#000" };
  // to: "black" | "white" | "clear"; seconds may be 0 (instant); cb runs when the fade has finished
  function fade(to, seconds, cb) {
    if (to !== "clear") {
      const col = to === "white" ? "#fff" : "#000";
      if (col !== fd.color) { fd.color = col; fadeEl.style.background = col; }
    }
    fd.from = fd.cur;
    fd.to = to === "clear" ? 0 : 1;
    fd.dur = seconds || 0;
    fd.t = 0;
    fd.cb = cb || null;
    if (fd.dur <= 0) { fd.cur = fd.to; paintFade(); const f = fd.cb; fd.cb = null; if (f) f(); }
  }
  function paintFade() {
    const q = Math.round(fd.cur * 100) / 100;
    if (q !== fd.shown) { fd.shown = q; fadeEl.style.opacity = q; }
  }

  // ---------------- letterbox ----------------
  const lb = { cur: 0, to: 0, shown: -1 };
  function letterbox(on) { lb.to = on ? 1 : 0; }

  // ---------------- tint ----------------
  let tintName = null;
  // name: "night" | "alarm" | "warm" | "sad" | null; opacity 0..1 (default 1)
  function tint(name, opacity) {
    if (name !== tintName) {
      tintName = name || null;
      tintEl.className = "cine-tint" + (name ? " " + name : "");
    }
    tintEl.style.opacity = name ? (opacity === undefined ? 1 : opacity) : 0;
  }

  // ---------------- cards ----------------
  let cardOp = 0, cardTo = 0, cardRate = 1, cardShown = -1;
  function showCard(kicker, title, dark, day) {
    cardKick.textContent = kicker || "";
    cardTitle.textContent = title || "";
    cardEl.classList.remove("in");
    cardEl.classList.toggle("dark", !!dark);
    cardEl.classList.toggle("day", !!day);
    void cardEl.offsetWidth;
    cardEl.classList.add("in");
    cardTo = 1; cardRate = 1.1;
  }
  // o: { kicker: "LEVEL 2", title: "THE CHAOS REALM", hold: 2.4, sound: true }
  // Fades to black if the screen is not black yet, shows the text, fades the TEXT away and calls cb.
  // The screen is still black when cb runs: reveal the world with fade("clear", s) or eye.open().
  function titleCard(o, cb) {
    const g = gen;
    const go = () => {
      if (g !== gen) return;
      showCard(o.kicker, o.title, false);
      if (o.sound !== false && audio) (audio.titleCard || audio.introBoom).call(audio);
      after(1.0 + (o.hold === undefined ? 2.4 : o.hold), () => { cardTo = 0; cardRate = 1.6; });
      after(1.0 + (o.hold === undefined ? 2.4 : o.hold) + 0.9, () => { if (cb) cb(); });
    };
    if (fd.cur < 1 || fd.color !== "#000") fade("black", fd.cur >= 1 ? 0 : 0.6, go); else go();
  }
  // o: { hold: 4, sub: "" }. Fades to black, shows the text (stays up for `hold`), fades the text, calls cb (still black).
  function endCard(text, o, cb) {
    const g = gen;
    const hold = (o && o.hold) || 4;
    fade("black", fd.cur >= 1 ? 0 : 1.6, () => {
      if (g !== gen) return;
      after(0.7, () => { showCard((o && o.sub) || "", text, false); });
      after(0.7 + 1.0 + hold, () => { cardTo = 0; cardRate = 0.9; });
      after(0.7 + 1.0 + hold + 1.4, () => { if (cb) cb(); });
    });
  }

  // The countdown to Pip ("5 DAYS", "3 DAYS...") in the red glowing digits of the lair timer.
  // o: { kicker: "" (small line above), hold: 3.2, sound: true }. Fades to black if the screen is not black yet, shows the
  // text ticking (audio.timerTick once a second), fades the TEXT away and calls cb with the screen still black.
  function dayCard(text, o, cb) {
    const g = gen;
    const hold = (o && o.hold) || 3.2;
    const go = () => {
      if (g !== gen) return;
      showCard((o && o.kicker) || "", text, false, true);
      if (!(o && o.sound === false) && audio && audio.timerTick) for (let i = 0; i < hold + 0.5; i++) after(0.25 + i, () => { if (g === gen) audio.timerTick(); });
      after(1.0 + hold, () => { cardTo = 0; cardRate = 1.2; });
      after(1.0 + hold + 1.1, () => { if (cb) cb(); });
    };
    if (fd.cur < 1 || fd.color !== "#000") fade("black", fd.cur >= 1 ? 0 : 0.8, go); else go();
  }

  // ---------------- captions ----------------
  let capT = 0, capWho = null;
  // subtitle / narration line at the bottom. o: { who: "Wizard Wobble" (speaker label), narr: true (italic narration) }
  function caption(text, seconds, o) {
    if (!text) { capEl.classList.remove("on"); capT = 0; return; }
    const who = (o && o.who) || null;
    capEl.textContent = "";
    if (who) { const w = document.createElement("span"); w.className = "who"; w.textContent = who; capEl.appendChild(w); }
    capEl.appendChild(document.createTextNode(text));
    capWho = who;
    capEl.classList.toggle("narr", !!(o && o.narr));
    capEl.classList.add("on");
    capT = seconds || 2 + text.length * 0.06;
  }

  // ---------------- the eye ----------------
  // Two soft curved lids (SVG, drawn once) moved with transforms only, a vignette, and a CSS filter on the
  // game canvas for the blur / exposure that clears as the eye adapts. See LEVELS.md for the look.
  function lidSvg(upper) {
    const base = upper ? 150 : 50, dir = upper ? -1 : 1, c = upper ? 46 : 30;
    const cy = base + dir * c * 1.3333;
    let d = upper
      ? "M-5,-5 H105 V150 H100 C78," + cy + " 22," + cy + " 0,150 H-5 Z"
      : "M-5,205 H105 V50 H100 C78," + cy + " 22," + cy + " 0,50 H-5 Z";
    // soft fur / lash fringe: tapered tufts along the lid edge, pointing into the opening
    let lash = "";
    let seed = upper ? 7 : 91;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const N = upper ? 130 : 84;
    for (let i = 0; i < N; i++) {
      const t = (i + 0.2 + rnd() * 0.6) / N;
      const mt = 1 - t;
      const x = 3 * mt * mt * t * 22 + 3 * mt * t * t * 78 + t * t * t * 100;
      const y = base + 3 * mt * t * (cy - base);
      const len = (upper ? 6.5 : 3) * (0.5 + rnd() * 0.9) * (0.45 + 2.2 * t * mt);
      const w = 0.22 + rnd() * 0.24;
      const lean = (t - 0.5) * 3.2 + (rnd() - 0.5) * 1.2;
      lash += "M" + (x - w).toFixed(2) + "," + (y + dir * 0.6).toFixed(2) + " L" + (x + lean).toFixed(2) + "," + (y - dir * len).toFixed(2) + " L" + (x + w).toFixed(2) + "," + (y + dir * 0.6).toFixed(2) + " Z ";
    }
    // body (flat, same colour as the block behind it), a warm rim where light glows through the skin, then the fringe.
    // The whole SVG is blurred in CSS: a lid this close to the eye is far out of focus.
    const rim = "M100," + base + " C78," + cy + " 22," + cy + " 0," + base;
    // The blur is baked into the SVG (a filter inside it, rastered once): a CSS blur on these two huge
    // layers was recomputed by the compositor on every frame of a blink and cost ~10 fps on the target GPU.
    const fid = upper ? "lidBlurU" : "lidBlurL";
    return '<svg class="' + (upper ? "up" : "lo") + '" viewBox="0 0 100 200" preserveAspectRatio="none">' +
      '<defs><filter id="' + fid + '" filterUnits="userSpaceOnUse" x="-10" y="-10" width="120" height="220"><feGaussianBlur stdDeviation="0.42 1"/></filter></defs>' +
      '<g filter="url(#' + fid + ')">' +
      '<path d="' + d + '" style="fill:var(--lid-deep)"/>' +
      '<path d="' + rim + '" fill="none" style="stroke:var(--lid-mid)" stroke-opacity=".3" stroke-width="' + (upper ? 34 : 22) + '" transform="translate(0,' + (dir * (upper ? 15 : 10)) + ')"/>' +
      '<path d="' + rim + '" fill="none" style="stroke:var(--lid-mid)" stroke-opacity=".45" stroke-width="' + (upper ? 22 : 14) + '" transform="translate(0,' + (dir * (upper ? 9.5 : 6.5)) + ')"/>' +
      '<path d="' + rim + '" fill="none" style="stroke:var(--lid-mid)" stroke-opacity=".7" stroke-width="' + (upper ? 11 : 7) + '" transform="translate(0,' + (dir * (upper ? 4.5 : 3)) + ')"/>' +
      '<path d="' + rim + '" fill="none" style="stroke:var(--lid-edge)" stroke-width="' + (upper ? 3.2 : 2.2) + '" stroke-opacity=".8" transform="translate(0,' + (dir * 1.2) + ')"/>' +
      '<path d="' + lash + '" style="fill:var(--lid-lash)"/></g></svg>';
  }
  // each lid = the curved SVG edge (scaled to flatten the arch as it closes) + a plain block behind it
  eyeEl.innerHTML = '<div class="vig"></div><div class="blk u"></div><div class="blk l"></div>' + lidSvg(true) + lidSvg(false);
  const lidU = eyeEl.querySelector(".up"), lidL = eyeEl.querySelector(".lo"), vigEl = eyeEl.querySelector(".vig");
  const blkU = eyeEl.querySelector(".blk.u"), blkL = eyeEl.querySelector(".blk.l");
  const LID = {
    day: ["#050202", "#1a0a05", "#4a2212", "#120704"],
    night: ["#010103", "#05070f", "#10182c", "#020308"],
    alarm: ["#040101", "#190403", "#3c0b08", "#120202"],
  };
  const ey = {
    on: false, mode: 0, t: 0, dur: 1, keys: null, o: 0, shownO: -1, sway: 1, tint: "day", cb: null,
    blur: 0, bright: 1, shownF: "", pitch: 0, roll: 0, yaw: 0,
  };
  const KEYS_OPEN = [
    [0, 0, 0.05, 0, 0.11, 0.2, 0.17, 0.14, 0.23, 0, 1, 0],
    [0, 0, 0.06, 0, 0.16, 0.42, 0.3, 0.36, 0.38, 0, 0.46, 0, 0.6, 0.8, 0.72, 0.76, 0.76, 0.04, 0.82, 0.84, 1, 1],
    [0, 0, 0.05, 0, 0.11, 0.2, 0.17, 0.14, 0.23, 0, 0.3, 0, 0.4, 0.5, 0.52, 0.45, 0.58, 0, 0.65, 0, 0.73, 0.8, 0.81, 0.76, 0.845, 0.04, 0.89, 0.84, 1, 1],
    [0, 0, 0.04, 0, 0.09, 0.16, 0.14, 0.1, 0.18, 0, 0.24, 0, 0.31, 0.34, 0.39, 0.3, 0.44, 0, 0.5, 0, 0.58, 0.58, 0.67, 0.52, 0.71, 0, 0.76, 0, 0.82, 0.82, 0.88, 0.78, 0.905, 0.04, 0.94, 0.86, 1, 1],
  ];
  KEYS_OPEN[0] = [0, 0, 0.12, 0, 0.5, 0.7, 0.66, 0.64, 0.72, 0.04, 0.8, 0.84, 1, 1];
  const KEYS_CLOSE = [0, 1, 0.14, 0.52, 0.25, 0.8, 0.43, 0.32, 0.54, 0.58, 0.74, 0.12, 0.83, 0.2, 1, 0];
  function evalKeys(k, p) {
    for (let i = 2; i < k.length; i += 2) {
      if (p <= k[i]) {
        const t0 = k[i - 2], t1 = k[i];
        return k[i - 1] + (k[i + 1] - k[i - 1]) * smooth(t1 > t0 ? (p - t0) / (t1 - t0) : 1);
      }
    }
    return k[k.length - 1];
  }
  function setLidTint(name) {
    const c = LID[name] || LID.day;
    eyeEl.style.setProperty("--lid-deep", c[0]);
    eyeEl.style.setProperty("--lid-mid", c[1]);
    eyeEl.style.setProperty("--lid-edge", c[2]);
    eyeEl.style.setProperty("--lid-lash", c[3]);
    ey.tint = LID[name] ? name : "day";
  }
  setLidTint("day");
  function paintEye() {
    const o = Math.round(sat(ey.o) * 400) / 400;
    if (o !== ey.shownO) {
      ey.shownO = o;
      const a = sat(o / 0.6), b = sat((o - 0.6) / 0.4);
      const yu = 53 - 7 * a - 60 * b, su = 0.03 + 0.92 * a + 0.2 * b;
      const yl = 50 + 5 * a + 57 * b - 100, sl = 0.03 + 0.85 * a + 0.2 * b;
      lidU.style.transform = "translate3d(0," + yu.toFixed(2) + "vh,0) scaleY(" + su.toFixed(3) + ")";
      lidL.style.transform = "translate3d(0," + yl.toFixed(2) + "vh,0) scaleY(" + sl.toFixed(3) + ")";
      blkU.style.transform = "translate3d(0," + (yu - 96 * su).toFixed(2) + "vh,0)";
      blkL.style.transform = "translate3d(0," + (yl + 96 * sl).toFixed(2) + "vh,0)";
      vigEl.style.opacity = (1 - 0.9 * smooth((o - 0.25) / 0.75)).toFixed(2);
      eyeEl.style.background = o < 0.012 ? "#030202" : "";
    }
    const bl = Math.round(ey.blur * 2) / 2, br = Math.round(ey.bright * 20) / 20;
    const f = bl <= 0 && br === 1 ? "" : "blur(" + bl + "px) brightness(" + br + ")";
    if (f !== ey.shownF) { ey.shownF = f; canvas.style.filter = f; }
  }
  function eyeStart(mode, o) {
    ey.on = true; ey.mode = mode; ey.t = 0;
    ey.dur = (o && o.duration) || (mode === 1 ? 7.5 : 5);
    ey.sway = o && o.sway !== undefined ? o.sway : 1;
    ey.cb = (o && o.onDone) || null;
    if (o && o.tint) setLidTint(o.tint); else if (mode === 1) setLidTint("day");
    if (mode === 1) { const n = o && o.blinks !== undefined ? clamp(o.blinks | 0, 1, 4) : 3; ey.keys = KEYS_OPEN[n === 1 ? 0 : n - 1]; }
    else ey.keys = KEYS_CLOSE;
    eyeEl.classList.add("on");
    ey.shownO = -1;
    stepEye(0);
  }
  function stepEye(dt) {
    ey.t += dt;
    const p = sat(ey.t / ey.dur);
    ey.o = evalKeys(ey.keys, p);
    const dark = ey.tint !== "day";
    if (ey.mode === 1) {
      const q = 1 - p;
      // focus pulls in with every blink: a little extra blur right after the lid lifts
      ey.blur = 15 * q * Math.sqrt(q) + 2.2 * q * (1 - ey.o);
      ey.bright = dark ? 0.4 + 0.6 * smooth(p * 1.3) : 1 + 0.85 * q * q;
      const lift = smooth(p * 1.15);
      ey.pitch = -0.36 * (1 - lift) * ey.sway;
      ey.roll = (0.085 * Math.sin(ey.t * 1.25) * (1 - 0.75 * p) + 0.05 * (1 - lift)) * ey.sway;
      ey.yaw = 0.06 * Math.sin(ey.t * 0.7 + 1) * (1 - 0.6 * p) * ey.sway;
    } else {
      ey.blur = 9 * p * p;
      ey.bright = 1 - 0.45 * p;
      const droop = smooth(p);
      ey.pitch = (-0.3 * droop + 0.04 * Math.sin(ey.t * 1.9) * (1 - p)) * ey.sway;
      ey.roll = 0.06 * Math.sin(ey.t * 0.9) * p * ey.sway;
      ey.yaw = 0;
    }
    paintEye();
    if (p >= 1) {
      const cb = ey.cb;
      ey.cb = null;
      if (ey.mode === 1) eyeClear(); else { ey.mode = 0; ey.pitch = -0.3 * ey.sway; ey.roll = 0; }
      if (cb) cb();
    }
  }
  function eyeClear() {
    ey.on = false; ey.mode = 0; ey.cb = null;
    ey.o = 1; ey.blur = 0; ey.bright = 1; ey.pitch = ey.roll = ey.yaw = 0;
    eyeEl.classList.remove("on");
    if (ey.shownF !== "") { ey.shownF = ""; canvas.style.filter = ""; }
  }
  const eye = {
    // o: { duration: 7.5, blinks: 1..4 (3), tint: "day" | "night" | "alarm", sway: 0..1.5 (1), onDone }
    // Starts fully closed; the lids flutter, close again, and finally open while the blur and exposure settle.
    // Head sway is added to the camera only while cinema owns the camera (give it a first-person shot first).
    open(o) { eyeStart(1, o); },
    // falling asleep: slow heavy blinks, ends fully closed and STAYS closed until clear() / open()
    close(o) { eyeStart(2, o); },
    // closed right now (use while the screen is black, then fade("clear") shows the inside of the lid)
    shut(tintName2) { if (tintName2) setLidTint(tintName2); ey.on = true; ey.mode = 0; ey.o = 0; ey.blur = 0; ey.bright = 1; eyeEl.classList.add("on"); ey.shownO = -1; paintEye(); },
    // hold the lids at a fixed openness 0..1 (a squint, a peek); blurPx / brightness optional
    set(o, blurPx, brightness) { ey.on = true; ey.mode = 0; ey.o = o; ey.blur = blurPx || 0; ey.bright = brightness === undefined ? 1 : brightness; eyeEl.classList.add("on"); paintEye(); },
    clear: eyeClear,
    get active() { return ey.on; },
    get openness() { return ey.on ? ey.o : 1; },
  };

  // ---------------- camera shots ----------------
  const sh = {
    on: false, t: 0, dur: 0, ease: EASE.inOut, hasTo: false,
    p0: new THREE.Vector3(), p1: new THREE.Vector3(), l0: new THREE.Vector3(), l1: new THREE.Vector3(),
    f0: 50, f1: 50, track: null, trackYaw: false, lookObj: null, lookObj1: null, lookY: 0, hand: 0, roll: 0,
  };
  const vP = new THREE.Vector3(), vL = new THREE.Vector3(), vT = new THREE.Vector3(), vQ = new THREE.Vector3();
  let hasCam = false, clock = 0, shakeAmp = 0, shakeT = 0, shakeDur = 1;
  function rd(v, out) {
    if (!v) return false;
    if (Array.isArray(v)) out.set(v[0], v[1], v[2]); else out.set(v.x, v.y, v.z);
    return true;
  }
  function takeCam() { if (!hasCam) { hasCam = true; rig.take(); } }
  // spec: {
  //   pos: [x,y,z] | Vector3,            camera position (omit = start from where the camera is now)
  //   look: [x,y,z] | Vector3 | Object3D, look-at point, or an object to keep looking at (lookY = height offset)
  //   fov: degrees,                       omit = keep
  //   to: { pos, look, fov },             optional end pose: the shot moves from the start pose to this over `dur`
  //   dur: seconds (0 = a cut that holds), ease: "inOut" | "in" | "out" | "linear"
  //   track: Object3D, trackYaw: bool     pos / look arrays become OFFSETS from this object (rotated by its yaw if trackYaw)
  //   hand: 0..1                          hand-held drift,  roll: radians (dutch angle)
  // }
  function shot(spec) {
    takeCam();
    sh.on = true; sh.t = 0;
    sh.dur = spec.dur || 0;
    sh.ease = EASE[spec.ease] || EASE.inOut;
    sh.track = spec.track || null;
    sh.trackYaw = !!spec.trackYaw;
    sh.hand = spec.hand || 0;
    sh.roll = spec.roll || 0;
    sh.lookY = spec.lookY || 0;
    sh.lookObj = spec.look && spec.look.isObject3D ? spec.look : null;
    if (!rd(spec.pos, sh.p0)) {
      sh.p0.copy(camera.position);
      if (sh.track) sh.p0.sub(sh.track.getWorldPosition(vT));
    }
    if (!sh.lookObj && !rd(spec.look, sh.l0)) {
      camera.getWorldDirection(sh.l0).multiplyScalar(6).add(camera.position);
      if (sh.track) sh.l0.sub(sh.track.getWorldPosition(vT));
    }
    sh.f0 = spec.fov || camera.fov;
    const to = spec.to;
    sh.hasTo = !!to;
    sh.lookObj1 = null;
    if (to) {
      if (!rd(to.pos, sh.p1)) sh.p1.copy(sh.p0);
      if (to.look && to.look.isObject3D) sh.lookObj1 = to.look;
      else if (!rd(to.look, sh.l1)) sh.l1.copy(sh.l0);
      sh.f1 = to.fov || sh.f0;
    }
    applyShot(0);
  }
  function offs(v) {
    if (!sh.track) return;
    sh.track.getWorldPosition(vT);
    if (sh.trackYaw) {
      const y = sh.track.rotation.y, s = Math.sin(y), c = Math.cos(y);
      const x = v.x * c + v.z * s, z = -v.x * s + v.z * c;
      v.x = x; v.z = z;
    }
    v.add(vT);
  }
  function applyShot(dt) {
    sh.t += dt;
    const k = sh.hasTo && sh.dur > 0 ? sh.ease(sat(sh.t / sh.dur)) : 0;
    vP.copy(sh.p0);
    if (sh.hasTo) vP.lerp(sh.p1, k);
    offs(vP);
    if (sh.lookObj) { sh.lookObj.getWorldPosition(vL); vL.y += sh.lookY; }
    else { vL.copy(sh.l0); offs(vL); }
    if (sh.hasTo) {
      if (sh.lookObj1) { sh.lookObj1.getWorldPosition(vQ); vQ.y += sh.lookY; vL.lerp(vQ, k); }
      else if (!sh.lookObj) { vQ.copy(sh.l1); offs(vQ); vL.lerp(vQ, k); }
    }
    if (sh.hand > 0) {
      const h = sh.hand * 0.035;
      vP.x += Math.sin(clock * 0.9) * h + Math.sin(clock * 2.3 + 1) * h * 0.4;
      vP.y += Math.sin(clock * 1.3 + 2) * h * 0.8;
      vL.x += Math.sin(clock * 0.7 + 4) * h * 1.6;
      vL.y += Math.sin(clock * 1.1 + 5) * h * 1.2;
    }
    camera.position.copy(vP);
    camera.lookAt(vL);
    const fov = sh.hasTo ? sh.f0 + (sh.f1 - sh.f0) * k : sh.f0;
    if (Math.abs(fov - camera.fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
    if (sh.roll) camera.rotateZ(sh.roll);
  }
  function releaseCamera(blend) {
    sh.on = false;
    if (hasCam) { hasCam = false; rig.release(blend === undefined ? 0.8 : blend); }
  }
  function shake(amp, seconds) { shakeAmp = amp; shakeT = shakeDur = seconds || 0.4; }

  // ---------------- sequences ----------------
  const seq = { on: false, steps: null, i: 0, wait: 0, until: null, o: null, blocked: false };
  let skipOn = false, skipHold = 0, skipBusy = false, skipShown = -1;
  // steps: array, run in order. Each is a function (called), a number (wait seconds) or ONE of:
  //   { shot: spec }                     blocks for spec.dur (add hold: false to let the next step start at once)
  //   { wait: s }   { call: fn }   { until: () => bool, max: s }
  //   { caption: text, dur: s, who, narr }   blocks for dur unless hold: false
  //   { fade: "black" | "white" | "clear", dur: s }   blocks
  //   { bars: bool }   { time: scale, ramp: s }   { tint: name, opacity }   { shake: amp, dur: s }
  //   { eye: "open" | "close", ...eye options }   blocks for its duration
  //   { card: { kicker, title, hold } }   blocks
  // o: { skippable: true, onSkip(), onDone(), bars: true, release: 0.8 (camera blend back; null = keep the camera) }
  // onSkip (if skipped) runs behind a quick black fade and must put the world in its after-cutscene state;
  // onDone ALWAYS runs exactly once (after onSkip when skipped).
  function play(steps, o) {
    o = o || {};
    seq.on = true; seq.steps = steps; seq.i = 0; seq.wait = 0; seq.until = null; seq.o = o; seq.blocked = false;
    skipOn = o.skippable !== false; skipHold = 0; skipBusy = false;
    skipLab.textContent = document.body.classList.contains("touch") ? "hold to skip" : "hold Enter to skip";
    skipEl.classList.toggle("on", skipOn);
    takeCam();
    if (o.bars !== false) letterbox(true);
    document.body.classList.add("cine");
    if (onPlaying) onPlaying(true);
    runSteps();
  }
  function unblock(g) { return () => { if (g === gen && seq.on) { seq.blocked = false; } }; }
  function runSteps() {
    while (seq.on && seq.wait <= 0 && !seq.until && !seq.blocked) {
      if (seq.i >= seq.steps.length) { finish(false); return; }
      const s = seq.steps[seq.i++];
      if (typeof s === "function") { s(); continue; }
      if (typeof s === "number") { seq.wait = s; continue; }
      if (s.eye) { seq.blocked = true; const u = unblock(gen), done = s.onDone; s.onDone = () => { if (done) done(); u(); }; if (s.eye === "open") eye.open(s); else eye.close(s); s.onDone = done; }
      else if (s.shot) { shot(s.shot); if (s.shot.hold !== false && s.hold !== false) seq.wait = s.shot.dur || 0; }
      else if (s.wait !== undefined) seq.wait = s.wait;
      else if (s.call) s.call();
      else if (s.until) { seq.until = s.until; seq.wait = 0; seq.untilMax = s.max || 30; }
      else if (s.caption !== undefined) { caption(s.caption, s.dur, s); if (s.hold !== false) seq.wait = s.dur || 2 + String(s.caption).length * 0.06; }
      else if (s.fade) { seq.blocked = true; fade(s.fade, s.dur === undefined ? 0.8 : s.dur, unblock(gen)); }
      else if (s.bars !== undefined) letterbox(s.bars);
      else if (s.time !== undefined) setTimeScale(s.time, s.ramp || 0);
      else if (s.tint !== undefined) tint(s.tint, s.opacity);
      else if (s.shake !== undefined) shake(s.shake, s.dur);
      else if (s.card) { seq.blocked = true; titleCard(s.card, unblock(gen)); }
      else if (s.day) { seq.blocked = true; dayCard(s.day, s, unblock(gen)); }
    }
  }
  function finish(skipped) {
    const o = seq.o;
    seq.on = false; seq.steps = null; seq.until = null; seq.blocked = false;
    skipEl.classList.remove("on");
    skipOn = false;
    if (o.bars !== false) letterbox(false);
    document.body.classList.remove("cine");
    if (o.release !== null) releaseCamera(skipped ? 0 : o.release);
    if (onPlaying) onPlaying(false);
    if (o.onDone) o.onDone(skipped);
  }
  function doSkip() {
    if (!seq.on || skipBusy) return;
    skipBusy = true;
    skipEl.classList.remove("on");
    const g = gen;
    fade("black", 0.25, () => {
      if (g !== gen || !seq.on) return;
      const o = seq.o;
      gen++; // drop every pending timer / blocked step of the cutscene
      timers.length = 0;
      const g2 = gen;
      caption(null);
      eyeClear();
      cardTo = 0; cardRate = 9;
      setTimeScale(1, 0);
      shakeT = 0;
      if (o.onSkip) o.onSkip();
      finish(true);
      skipBusy = false;
      after(0.15, () => { if (g2 === gen) fade("clear", 0.45); });
    });
  }
  // engine: call when the skip control is pressed in one go (debug / tests)
  function skip() { doSkip(); }

  // ---------------- per frame (real dt) ----------------
  function update(dt, skipHeld) {
    clock += dt;
    for (let i = 0; i < timers.length; i++) {
      const e = timers[i];
      e.t -= dt;
      if (e.t <= 0) { timers.splice(i, 1); i--; if (e.gen === gen) e.fn(); }
    }
    if (fd.cur !== fd.to || fd.cb) {
      fd.t += dt;
      const k = fd.dur > 0 ? sat(fd.t / fd.dur) : 1;
      fd.cur = fd.from + (fd.to - fd.from) * smooth(k);
      paintFade();
      if (k >= 1) { fd.cur = fd.to; const f = fd.cb; fd.cb = null; if (f) f(); }
    }
    if (lb.cur !== lb.to) {
      lb.cur += clamp(lb.to - lb.cur, -dt / 0.7, dt / 0.7);
      const q = Math.round((1 - smooth(lb.cur)) * 101);
      if (q !== lb.shown) { lb.shown = q; barT.style.transform = "translateY(-" + q + "%)"; barB.style.transform = "translateY(" + q + "%)"; }
    }
    if (cardOp !== cardTo) {
      cardOp += clamp(cardTo - cardOp, -dt * cardRate, dt * cardRate);
      const q = Math.round(cardOp * 50) / 50;
      if (q !== cardShown) { cardShown = q; cardEl.style.opacity = q; }
    }
    if (capT > 0) { capT -= dt; if (capT <= 0) capEl.classList.remove("on"); }
    if (ey.on && ey.mode !== 0) stepEye(dt);

    if (seq.on) {
      if (skipOn && !skipBusy) {
        skipHold = skipHeld ? skipHold + dt : Math.max(0, skipHold - dt * 2.5);
        const q = Math.round(sat(skipHold / 0.9) * 30) / 30;
        if (q !== skipShown) { skipShown = q; skipRing.style.setProperty("--p", q); }
        if (skipHold >= 0.9) doSkip();
      }
      if (seq.on && !skipBusy) {
        if (seq.wait > 0) seq.wait -= dt;
        if (seq.until) { seq.untilMax -= dt; if (seq.untilMax <= 0 || seq.until()) seq.until = null; }
        runSteps();
      }
    }

    if (hasCam) {
      if (sh.on) applyShot(dt);
      if (ey.on) {
        if (ey.pitch) camera.rotateX(ey.pitch);
        if (ey.yaw) camera.rotateY(ey.yaw);
        if (ey.roll) camera.rotateZ(ey.roll);
      }
      if (shakeT > 0) {
        shakeT -= dt;
        const a = shakeAmp * sat(shakeT / shakeDur);
        camera.position.x += Math.sin(clock * 71) * a;
        camera.position.y += Math.sin(clock * 83 + 1) * a;
        camera.rotateZ(Math.sin(clock * 67 + 2) * a * 0.25);
      }
    }
  }

  // back to nothing: every overlay off, camera released, sequence dropped. Used when leaving a level.
  function reset() {
    gen++;
    timers.length = 0;
    const was = seq.on;
    seq.on = false; seq.steps = null; seq.until = null; seq.blocked = false;
    skipEl.classList.remove("on"); skipOn = false; skipBusy = false;
    lb.to = 0; lb.cur = 0; lb.shown = -1; barT.style.transform = ""; barB.style.transform = "";
    caption(null);
    cardTo = cardOp = 0; cardShown = 0; cardEl.style.opacity = 0;
    eyeClear();
    tint(null);
    fd.cb = null; fd.cur = fd.to = fd.from = 0; paintFade();
    shakeT = 0;
    document.body.classList.remove("cine");
    releaseCamera(0);
    setTimeScale(1, 0);
    if (was && onPlaying) onPlaying(false);
  }

  return {
    update, reset, after,
    fade, letterbox, tint, titleCard, endCard, dayCard, caption,
    eye, shot, releaseCamera, shake, play, skip,
    slowMo(scale, ramp) { setTimeScale(scale, ramp || 0); },
    get playing() { return seq.on; },
    get hasCamera() { return hasCam; },
    get faded() { return fd.cur; },
    get skipEl() { return skipEl; },
  };
}
