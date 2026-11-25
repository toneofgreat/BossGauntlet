// ui/menu.js - title screen (attract mode: the cube plays Area 1 by itself behind the menu), area select with locks,
// AI difficulty badges, best times and world records, the settings sheet and the one-time name form. INTEGRATE owns.
import { AREAS, loadArea } from "../levels/index.js";
import { createSim, STEP_MS, PW, PH } from "../sim/index.js";
import { createCamera } from "../render/camera.js";
import { badge, ensureCss, esc, drawMinimap, makeThumbCanvas } from "../builder/common.js";
import { RATINGS } from "./ratings.js";
import { ATTRACT_ROUTE, decodeRoute } from "./attract.js";
import { fmt } from "../game.js";
import { bonusCardHtml, bonusSummary, bonusUnlocked, paintBonusPreview, BONUS_NAME } from "./bonuscard.js";

// start the bonus level (Wildwood Homestead): continue the saved world, or a fresh one with fresh = true
export function playBonus(app, fresh = false) {
  app.show("bonus", { fresh: !!fresh, onExit: () => app.show("areas") });
}

export const MENU_SONG = "campfire";
const AREA_TAG = {
  area1: "Sunny morning woods. Learn to run, hop and bounce.",
  area2: "Golden-hour cliffs, rapids, geysers and wasps.",
  area3: "Night storm on the peaks. Lightning, ice and thorns.",
};
export const areaRating = (id) => (RATINGS[id] && RATINGS[id].difficulty) || 0;

function panel(html, cls = "overlay") { const d = document.createElement("div"); d.className = cls; d.innerHTML = html; return d; }

// ------------------------------------------------------------------------------------------------ living backdrop
// The AI's winning Area 1 route replayed in a real sim; the camera keeps the cube off to one side of the menu.
export function createAttract(app) {
  let level = null, norm = null, sim = null, route = null, at = 0, acc = 0, endT = 0, loading = null;
  const prev = { x: 0, y: 0 }, events = [];
  const camera = createCamera();
  camera.bottomPad = 0;
  function load() {
    if (!loading) loading = loadArea("area1").then((lv) => { level = lv; sim = createSim(lv, { events: true }); route = decodeRoute(ATTRACT_ROUTE); restart(); }).catch((e) => console.error(e));
    return loading;
  }
  function restart() { sim.reset(); at = 0; acc = 0; endT = 0; prev.x = sim.state.x; prev.y = sim.state.y; camera.setViewport(app.viewW, app.viewH); camera.snap(sim.level, sim.state.x, sim.state.y); }
  return {
    load,
    resize() { camera.setViewport(app.viewW, app.viewH); camera.bottomPad = 0; },
    // side: -1 cube on the left part of the screen, 1 on the right, 0 centered (phones: lower middle)
    frame(dt, now, side = 1) {
      if (!sim) { load(); return false; }
      if (app.renderer.level !== norm) { app.renderer.setLevel(level); norm = app.renderer.level; }
      events.length = 0;
      acc += Math.min(dt, 0.1) * 1000;
      while (acc >= STEP_MS) {
        acc -= STEP_MS;
        const s = sim.state; prev.x = s.x; prev.y = s.y;
        if (s.won) { endT++; if (endT > 150) { restart(); break; } sim.step(0); }
        else { sim.step(at < route.length ? route[at] : 2); at++; }
        for (const e of sim.events) events.push(e);
      }
      const s = sim.state, a = Math.min(1, acc / STEP_MS);
      const portrait = app.viewH > app.viewW * 1.1;
      const offX = portrait ? 0 : -side * camera.halfW * 0.34, offY = portrait ? -camera.halfH * 0.1 : -camera.halfH * 0.05;
      const px = prev.x + (s.x - prev.x) * a + PW / 2, py = prev.y + (s.y - prev.y) * a + PH / 2;
      camera.follow(sim.level, px + offX, py + offY, s.vx, dt);
      app.renderer.frame({ mode: "play", level: sim.level, sim, frame: s.frame, alpha: a, prev, camera, time: now / 1000, dt, events, editor: null, hideSigns: true });
      return true;
    },
  };
}

// ------------------------------------------------------------------------------------------------ title
export function createTitleScreen(app) {
  let root = null, alive = 0;
  const bg = app.attract;
  async function refreshName() {
    const my = alive;
    const n = await app.online.getName();
    const e = root && my === alive && root.querySelector(".who b");
    if (e) e.textContent = n || "set your name";
  }
  return {
    enter() {
      alive++; ensureCss();
      bg.load();
      const prog = app.progress.get();
      const cleared = AREAS.filter((a) => prog.done[a.id]).length;
      root = panel(`<div class="title-wrap">
        <div class="logo-wrap"><div class="logo-cube" aria-hidden="true"><i></i><i></i><b></b></div>
          <h1 class="logo">Adventure <span>Cube</span></h1></div>
        <p class="tagline">A forest platformer. Three wild areas, a level builder, and levels rated by an AI.</p>
        <div class="menu">
          <button data-a="play" class="primary big-btn">Play <small>${cleared ? cleared + " / 3 areas cleared" + "" : "Start the adventure"}</small></button>
          <button data-a="builder">Build a level</button>
          <button data-a="browse">Community levels</button>
          <button data-a="settings">Settings</button>
        </div>
        <button class="who" data-a="name">Playing as <b>...</b></button>
        </div>`, "overlay title-screen");
      root.addEventListener("click", async (e) => {
        const b = e.target.closest("button"); if (!b) return;
        app.audio.unlock(); app.audio.sfx("click");
        const a = b.dataset.a;
        if (a === "play") app.show("areas");
        if (a === "builder") app.show("builder", {});
        if (a === "browse") app.show("browse", {});
        if (a === "settings") openSettings(app, { onClose: refreshName });
        if (a === "name") askName(app).then(refreshName);
      });
      app.ui.appendChild(root);
      refreshName();
      app.audio.playSong(MENU_SONG, { fadeIn: 1.2, fadeOut: 1.0 });
    },
    exit() { alive++; if (root) root.remove(); root = null; },
    resize() { bg.resize(); },
    frame(dt, now) { bg.frame(dt, now, 1); },
  };
}

// ------------------------------------------------------------------------------------------------ area select
export function createAreasScreen(app) {
  let root = null, alive = 0;
  const boards = new Map();   // id -> top row (world record) cache for this session
  async function play(id, extra = {}) {
    const i = AREAS.findIndex((a) => a.id === id);
    const info = AREAS[i];
    const level = await loadArea(id);
    const nextInfo = AREAS[i + 1];
    app.playLevel(level, Object.assign({
      key: id, progressId: id, title: "Area " + info.num, sub: "Area " + info.num, difficulty: areaRating(id), exitLabel: "Area select",
      next: nextInfo ? { label: "Next: Area " + nextInfo.num, go: () => play(nextInfo.id) }
        : { label: "Play the bonus level", go: () => playBonus(app) },
      unlock: nextInfo ? null : { title: "Bonus level: " + BONUS_NAME, text: "A survival sandbox: chop, mine, craft, hunt, and build a house you can level up 20 times. Find it on the area select screen." },
      onExit: () => app.show("areas"),
    }, extra));
  }
  return {
    play,
    enter() {
      alive++; ensureCss();
      const my = alive;
      const prog = app.progress.get();
      root = panel(`<div class="panel wide areas-panel"><div class="ap-head"><button class="back" data-a="back" aria-label="Back">&larr;</button><h2>Choose an area</h2></div>
        <div class="areas">${AREAS.map((a, i) => {
          const open = i === 0 || prog.done[AREAS[i - 1].id] || prog.unlockAll;
          const best = prog.best[a.id], d = areaRating(a.id);
          return `<button data-id="${a.id}" class="area ${a.theme} ${open ? "" : "locked"} ${prog.done[a.id] ? "done" : ""}" ${open ? "" : `aria-disabled="true"`}>
            <span class="area-pic" data-pic="${a.id}"></span>
            <span class="area-body"><span class="area-num">Area ${a.num}${prog.done[a.id] ? ` <em class="ok">Cleared</em>` : ""}</span>
            <b class="area-title">${esc(a.title)}</b>
            <span class="area-tag">${esc(AREA_TAG[a.id] || "")}</span>
            <span class="area-meta">${d ? badge(d) : ""}</span>
            <span class="area-times">${open ? `<span>Best <b>${best ? fmt(best) : "--"}</b></span><span class="wr" data-wr="${a.id}">Record <b>...</b></span>`
              : `<span class="lock">&#128274; Clear Area ${AREAS[i - 1].num} to unlock</span>`}</span></span></button>`;
        }).join("")}${bonusCardHtml(app, prog)}</div>
        <p class="muted small">Difficulty is measured by an AI that plays every level: 1 easy &middot; 5 hard &middot; 10 impossible.</p></div>`, "overlay areas-screen");
      const bonusGo = (card, btn) => {
        app.audio.unlock();
        if (card.classList.contains("locked")) { app.audio.sfx("bonk"); card.classList.remove("shake"); void card.offsetWidth; card.classList.add("shake"); return; }
        const act = btn ? btn.dataset.b : bonusSummary(app) ? "continue" : "start";
        app.audio.sfx("click");
        if (act === "new") {
          if (!btn.dataset.sure) { btn.dataset.sure = "1"; btn.textContent = "Tap again: replaces your world"; return; }
          return playBonus(app, true);
        }
        playBonus(app, false);
      };
      root.addEventListener("keydown", (e) => {
        const card = e.target.closest && e.target.closest(".bonus-card");
        if (card && e.target === card && (e.code === "Enter" || e.code === "Space")) { e.preventDefault(); bonusGo(card, null); }
      });
      root.addEventListener("click", (e) => {
        const card = e.target.closest(".bonus-card");
        if (card) return bonusGo(card, e.target.closest("button[data-b]"));
        const b = e.target.closest("button"); if (!b) return;
        app.audio.unlock();
        if (b.dataset.a === "back") { app.audio.sfx("click"); return app.show("title"); }
        if (b.classList.contains("locked")) { app.audio.sfx("bonk"); b.classList.remove("shake"); void b.offsetWidth; b.classList.add("shake"); return; }
        if (b.dataset.id) { app.audio.sfx("click"); play(b.dataset.id); }
      });
      app.ui.appendChild(root);
      // pictures: theme art + the real level's minimap
      for (const a of AREAS) {
        const host = root.querySelector(`[data-pic="${a.id}"]`);
        loadArea(a.id).then((lv) => {
          if (my !== alive) return;
          const cv = makeThumbCanvas(320, 150, (c, w, h) => drawMinimap(c, lv, 0, 0, w, h));
          host.appendChild(cv);
        }).catch(() => {});
      }
      // the bonus card's painted preview (the player's own house once it has grown a bit)
      { const cv = root.querySelector(".bonus-pic canvas"), sum = bonusSummary(app);
        if (cv) paintBonusPreview(cv, sum && sum.house >= 3 ? sum.house : 12).catch(() => {}); }
      // world records (top 1 per area), cached per session
      for (const a of AREAS) {
        const slot = root.querySelector(`[data-wr="${a.id}"] b`); if (!slot) continue;
        const show = (row) => { if (slot.isConnected) slot.textContent = row ? fmt(row.ms) + " " + row.name : (row === null ? "--" : "offline"); };
        if (boards.has(a.id)) { show(boards.get(a.id)); continue; }
        app.online.getTop(a.id, 1).then((r) => { const row = r.rows && r.rows[0] ? r.rows[0] : (r.ok ? null : undefined); if (r.ok) boards.set(a.id, row); if (my === alive) show(row); });
      }
      const onKey = (e) => { if (e.code === "Escape") app.show("title"); };
      window.addEventListener("keydown", onKey);
      root._off = () => window.removeEventListener("keydown", onKey);
      app.audio.playSong(MENU_SONG, { fadeIn: 1.0 });
    },
    exit() { alive++; if (root) { root._off(); root.remove(); } root = null; },
    frame(dt, now) { app.attract.frame(dt, now, 0); },
  };
}

// ------------------------------------------------------------------------------------------------ name form
const REASON = {
  rude: "That name is not allowed. Try another.", taken: "That name is taken. Try another.",
  invalid: "Names are 3-16 letters, numbers, spaces, _ or -.", noname: "Please type a name.",
  network: "Could not reach the leaderboard. Try again.", offline: "Leaderboards are offline right now.",
};
// nameForm(app, { intro, submit(name) -> Promise<{ok, reason}>, skip() }) -> element
export function nameForm(app, opts = {}) {
  const f = document.createElement("form");
  f.className = "name-form";
  f.innerHTML = `<p>${esc(opts.intro || "Choose your leaderboard name.")}</p>
    <div class="nf-row"><input type="text" maxlength="16" minlength="3" autocomplete="nickname" spellcheck="false" placeholder="Your name" aria-label="Your name">
    <button type="submit" class="primary">Save</button>${opts.skip ? `<button type="button" data-skip>Skip</button>` : ""}</div>
    <p class="nf-msg warn" aria-live="polite"></p>`;
  const inp = f.querySelector("input"), msg = f.querySelector(".nf-msg"), go = f.querySelector("button[type=submit]");
  app.online.getName().then((n) => { if (n && !inp.value) inp.value = n; });
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const n = inp.value.trim();
    if (n.length < 3) { msg.textContent = REASON.invalid; return; }
    go.disabled = true; msg.textContent = "Checking...";
    const r = await (opts.submit ? opts.submit(n) : app.online.claimName(n));
    go.disabled = false;
    if (r && r.ok) { msg.textContent = ""; app.storage.set("adventurecube.nameAsked", true); if (opts.done) opts.done(r.name || n); }
    else msg.textContent = REASON[r && r.reason] || "Something went wrong.";
  });
  const sk = f.querySelector("[data-skip]");
  if (sk) sk.addEventListener("click", () => { app.storage.set("adventurecube.nameAsked", true); opts.skip(); });
  setTimeout(() => { if (!app.input.isTouch) inp.focus(); }, 50);
  return f;
}
// a modal name prompt; resolves with the name or null
export function askName(app) {
  return new Promise((resolve) => {
    const m = panel(`<div class="panel modal-panel"><h2>Your name</h2><div class="slot"></div><button data-a="close">Cancel</button></div>`, "overlay modal");
    const close = (v) => { m.remove(); window.removeEventListener("keydown", onKey, true); resolve(v); };
    const onKey = (e) => { if (e.code === "Escape") { e.stopPropagation(); close(null); } };
    window.addEventListener("keydown", onKey, true);
    m.querySelector(".slot").appendChild(nameForm(app, { intro: "Shown on the leaderboards of every platyfy game. 3-16 characters.", done: (n) => close(n) }));
    m.querySelector("[data-a=close]").addEventListener("click", () => close(null));
    m.addEventListener("pointerdown", (e) => { if (e.target === m) close(null); });
    app.ui.appendChild(m);
  });
}

// ------------------------------------------------------------------------------------------------ settings
export const SETTINGS_KEY = "adventurecube.settings.v1";
export const DEFAULT_SETTINGS = { music: 0.7, sfx: 0.85, muted: false, quality: "auto", touch: "auto" };
export function loadSettings(app) { return Object.assign({}, DEFAULT_SETTINGS, app.storage.get(SETTINGS_KEY, {}) || {}); }
export function applySettings(app, s = loadSettings(app)) {
  app.audio.setVolume({ music: s.music, sfx: s.sfx });
  app.audio.setMuted(!!s.muted);
  app.renderer.setQuality(s.quality === "low" ? "low" : "high");
  app.forceTouch = s.touch === "on";
}
export function openSettings(app, opts = {}) {
  const s = loadSettings(app);
  const m = panel(`<div class="panel settings-panel"><h2>Settings</h2>
    <label class="srow"><span>Music</span><input type="range" min="0" max="100" step="1" data-k="music" value="${Math.round(s.music * 100)}"><output>${Math.round(s.music * 100)}</output></label>
    <label class="srow"><span>Sound effects</span><input type="range" min="0" max="100" step="1" data-k="sfx" value="${Math.round(s.sfx * 100)}"><output>${Math.round(s.sfx * 100)}</output></label>
    <label class="srow chk"><span>Mute everything</span><input type="checkbox" data-k="muted" ${s.muted ? "checked" : ""}></label>
    <div class="srow"><span>Graphics</span><div class="seg" data-k="quality">
      <button data-v="auto" class="${s.quality !== "low" ? "on" : ""}">Best</button><button data-v="low" class="${s.quality === "low" ? "on" : ""}">Fast</button></div></div>
    <div class="srow"><span>Touch buttons</span><div class="seg" data-k="touch">
      <button data-v="auto" class="${s.touch !== "on" ? "on" : ""}">Auto</button><button data-v="on" class="${s.touch === "on" ? "on" : ""}">Always</button></div></div>
    <div class="srow"><span>Name</span><button data-a="name" class="nm">...</button></div>
    <h3>Controls</h3>
    <table class="keys"><tr><td>Move</td><td><kbd>&larr;</kbd> <kbd>&rarr;</kbd> or <kbd>A</kbd> <kbd>D</kbd></td></tr>
      <tr><td>Jump</td><td><kbd>Space</kbd> <kbd>&uarr;</kbd> <kbd>W</kbd> <kbd>Z</kbd> &middot; hold to jump higher</td></tr>
      <tr><td>Pause</td><td><kbd>Esc</kbd> or <kbd>P</kbd></td></tr><tr><td>Restart</td><td><kbd>R</kbd></td></tr>
      <tr><td>Phone</td><td>&#9664; &#9654; buttons bottom left, jump bottom right</td></tr>
      <tr><td>Gamepad</td><td>stick / d-pad to move, A or B to jump</td></tr></table>
    <div class="srow danger-row"><span>Progress</span><button data-a="reset" class="danger">Reset progress</button></div>
    <button data-a="close" class="primary">Done</button></div>`, "overlay modal");
  const save = () => { app.storage.set(SETTINGS_KEY, s); applySettings(app, s); };
  const nm = m.querySelector(".nm");
  const showName = () => app.online.getName().then((n) => { nm.textContent = n || "Set name"; });
  showName();
  m.addEventListener("input", (e) => {
    const k = e.target.dataset.k; if (!k) return;
    if (e.target.type === "range") { s[k] = +e.target.value / 100; e.target.nextElementSibling.textContent = e.target.value; }
    if (e.target.type === "checkbox") s[k] = e.target.checked;
    save();
  });
  m.addEventListener("change", (e) => { if (e.target.dataset.k === "sfx") app.audio.sfx("land", { impact: 4 }); });
  const close = () => { m.remove(); window.removeEventListener("keydown", onKey, true); if (opts.onClose) opts.onClose(); };
  const onKey = (e) => { if (e.code === "Escape") { e.stopPropagation(); e.preventDefault(); close(); } };
  window.addEventListener("keydown", onKey, true);
  m.addEventListener("click", async (e) => {
    const b = e.target.closest("button"); if (!b) return;
    app.audio.sfx("click");
    const seg = b.closest(".seg");
    if (seg) { s[seg.dataset.k] = b.dataset.v; for (const x of seg.children) x.classList.toggle("on", x === b); save(); return; }
    if (b.dataset.a === "close") close();
    if (b.dataset.a === "name") { await askName(app); showName(); }
    if (b.dataset.a === "reset") {
      if (b.dataset.sure) { app.storage.set("adventurecube.progress.v1", {}); b.textContent = "Progress reset"; b.disabled = true; }
      else { b.dataset.sure = "1"; b.textContent = "Tap again to confirm"; }
    }
  });
  m.addEventListener("pointerdown", (e) => { if (e.target === m) close(); });
  app.ui.appendChild(m);
  return m;
}
