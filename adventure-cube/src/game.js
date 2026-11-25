// game.js - the PLAY screen: fixed 60 Hz stepping, camera, renderer, sfx, HUD, pause, death/respawn, results with
// the online leaderboard. INTEGRATE owns it. Screen protocol + params: CONTRACT.md section 10.
//
// params: { level, key (leaderboard id or null), onWin(result), onExit(result),
//           optional (INTEGRATE additions): title (banner text), sub (banner subtitle), progressId (local progress id:
//           completes it on a win), next ({ label, go() }: "next area" button), difficulty (1..10 badge),
//           exitLabel (quit button text), replay (Uint8Array of inputs to play instead of the devices),
//           speed (sim steps per real step, debug/test only) }
import { createSim, STEP_MS, PW, PH } from "./sim/index.js";
import { createCamera } from "./render/camera.js";
import { badge, ensureCss } from "./builder/common.js";
import { openSettings, nameForm } from "./ui/menu.js";

export const fmt = (ms) => {
  ms = Math.max(0, ms | 0);
  const s = Math.floor(ms / 1000), m = Math.floor(s / 60), cs = Math.floor((ms % 1000) / 10);
  return (m ? m + ":" + String(s % 60).padStart(2, "0") : String(s)) + "." + String(cs).padStart(2, "0");
};
export function escapeHtml(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

const SFX_FOR = { jump: "jump", spring: "spring", respawn: "respawn", checkpoint: "checkpoint", win: "win", crumble: "crumble", crumble_break: "crumble_break", bonk: "bonk" };

export function createPlayScreen(app) {
  let sim = null, params = null, acc = 0, paused = false, done = false, replayAt = 0, stepT = 0, toastT = 0;
  const prev = { x: 0, y: 0 }, events = [];
  let inputs = new Uint8Array(1 << 14), nIn = 0;
  const camera = createCamera();
  camera.topPad = 80;  // the HUD pill + progress bar: the player never goes under them (camera.js headroom)
  let hud = null, overlay = null, banner = null, toastEl = null, hudT = null, hudD = null, hudBar = null, hudDots = null;
  let lastShownMs = -1, lastDeaths = -1, lastCp = -2, winAt = 0;
  const listeners = [];
  const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); listeners.push([t, ev, fn, o]); };

  function el(html, cls = "overlay") { const d = document.createElement("div"); d.className = cls; d.innerHTML = html; return d; }
  function closeOverlay() { if (overlay) overlay.remove(); overlay = null; }

  function onKey(e) {
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
    if (e.code === "Escape" || e.code === "KeyP") { e.preventDefault(); if (!done) setPaused(!paused); }
    else if (e.code === "KeyR" && !done && !paused) restart();
    else if (done && (e.code === "Enter" || e.code === "Space") && overlay) {
      // only a FRESH press after the results opened (holding jump through the goal must not skip the results),
      // and only the results buttons (never the name form's Save)
      e.preventDefault();
      if (e.repeat || performance.now() - winAt < 350) return;
      const b = overlay.querySelector(".res-btns button.primary"); if (b) b.click();
    }
  }
  function setPaused(p) {
    if (done) return;
    paused = p;
    closeOverlay();
    if (p) {
      overlay = el(`<div class="panel pause-panel"><h2>Paused</h2>
        <div class="menu"><button data-a="resume" class="primary">Resume</button><button data-a="restart">Restart</button>
        <button data-a="settings">Settings</button><button data-a="quit">${escapeHtml(params.exitLabel || "Quit")}</button></div>
        <p class="hint">${app.input.isTouch ? "" : "Esc / P pause &middot; R restart"}</p></div>`);
      overlay.addEventListener("click", (e) => {
        const b = e.target.closest("button"); if (!b) return;
        app.audio.sfx("click");
        const a = b.dataset.a;
        if (a === "resume") setPaused(false);
        if (a === "restart") { setPaused(false); restart(); }
        if (a === "settings") openSettings(app);
        if (a === "quit") quit(null);
      });
      app.ui.appendChild(overlay);
      app.audio.duck(0.35, 0.3);
    }
    app.input.setActive(!p && !done && !params.replay);
  }
  function restart() {
    closeOverlay();
    sim.reset(); nIn = 0; acc = 0; done = false; paused = false; replayAt = 0;
    if (params.key && app.online.startRun) app.online.startRun(params.key);
    const s = sim.state; prev.x = s.x; prev.y = s.y;
    camera.snap(sim.level, s.x + PW / 2, s.y + PH / 2);
    lastShownMs = lastDeaths = lastCp = -2;
    app.input.setActive(!params.replay);
  }
  function result() {
    const s = sim.state, f = s.won ? s.winFrame : s.frame;
    return { won: !!s.won, frames: f, ms: Math.round(f * STEP_MS), deaths: s.deaths, inputs: inputs.slice(0, nIn) };
  }
  function quit(res) {
    const r = res || result();
    if (params.onExit) params.onExit(r); else app.show("areas");
  }
  function toast(text) {
    if (!toastEl) return;
    toastEl.textContent = text; toastEl.classList.remove("show"); void toastEl.offsetWidth; toastEl.classList.add("show");
    toastT = 1.6;
  }
  function pushInput(b) {
    if (nIn >= inputs.length) { const n = new Uint8Array(inputs.length * 2); n.set(inputs); inputs = n; }
    inputs[nIn++] = b;
  }

  // ---------------------------------------------------------------- results + leaderboard
  async function win() {
    done = true; app.input.setActive(false); winAt = performance.now();
    const r = result();
    let improved = false, prevBest = 0;
    if (params.progressId) {
      prevBest = (app.progress.get().best || {})[params.progressId] || 0;
      improved = !prevBest || r.ms < prevBest;
      app.progress.complete(params.progressId, r.ms);
    }
    if (params.onWin) { try { params.onWin(r); } catch (e) { console.error(e); } }
    app.audio.duck(0.4, 1.2);
    const s = sim.state;
    const nx = params.next;
    overlay = el(`<div class="panel results">
      <div class="res-head"><div class="res-cube" aria-hidden="true"><i></i><i></i><b></b></div>
      <div><h2>${escapeHtml(params.title ? params.title + " complete!" : "Level complete!")}</h2>
      ${params.difficulty ? `<div class="res-diff">AI difficulty ${badge(params.difficulty)}</div>` : ""}</div></div>
      <div class="res-stats"><div><small>Time</small><b class="big">${fmt(r.ms)}</b></div>
        <div><small>Deaths</small><b>${s.deaths}</b></div>
        ${params.progressId ? `<div><small>${improved ? "Personal best" : "Your best"}</small><b class="${improved ? "pb" : ""}">${improved ? (prevBest ? "NEW!" : "First clear!") : fmt(prevBest)}</b></div>` : ""}</div>
      <div class="board">${params.key ? `<p class="muted">Loading leaderboard...</p>` : `<p class="muted">No leaderboard for test plays.</p>`}</div>
      <div class="res-btns">
        ${nx ? `<button data-a="next" class="primary">${escapeHtml(nx.label)}</button>` : ""}
        <button data-a="again" class="${nx ? "" : "primary"}">Play again</button>
        <button data-a="exit">${escapeHtml(params.exitLabel || "Back")}</button></div></div>`);
    overlay.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-a]"); if (!b) return;
      app.audio.sfx("click");
      const a = b.dataset.a;
      if (a === "again") restart();
      if (a === "next" && nx) nx.go();
      if (a === "exit") quit(r);
    });
    app.ui.appendChild(overlay);
    if (params.key) postAndShow(params.key, r.ms, overlay);
  }
  async function postAndShow(key, ms, ov) {
    const box = ov.querySelector(".board");
    const name = await app.online.getName();
    if (overlay !== ov) return;
    const askName = (intro) => {
      // ask the player's name (filtered + unique online); then post the time with it
      box.innerHTML = "";
      box.appendChild(nameForm(app, {
        intro,
        submit: async (n) => {
          const r = await app.online.submitTime(key, ms, n);
          if (!r.ok && (r.reason === "rude" || r.reason === "taken" || r.reason === "invalid" || r.reason === "noname")) return r;
          if (overlay === ov) showBoard(key, box, r);
          return { ok: true };
        },
        skip: () => { if (overlay === ov) showBoard(key, box, null, "Time not posted (no name)."); },
      }));
    };
    if (!name) { askName("Enter a name to post your time on the leaderboard."); return; }
    const r = await app.online.submitTime(key, ms);
    if (overlay !== ov) return;
    // the saved name could not be claimed online (another device has it, or it is no longer allowed): ask again
    if (!r.ok && (r.reason === "taken" || r.reason === "rude" || r.reason === "invalid" || r.reason === "noname")) {
      const why = r.reason === "taken" ? `The name "${name}" is taken online.` : r.reason === "noname" ? "Your name could not be used." : `The name "${name}" is not allowed.`;
      askName(why + " Pick another name to post your time.");
      return;
    }
    showBoard(key, box, r);
  }
  async function showBoard(key, box, sub, note) {
    box.innerHTML = `<p class="muted">Loading leaderboard...</p>`;
    const top = await app.online.getTop(key, 10);
    if (!box.isConnected) return;
    let h = `<h3>Leaderboard</h3>`;
    if (top.rows && top.rows.length) {
      h += `<ol class="lb">` + top.rows.map((e) => `<li class="${e.me ? "me" : ""}"><span class="rk">${e.rank}</span><span class="nm">${escapeHtml(e.name)}</span><span class="tm">${fmt(e.ms)}</span></li>`).join("") + `</ol>`;
      if (top.me && !top.rows.some((x) => x.me)) h += `<p class="muted">You: #${top.me.rank} &middot; ${fmt(top.me.ms)}</p>`;
    } else if (top.ok) h += `<p class="muted">No times yet. Be the first!</p>`;
    if (!top.ok) h += `<p class="warn">${top.rows && top.rows.length ? "Leaderboard offline (showing a saved copy)." : "Leaderboard offline."}</p>`;
    if (sub && sub.ok && sub.improved && sub.rank) h += `<p class="good">New best on the board: #${sub.rank}!</p>`;
    else if (sub && sub.queued) h += `<p class="muted">Your time is saved and will be posted when you are back online.</p>`;
    else if (sub && sub.reason === "implausible") h += `<p class="warn">Time not posted: it is faster than this level allows.</p>`;
    if (note) h += `<p class="muted">${escapeHtml(note)}</p>`;
    box.innerHTML = h;
  }

  // ---------------------------------------------------------------- screen protocol
  return {
    enter(p) {
      ensureCss();
      params = p || {}; done = false; paused = false;
      sim = createSim(params.level, { events: true });
      app.sim = sim;
      app.renderer.setLevel(sim.level);
      camera.setViewport(app.viewW, app.viewH);
      restart();
      app.audio.playSong(sim.level.music, { fadeIn: 1.0, fadeOut: 0.9 });
      if (app.audio.ambience) app.audio.ambience(sim.level.theme);
      const ncp = sim.level.checkpoints.length;
      hud = el(`<div class="hud"><span class="h-name">${escapeHtml(params.title || sim.level.name)}</span>
        <span class="h-t">0.00</span><span class="h-d" title="Deaths"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5a6 6 0 00-4 10.5v2.5h8V12A6 6 0 008 1.5z"/><circle cx="5.8" cy="7.5" r="1.4" fill="#1a1a1a"/><circle cx="10.2" cy="7.5" r="1.4" fill="#1a1a1a"/></svg><b>0</b></span>
        <button class="pause" aria-label="Pause">II</button></div>
        <div class="h-prog"><i></i><span class="h-dots">${"<em></em>".repeat(ncp)}</span></div>`, "hud-wrap");
      hud.querySelector(".pause").addEventListener("click", () => { app.audio.sfx("click"); setPaused(!paused); });
      hudT = hud.querySelector(".h-t"); hudD = hud.querySelector(".h-d b"); hudBar = hud.querySelector(".h-prog i"); hudDots = hud.querySelectorAll(".h-dots em");
      hudDots.forEach((d, i) => { d.style.left = (100 * sim.level.checkpoints[i].x / Math.max(1, sim.level.goal.x)).toFixed(1) + "%"; });
      app.ui.appendChild(hud);
      toastEl = el("", "toast"); app.ui.appendChild(toastEl);
      if (params.title || params.sub) {
        banner = el(`<div class="banner-in"><small>${escapeHtml(params.sub || "")}</small><b>${escapeHtml(sim.level.name)}</b>
          ${params.difficulty ? `<span>${badge(params.difficulty)}</span>` : ""}</div>`, "banner");
        app.ui.appendChild(banner);
        setTimeout(() => { if (banner) { banner.remove(); banner = null; } }, 3600);
      }
      on(window, "keydown", onKey);
      on(window, "blur", () => { if (!done && !paused && !params.replay) setPaused(true); });
      on(document, "visibilitychange", () => { if (document.hidden && !done && !paused && !params.replay) setPaused(true); });
      app.input.setActive(!params.replay);
    },
    exit() {
      for (const [t, ev, fn, o] of listeners) t.removeEventListener(ev, fn, o);
      listeners.length = 0;
      app.input.setActive(false);
      if (app.audio.ambience) app.audio.ambience(null);
      for (const n of [hud, overlay, banner, toastEl]) if (n) n.remove();
      hud = overlay = banner = toastEl = null;
      app.sim = null; sim = null;
    },
    resize() { camera.setViewport(app.viewW, app.viewH); },
    frame(dt, now) {
      if (!sim) return;
      events.length = 0;
      if (!paused && !done) {
        const speed = Math.max(1, params.speed | 0 || 1);
        acc += Math.min(dt, 0.1) * 1000 * speed;
        while (acc >= STEP_MS) {
          const s = sim.state;
          prev.x = s.x; prev.y = s.y;
          let b;
          if (params.replay) { b = replayAt < params.replay.length ? params.replay[replayAt] : 0; replayAt++; }
          else b = app.input.bits();
          pushInput(b);
          sim.step(b);
          for (let i = 0; i < sim.events.length; i++) {
            const e = sim.events[i];
            events.push(e);
            if (speed > 2) continue;
            if (e.type === "land") app.audio.sfx("land", { impact: e.a, vol: Math.min(1, 0.35 + e.a / 10) });
            else if (e.type === "die") {
              app.audio.sfx(e.a === "water" ? "splash" : "die"); if (e.a === "water") app.audio.sfx("die", { vol: 0.5 });
              app.audio.duck(0.5, 0.8);
            } else if (e.type === "checkpoint") { app.audio.sfx("checkpoint"); toast(`Checkpoint ${e.a + 1} / ${sim.level.checkpoints.length}`); }
            else if (SFX_FOR[e.type]) app.audio.sfx(SFX_FOR[e.type], { impact: e.a });
          }
          // soft footsteps while running on the ground
          if (s.grounded && !s.dead && Math.abs(s.vx) > 2.2 && speed <= 2) { if (++stepT >= 15) { stepT = 0; app.audio.sfx("step", { vol: 0.25 }); } } else stepT = 11;
          acc -= STEP_MS;
          if (sim.state.won) { win(); break; }
        }
      }
      const s = sim.state, a = paused || done ? 1 : Math.min(1, acc / STEP_MS);
      const px = prev.x + (s.x - prev.x) * a + PW / 2, py = prev.y + (s.y - prev.y) * a + PH / 2;
      camera.follow(sim.level, px, py, s.vx, dt);
      app.renderer.frame({ mode: "play", level: sim.level, sim, frame: s.frame, alpha: a, prev, camera, time: now / 1000, dt, events, editor: null, touch: app.input.isTouch });
      if (hud) {
        const ms = Math.floor((s.won ? s.winFrame : s.frame) * STEP_MS / 10) * 10;
        if (ms !== lastShownMs) { lastShownMs = ms; hudT.textContent = fmt(ms); }
        if (s.deaths !== lastDeaths) { lastDeaths = s.deaths; hudD.textContent = s.deaths; }
        if (s.cp !== lastCp) { lastCp = s.cp; hudDots.forEach((d, i) => d.classList.toggle("on", i <= s.cp)); }
        const pr = Math.max(0, Math.min(1, (s.x + PW / 2) / ((sim.level.goal.x + 0.5) * 32)));
        hudBar.style.transform = `scaleX(${pr.toFixed(3)})`;
      }
      if (toastT > 0) { toastT -= dt; if (toastT <= 0 && toastEl) toastEl.classList.remove("show"); }
    },
    get sim() { return sim; },
    get camera() { return camera; },
    setSpeed(n) { if (params) params.speed = Math.max(1, n | 0); },
    get paused() { return paused; },
    get done() { return done; },
  };
}
