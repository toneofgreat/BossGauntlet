// hud.js - HUD pieces for levels 6-11, added onto the object made by ui.js (ENGINE file, see LEVELS2.md A7).
// Health bar, ammo / potion chips, army counter, checkpoint toast, boss bar with phases, stealth "seen"
// meter, flight instruments, charge bar, direction ping, visor + target markers, and the extra round
// ability buttons (potion, scream, fire, down). The CSS lives in index.html ("story HUD 2").
// Every setter caches what it last wrote: calling one each frame with an unchanged value touches no DOM.

const SVG = {
  potion: '<svg class="ic" viewBox="0 0 32 32"><path d="M13 4h6v2l-1 1v5.200l6.200 10.600A3.500 3.500 0 0 1 21.200 28H10.800a3.500 3.500 0 0 1-3-5.200L14 12.200V7l-1-1V4z" fill="#fff" stroke="rgba(20,70,40,.4)" stroke-width="1" stroke-linejoin="round"/><path d="M10.600 21h10.800l1.500 2.600a1.600 1.600 0 0 1-1.400 2.400H10.500a1.600 1.600 0 0 1-1.400-2.400L10.600 21z" fill="rgba(60,200,120,.9)"/></svg>',
  scream: '<svg class="ic" viewBox="0 0 32 32"><path d="M5 13h5l7-6v18l-7-6H5v-6z" fill="#fff" stroke="rgba(90,20,90,.35)" stroke-width="1" stroke-linejoin="round"/><path d="M21 11c1.800 1.300 2.800 3 2.800 5s-1 3.700-2.800 5M24.500 7.500C27.300 9.600 29 12.600 29 16s-1.700 6.400-4.500 8.500" fill="none" stroke="#fff" stroke-width="2.200" stroke-linecap="round"/></svg>',
  fire: '<svg class="ic" viewBox="0 0 32 32"><circle cx="16" cy="16" r="8.500" fill="none" stroke="#fff" stroke-width="2.200"/><path d="M16 3v7M16 22v7M3 16h7M22 16h7" stroke="#fff" stroke-width="2.200" stroke-linecap="round"/><circle cx="16" cy="16" r="2" fill="#fff"/></svg>',
  down: '<svg class="ic" viewBox="0 0 32 32"><path d="M16 27 5 15h6.500V5h9v10H27L16 27z" fill="currentColor"/></svg>',
  eye: '<svg viewBox="0 0 32 20"><path d="M1.500 10C5 4 10 1.500 16 1.500S27 4 30.500 10C27 16 22 18.500 16 18.500S5 16 1.500 10z" fill="none" stroke="currentColor" stroke-width="2.200" stroke-linejoin="round"/><circle class="pupil" cx="16" cy="10" r="4.200" fill="currentColor"/></svg>',
  paw: '<svg class="ico" viewBox="0 0 24 24"><ellipse cx="12" cy="15.500" rx="5.200" ry="4.300"/><circle cx="5.600" cy="10" r="2.300"/><circle cx="9.700" cy="6.300" r="2.300"/><circle cx="14.300" cy="6.300" r="2.300"/><circle cx="18.400" cy="10" r="2.300"/></svg>',
  flask: '<svg class="ico" viewBox="0 0 24 24"><path d="M9.500 2.500h5v1.600l-.8.800v4l5 8.600A2.800 2.800 0 0 1 16.300 21.500H7.700a2.800 2.800 0 0 1-2.400-4l5-8.600v-4l-.8-.8V2.500z"/></svg>',
  bullet: '<svg class="ico" viewBox="0 0 24 24"><path d="M9 21V9.500C9 6 10.500 3.500 12 2c1.500 1.500 3 4 3 7.500V21H9z"/></svg>',
};

export function extendUI(ui) {
  const hud = document.getElementById("hud");
  const topleft = document.getElementById("topleft");
  const topmid = document.getElementById("topmid");
  const abilities = document.getElementById("abilities");
  const mk = (parent, tag, id, cls, html, before) => {
    const d = document.createElement(tag);
    if (id) d.id = id;
    if (cls) d.className = cls;
    if (html) d.innerHTML = html;
    parent.insertBefore(d, before || null);
    return d;
  };
  const restart = (node, cls) => { node.classList.remove(cls); void node.offsetWidth; node.classList.add(cls); };
  const q = (v, n) => Math.round(Math.max(0, Math.min(1, v)) * n) / n;
  const el = ui.el;

  // ---------- health bar (top-left, right under the hearts) ----------
  const health = mk(topleft, "div", "health", "meter", '<svg class="ico" viewBox="0 0 24 24"><path d="M12 21s-7.500-4.700-9.600-9.300C.9 8.200 2.800 4.500 6.500 4.500c2.200 0 3.900 1.100 5.500 3.200 1.600-2.100 3.300-3.200 5.500-3.200 3.700 0 5.600 3.700 4.100 7.200C19.500 16.300 12 21 12 21z"/></svg><div class="bar"><div class="fill"></div></div><span class="lab">Health</span>', el.coins);
  const healthFill = health.querySelector(".fill"), healthLab = health.querySelector(".lab");
  let healthLast = -1, healthLabel = "Health";
  // frac 0..1 (null hides). The bar flashes and the red vignette pulses when it drops.
  function setHealth(frac, label) {
    if (frac === null || frac === undefined) { if (healthLast !== -1 || health.classList.contains("on")) { health.classList.remove("on", "low"); healthLast = -1; flow(); } return; }
    const f = q(frac, 100);
    if (label !== undefined && label !== null && label !== healthLabel) { healthLabel = label; healthLab.textContent = label; }
    if (!health.classList.contains("on")) { health.classList.add("on"); flow(); }
    if (f === healthLast) return;
    if (f < healthLast) { restart(health, "hit"); hurtFlash(); }
    healthLast = f;
    healthFill.style.transform = "scaleX(" + f + ")";
    health.classList.toggle("low", f <= 0.3);
  }
  let hurtT = 0;
  function hurtFlash() { el.hurt.classList.add("on"); hurtT = 0.12; }

  // ---------- counters: potions, ammo, army ----------
  function chip(id, icon) {
    const c = mk(topleft, "div", id, "chip chip2", icon + '<span class="v">0</span><span class="mx"></span>', document.getElementById("friend"));
    const v = c.querySelector(".v"), mx = c.querySelector(".mx");
    let last = null, lastMax = null;
    return (n, max) => {
      if (n === null || n === undefined) { if (c.classList.contains("on")) { c.classList.remove("on", "empty"); flow(); } last = null; return; }
      if (!c.classList.contains("on")) { c.classList.add("on"); flow(); }
      const m = max === undefined || max === null ? "" : "/" + max;
      if (m !== lastMax) { lastMax = m; mx.textContent = m; }
      const t = n === Infinity ? "∞" : String(n | 0);
      if (t === last) return;
      const pop = last !== null;
      last = t;
      v.textContent = t;
      c.classList.toggle("empty", n <= 0);
      if (pop) restart(c, "pop");
    };
  }
  const setPotions = chip("potions", SVG.flask);
  const setBullets = chip("ammo", SVG.bullet);
  // kind: "potion" | "ammo"; n null hides; n may be Infinity; max optional ("3/5")
  function setAmmo(kind, n, max) { (kind === "potion" ? setPotions : setBullets)(n, max); }

  const army = mk(topleft, "div", "army", "chip chip2", SVG.paw + '<span class="v">0</span><span class="lab">Army</span>', document.getElementById("friend"));
  const armyV = army.querySelector(".v"), armyLab = army.querySelector(".lab");
  let armyLast = null, armyLabel = "Army";
  // n null hides. Pops green when it grows, shakes red when it shrinks.
  function setArmy(n, label) {
    if (n === null || n === undefined) { if (army.classList.contains("on")) { army.classList.remove("on"); flow(); } armyLast = null; return; }
    if (label !== undefined && label !== null && label !== armyLabel) { armyLabel = label; armyLab.textContent = label; }
    if (!army.classList.contains("on")) { army.classList.add("on"); flow(); }
    n |= 0;
    if (n === armyLast) return;
    if (armyLast !== null) restart(army, n > armyLast ? "pop" : "lose");
    armyLast = n;
    armyV.textContent = n;
  }

  // body.hud2 = the health bar or a counter is showing (phones re-flow the top of the HUD, see index.html)
  let hud2 = false;
  function flow() {
    const on = health.classList.contains("on") || army.classList.contains("on") || !!document.querySelector("#potions.on, #ammo.on");
    if (on !== hud2) { hud2 = on; document.body.classList.toggle("hud2", on); }
  }

  // ---------- checkpoint toast ----------
  const cp = mk(hud, "div", "cpToast", "", '<i></i><span></span>');
  const cpTxt = cp.lastChild;
  let cpT = 0;
  function checkpoint(label, secs) {
    cpTxt.textContent = label || "Checkpoint";
    restart(cp, "on");
    cpT = secs || 2.2;
  }

  // ---------- boss bar ----------
  const bossEl = mk(topmid, "div", "boss", "", '<div class="name"></div><div class="bar"><div class="lag"></div><div class="fill"></div><div class="ticks"></div></div><div class="pips"></div>');
  const bossName = bossEl.querySelector(".name"), bossFill = bossEl.querySelector(".fill"), bossLag = bossEl.querySelector(".lag"),
    bossTicks = bossEl.querySelector(".ticks"), bossPips = bossEl.querySelector(".pips");
  let bossFrac = -1, bossPhases = 0, bossPhase = -1;
  const boss = {
    // name: text over the bar; phases: how many phases (tick marks split the bar evenly, one pip per phase)
    show(name, phases) {
      bossName.textContent = name || "";
      phases = Math.max(1, phases | 0 || 1);
      if (phases !== bossPhases) {
        bossPhases = phases;
        let t = "", p = "";
        for (let i = 1; i < phases; i++) t += '<i style="left:' + ((i / phases) * 100).toFixed(2) + '%"></i>';
        for (let i = 0; i < phases; i++) p += "<i></i>";
        bossTicks.innerHTML = t;
        bossPips.innerHTML = p;
      }
      bossFrac = -1; bossPhase = -1;
      boss.set(1); boss.phase(0);
      bossEl.classList.add("on");
    },
    // frac of TOTAL health 0..1
    set(frac) {
      const f = q(frac, 400);
      if (f === bossFrac) return;
      if (f < bossFrac) restart(bossEl, "hit");
      bossFrac = f;
      bossFill.style.transform = bossLag.style.transform = "scaleX(" + f + ")";
    },
    // i = 0-based phase now running (earlier pips go dark, the bar changes colour, a flash)
    phase(i) {
      i |= 0;
      if (i === bossPhase) return;
      const first = bossPhase < 0;
      bossPhase = i;
      bossEl.dataset.phase = String(Math.min(3, i));
      const kids = bossPips.children;
      for (let k = 0; k < kids.length; k++) kids[k].className = k < i ? "gone" : k === i ? "cur" : "";
      if (!first) restart(bossEl, "phase");
    },
    hide() { bossEl.classList.remove("on", "hit", "phase"); },
    get on() { return bossEl.classList.contains("on"); },
  };

  // ---------- stealth "seen" meter ----------
  const seen = mk(topmid, "div", "seen", "", SVG.eye + '<div class="bar"><div class="fill"></div></div><span class="lab"></span>');
  const seenFill = seen.querySelector(".fill"), seenLab = seen.querySelector(".lab");
  let seenLast = -1, seenState = "";
  const SEEN_TXT = { hidden: "Hidden", suspicious: "Careful...", spotted: "SPOTTED!" };
  // frac 0..1 = how close the most alert watcher is to spotting you (null hides); state "hidden" | "suspicious" | "spotted"
  function setSeen(frac, state) {
    if (frac === null || frac === undefined) { seen.className = ""; seenLast = -1; seenState = ""; return; }
    const f = q(frac, 50);
    state = state || (f >= 1 ? "spotted" : f > 0.02 ? "suspicious" : "hidden");
    if (state !== seenState) { seenState = state; seen.className = "on " + state; seenLab.textContent = SEEN_TXT[state] || ""; }
    if (f !== seenLast) { seenLast = f; seenFill.style.transform = "scaleX(" + f + ")"; }
  }

  // ---------- flight instruments ----------
  const fl = mk(hud, "div", "flight", "", '<div class="alt"><div class="tape"><i class="gnd"></i><i class="mk"></i></div><div class="num"><b class="av">0</b><span>ALT m</span></div></div>' +
    '<div class="col"><div class="num"><b class="sv">0</b><span>SPEED</span></div><div class="vs"><i></i></div><div class="hull"><div class="fill"></div></div><span class="hl">HULL</span></div><div class="warn"></div>');
  const flAv = fl.querySelector(".av"), flSv = fl.querySelector(".sv"), flMk = fl.querySelector(".mk"), flVs = fl.querySelector(".vs i"),
    flHull = fl.querySelector(".hull .fill"), flWarn = fl.querySelector(".warn");
  const flLast = { alt: -1, spd: -1, mk: -1, vs: -99, hull: -1, warn: "" };
  const flight = {
    show(on) { fl.classList.toggle("on", !!on); if (!on) { flLast.warn = ""; flWarn.textContent = ""; fl.classList.remove("warning"); } },
    // alt: metres above the ground; speed m/s; vs: vertical speed m/s (+ up); hull 0..1; warn: short text or null ("PULL UP", "WIRES", "TOO FAST")
    // ceiling: the altitude at the top of the tape (default 40)
    set(alt, speed, vs, hull, warn, ceiling) {
      const a = Math.max(0, Math.round(alt)), s = Math.max(0, Math.round(speed));
      if (a !== flLast.alt) { flLast.alt = a; flAv.textContent = a; }
      if (s !== flLast.spd) { flLast.spd = s; flSv.textContent = s; }
      const m = q(alt / (ceiling || 40), 60);
      if (m !== flLast.mk) { flLast.mk = m; flMk.style.transform = "translate3d(0," + (-m * 96).toFixed(1) + "px,0)"; fl.classList.toggle("low", alt < 2.5); }
      const v = Math.round(Math.max(-1, Math.min(1, vs / 6)) * 12) / 12;
      if (v !== flLast.vs) { flLast.vs = v; flVs.style.transform = "translate3d(0," + (-v * 15).toFixed(1) + "px,0)"; }
      const h = q(hull === undefined ? 1 : hull, 50);
      if (h !== flLast.hull) { flLast.hull = h; flHull.style.transform = "scaleX(" + h + ")"; fl.classList.toggle("hurt", h <= 0.35); }
      warn = warn || "";
      if (warn !== flLast.warn) { flLast.warn = warn; flWarn.textContent = warn; fl.classList.toggle("warning", !!warn); }
    },
  };

  // ---------- charge bar (scream) ----------
  const charge = mk(hud, "div", "charge", "", '<span class="lab"></span><div class="bar"><div class="fill"></div><i class="min"></i></div>');
  const chargeFill = charge.querySelector(".fill"), chargeLab = charge.querySelector(".lab"), chargeMin = charge.querySelector(".min");
  let chargeLast = -1, chargeLabel = null, chargeMinLast = -1;
  // frac 0..1 (null hides); min = the fraction from which a release counts (a tick on the bar)
  function setCharge(frac, label, min) {
    if (frac === null || frac === undefined) { if (chargeLast !== -1) { charge.className = ""; chargeLast = -1; } return; }
    const f = q(frac, 60);
    if (label !== undefined && label !== chargeLabel) { chargeLabel = label; chargeLab.textContent = label || ""; }
    if (min !== undefined && min !== chargeMinLast) { chargeMinLast = min; chargeMin.style.left = (min * 100).toFixed(1) + "%"; }
    if (f === chargeLast) return;
    chargeLast = f;
    chargeFill.style.transform = "scaleX(" + f + ")";
    charge.className = "on" + (f >= 1 ? " full" : f >= (chargeMinLast > 0 ? chargeMinLast : 0) ? " ok" : "");
  }

  // ---------- direction ping (sound tracking, "shot from over there") ----------
  const ping = mk(hud, "div", "ping", "", "<i></i>");
  let pingA = 1e9, pingS = -1, pingKind = "";
  // angle: radians, 0 = straight ahead of the CAMERA, + = to the right, PI = behind (null hides);
  // strength 0..1 (opacity / size); kind "sound" (soft teal, default) | "danger" (red)
  function setPing(angle, strength, kind) {
    if (angle === null || angle === undefined) { if (pingS !== -1) { ping.className = ""; pingS = -1; pingA = 1e9; } return; }
    const a = Math.round(angle * 40) / 40, s = q(strength === undefined ? 1 : strength, 20);
    kind = kind || "sound";
    if (kind !== pingKind || pingS === -1) { pingKind = kind; ping.className = "on " + kind; }
    if (a !== pingA) { pingA = a; ping.style.transform = "rotate(" + a.toFixed(3) + "rad)"; }
    if (s !== pingS) { pingS = s; ping.style.opacity = (0.15 + 0.85 * s).toFixed(2); }
  }

  // ---------- visor (the glasses) + target markers ----------
  const visor = mk(hud, "div", "visor", "", '<i class="tl"></i><i class="tr"></i><i class="bl"></i><i class="br"></i><span class="vt">TACTICAL</span>');
  const MK = [];
  for (let i = 0; i < 12; i++) MK.push({ d: mk(visor, "div", "", "tm"), on: false, x: -1, y: -1, kind: "" });
  let visorOn = false;
  function setVisor(on) {
    on = !!on;
    if (on === visorOn) return;
    visorOn = on;
    visor.classList.toggle("on", on);
    document.body.classList.toggle("visor", on);
    if (!on) for (const m of MK) if (m.on) { m.on = false; m.d.className = "tm"; }
  }
  // marker i (0..11) at a screen point from ctx.project; kind "foe" | "ally" | "goal" | "loot"; null / false hides it.
  // Markers only show while the visor is on.
  function mark(i, sx, sy, kind) {
    const m = MK[i];
    if (!m) return;
    if (!kind) { if (m.on) { m.on = false; m.d.className = "tm"; } return; }
    if (!m.on || kind !== m.kind) { m.on = true; m.kind = kind; m.d.className = "tm on " + kind; }
    const x = Math.round(sx), y = Math.round(sy);
    if (x !== m.x || y !== m.y) { m.x = x; m.y = y; m.d.style.transform = "translate3d(" + x + "px," + y + "px,0)"; }
  }

  // ---------- extra round buttons ----------
  function abil(id, cls, lab, key, svg) {
    return mk(abilities, "button", id, "abil abil2 " + cls, '<span class="lab">' + lab + '</span><i class="cd"></i>' + svg + '<span class="key">' + key + "</span>", el.btnJump);
  }
  el.btnDown = abil("btnDown", "", "Down", "Shift", SVG.down);
  el.btnPotion = abil("btnPotion", "", "Potion", "Q", SVG.potion);
  el.btnScream = abil("btnScream", "", "Scream", "R", SVG.scream);
  el.btnFire = abil("btnFire", "", "Fire", "F", SVG.fire);
  const EXTRA = { potion: el.btnPotion, scream: el.btnScream, fire: el.btnFire, down: el.btnDown };
  const cdLast = { potion: -1, scream: -1, fire: -1 };
  const baseAbilities = ui.setAbilities, baseCooldown = ui.setCooldown;
  // adds { potion, scream, fire, down } to the flags of ui.js (missing = hidden). `down` may be a string: the button's label
  // ("Sneak" on foot; the default "Down" is the helicopter's descend).
  const downLab = el.btnDown.querySelector(".lab");
  let downText = "Down";
  function setAbilities(a) {
    baseAbilities(a);
    a = a || {};
    for (const k in EXTRA) EXTRA[k].classList.toggle("show", !!a[k]);
    const t = typeof a.down === "string" ? a.down : "Down";
    if (t !== downText) { downText = t; downLab.textContent = t; }
  }
  function setCooldown(which, frac) {
    if (!(which in cdLast)) { baseCooldown(which, frac); return; }
    const v = q(frac, 40);
    if (cdLast[which] === v) return;
    cdLast[which] = v;
    EXTRA[which].style.setProperty("--cd", v);
  }
  // glow on a round button: "potion" | "scream" | "fire" (aiming / charging / firing)
  function setArmed(which, on) { if (EXTRA[which]) EXTRA[which].classList.toggle("armed", !!on); }

  // ---------- reset + per-frame ----------
  const baseReset = ui.resetHud, baseUpdate = ui.update;
  function resetHud() {
    baseReset();
    setHealth(null); setAmmo("potion", null); setAmmo("ammo", null); setArmy(null);
    cp.classList.remove("on"); cpT = 0;
    boss.hide(); setSeen(null); flight.show(false); setCharge(null); setPing(null); setVisor(false);
    for (const k in EXTRA) { EXTRA[k].classList.remove("show", "armed", "down"); }
    setCooldown("potion", 0); setCooldown("scream", 0); setCooldown("fire", 0);
    hurtT = 0;
  }
  function update(dt) {
    baseUpdate(dt);
    if (cpT > 0) { cpT -= dt; if (cpT <= 0) cp.classList.remove("on"); }
    if (hurtT > 0) { hurtT -= dt; if (hurtT <= 0) el.hurt.classList.remove("on"); }
  }

  Object.assign(ui, {
    setHealth, hurtFlash, setAmmo, setArmy, checkpoint, boss, setSeen, flight, setCharge, setPing, setVisor, mark,
    setAbilities, setCooldown, setArmed, resetHud, update,
  });
  return ui;
}
