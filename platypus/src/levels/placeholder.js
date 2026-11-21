// placeholder.js - a stand-in story level: title card, an empty lit ground, and it completes on Interact.
// It exists so the unlock chain (main screen -> 2 -> 3 -> 4 -> 5) can be played before the real levels
// land, and it doubles as a small, working example of the level interface in LEVELS.md.
// The real level files replace their createLevel() and stop importing this.

export function createPlaceholderLevel(ctx, o) {
  const { THREE, player, platypus, ui, cinema, audio } = ctx;
  const root = new THREE.Group();
  root.name = "placeholder" + o.n;
  let world = null;
  let step = "boot";
  const eyePos = new THREE.Vector3(), eyeLook = new THREE.Vector3();

  function build() {
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(40, 48).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: o.ground, roughness: 0.95, metalness: 0 }),
    );
    ground.receiveShadow = true;
    // a few stones so movement reads against something
    const rockGeo = new THREE.DodecahedronGeometry(0.5, 1);
    const rockMat = new THREE.MeshStandardMaterial({ color: o.rock, roughness: 0.9, flatShading: true });
    const rocks = new THREE.InstancedMesh(rockGeo, rockMat, 14);
    rocks.castShadow = rocks.receiveShadow = true;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
    for (let i = 0; i < 14; i++) {
      const a = i * 2.39996, r = 3.2 + (i % 5) * 1.6;
      const k = 0.5 + ((i * 7) % 5) * 0.28;
      e.set(i * 1.3, i * 2.1, i * 0.7);
      m.compose(p.set(Math.sin(a) * r, k * 0.22, Math.cos(a) * r), q.setFromEuler(e), s.set(k, k * 0.7, k));
      rocks.setMatrixAt(i, m);
    }
    root.add(ground, rocks);
    world = {
      name: "placeholder" + o.n,
      group: root,
      env: o.env,
      heightAt() { return 0; },
      onFootstep(wx, wz, strength, i, wet, pan) { audio.cushionStep(strength * 0.5, pan); },
      onLand(x, z, h, impact) { audio.cushionLand(impact * 0.6); },
    };
  }

  function enter() {
    step = "intro";
    ctx.setWorld(world);
    player.teleport(0, 0, 0);
  }

  function play() {
    step = "play";
    ui.showHud(true);
    ui.setObjective("Placeholder level " + o.n + " - finish it", ctx.touch ? "tap Finish" : "press E");
    ui.setAction("Finish level");
    player.enabled = true;
  }

  function start() {
    cinema.titleCard({ kicker: "LEVEL " + o.n, title: o.title }, () => {
      if (!o.wake) { cinema.fade("clear", 1.4); play(); return; }
      // first-person wake-up: one eye opens, then a short letterboxed look around
      platypus.billTip.getWorldPosition(eyePos);
      eyePos.y += 0.12;
      eyeLook.set(eyePos.x + 0.6, eyePos.y + 0.25, eyePos.z + 4);
      player.hidden = true;
      cinema.eye.shut(o.wake);
      if (o.wake === "alarm") cinema.tint("alarm", 0.8);
      cinema.play([
        { shot: { pos: eyePos, look: eyeLook, fov: 62, dur: 0 } },
        { fade: "clear", dur: 0.6 },
        { eye: "open", duration: 6.5, tint: o.wake, blinks: 3 },
        () => { player.hidden = false; cinema.tint(null); },
        { shot: { pos: [2.6, 1.1, 3.2], look: platypus.group, lookY: 0.25, fov: 40, to: { pos: [-2.2, 0.8, 3.0] }, dur: 4.5, ease: "inOut" }, hold: false },
        { caption: "A placeholder for level " + o.n + ".", dur: 2.2, narr: true },
        { caption: "The real story goes here.", dur: 2.2, narr: true },
      ], {
        skippable: true,
        onSkip() { player.hidden = false; cinema.tint(null); },
        onDone: play,
      });
    });
  }

  function win() {
    if (step === "done") return;
    step = "done";
    player.enabled = false;
    ui.setAction(null);
    ui.setObjective(null);
    platypus.celebrate();
    audio.victory();
    const go = () => ctx.complete();
    if (o.endCard) cinema.endCard(o.endCard, { hold: 2.5 }, go);
    else ui.showComplete({ kicker: "LEVEL " + o.n, title: "COMPLETE", sub: "", button: "Continue" }, go);
  }

  return {
    build, enter, start,
    update() {},
    exit() { step = "boot"; },
    onAction(name) { if (name === "interact" && step === "play") win(); return false; },
    state() { return { step }; },
    skipTo(name) { if (name === "play" && step === "intro") { cinema.skip(); return true; } return false; },
    win,
    STEPS: ["intro", "play", "done"],
  };
}
