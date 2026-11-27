// screens.js - full-screen layers (CONTRACT 12): fade, letterbox, death screen, ending cards, fake screens (final boss
// tricks) and the glitch overlay. None of them flash: every luminance change is a fade of >= 0.3 s.
import { el, clear, makeButtonFactory, wait } from "./dom.js";
import { createParticles } from "./particles.js";
import { endingCard, BUTTON_LABELS, DEATH_HINTS, ENDING_IDS } from "./endings.js";

const PARTICLE_COLOR = { world: "#9a968c", monster: "#ff2a2a", warrior: "#ffe2b0", idiot: "#bdbdbd", winners: "#ffe08a", sigma: "#d6b4ff" };

export function createScreens(ctx, root, hooks) {
  // hooks: { onScreen(name), counts() -> { secrets, total } }
  const button = makeButtonFactory(ctx);

  // ---------------------------------------------------------------- fade
  const fadeEl = el("div.tn-fade");
  root.appendChild(fadeEl);
  let fadeVal = 0, fadeSeq = 0;
  function fade(to, dur, color) {
    to = to ? 1 : 0;
    dur = dur === undefined || dur === null ? 0.8 : Math.max(0, Number(dur) || 0);
    // a colour only snaps in while the layer is invisible; over a visible layer it blends (never a hard flash)
    const shown = fadeVal !== 0;
    const want = color || (to === 1 && !shown ? "#000" : null);
    if (want && !shown) fadeEl.style.background = want;
    const seq = ++fadeSeq;
    fadeEl.style.transition = dur > 0 ? "opacity " + dur + "s linear, background-color " + dur + "s linear" : "none";
    if (want && shown) fadeEl.style.background = want;
    void fadeEl.offsetWidth;
    fadeEl.style.opacity = String(to);
    fadeVal = to;
    fadeEl.classList.toggle("block", to === 1);
    return new Promise((r) => setTimeout(() => { if (seq === fadeSeq && to === 0) fadeEl.style.transition = ""; r(); }, dur * 1000 + 16));
  }
  function setFadeInstant(v, color) { if (color) fadeEl.style.background = color; fadeEl.style.transition = "none"; fadeEl.style.opacity = String(v); fadeVal = v ? 1 : 0; fadeEl.classList.toggle("block", !!v); fadeSeq++; }

  // ---------------------------------------------------------------- letterbox
  const lbT = el("div.tn-letter.t"), lbB = el("div.tn-letter.b");
  root.appendChild(lbT); root.appendChild(lbB);
  function letterbox(on, dur) {
    const d = dur === undefined ? 0.6 : dur;
    lbT.style.transitionDuration = lbB.style.transitionDuration = d + "s";
    lbT.classList.toggle("on", !!on); lbB.classList.toggle("on", !!on);
  }

  // ---------------------------------------------------------------- death
  const death = el("div.tn-death.tn-hide", { attrs: { role: "alert" } });
  const dTitle = el("h1"), dHint = el("p");
  death.appendChild(dTitle); death.appendChild(dHint);
  root.appendChild(death);
  let deathBusy = null;
  function deathScreen(opts) {
    opts = opts || {};
    if (deathBusy) return deathBusy;
    dTitle.textContent = opts.title || "YOU DIED";
    dHint.textContent = opts.hint || DEATH_HINTS[(Math.random() * DEATH_HINTS.length) | 0];
    death.classList.remove("tn-hide");
    hooks.onScreen && hooks.onScreen("death");
    requestAnimationFrame(() => death.classList.add("on"));
    deathBusy = wait(2500).then(() => {
      death.classList.remove("on");
      setTimeout(() => { if (!death.classList.contains("on")) { death.classList.add("tn-hide"); } }, 1000);
      deathBusy = null;
      hooks.onScreen && hooks.onScreen("game");
    });
    return deathBusy;
  }

  // ---------------------------------------------------------------- ending cards
  const end = el("div.tn-ending.tn-hide", { attrs: { role: "dialog", "aria-modal": "true" } });
  const eCanvas = el("canvas", { attrs: { "aria-hidden": "true" } });
  const eIn = el("div.in"), eKick = el("div.k"), eTitle = el("h1"), eText = el("p.tx"), eStats = el("div.stats"), eBtns = el("div.bs");
  eIn.appendChild(eKick); eIn.appendChild(eTitle); eIn.appendChild(eText); eIn.appendChild(eStats); eIn.appendChild(eBtns);
  end.appendChild(eCanvas); end.appendChild(eIn);
  root.appendChild(end);
  const eField = createParticles(eCanvas, { count: 160 });
  let endJob = null;

  function ending(id, opts) {
    const card = endingCard(id);
    const buttons = (opts && Array.isArray(opts.buttons) && opts.buttons.length ? opts.buttons : ["remember", "startOver", "title"]).slice();
    if (endJob) { try { endJob.resolve("title"); } catch (e) { /* */ } }
    return new Promise((resolve) => {
      endJob = { resolve };
      for (const id2 of ENDING_IDS) end.classList.remove("th-" + id2);
      end.classList.add("th-" + card.theme);
      eKick.textContent = "THE END";
      eTitle.textContent = card.title;
      eText.textContent = card.text;
      const ends = ctx.state.profile.endings || {};
      const got = ENDING_IDS.filter((k) => (ends[k] | 0) > 0).length;
      const c = hooks.counts ? hooks.counts() : null;
      eStats.textContent = "Endings " + got + "/6" + (c ? " · Secrets " + c.count + "/" + c.total : "");
      clear(eBtns);
      for (const b of buttons) {
        const win = b === "winner";
        const btn = button(BUTTON_LABELS[b] || String(b), "tn-btn" + (win ? ".tn-primary.win" : ""), () => finish(b));
        eBtns.appendChild(btn);
      }
      eField.setColor(PARTICLE_COLOR[card.theme] || "#ffffff");
      eField.start();
      end.classList.remove("tn-hide");
      hooks.onScreen && hooks.onScreen("ending");
      requestAnimationFrame(() => requestAnimationFrame(() => {
        end.classList.add("on");
        // whatever fade the cinematic left behind sits under the card: clear it once the card is opaque
        setTimeout(() => { if (endJob) setFadeInstant(0); }, 1500);
      }));
      setTimeout(() => { try { eBtns.firstChild && eBtns.firstChild.focus({ preventScroll: true }); } catch (e) { /* */ } }, 3200);
      let done = false;
      function finish(b) {
        if (done) return; done = true;
        endJob = null;
        end.classList.remove("on");
        setTimeout(() => { if (!endJob) { end.classList.add("tn-hide"); eField.stop(); } }, 900);
        resolve(b);
      }
      endJob.resolve = finish;
    });
  }
  function hideEnding() { if (endJob) endJob.resolve("title"); }

  // ---------------------------------------------------------------- fake screens
  const fake = el("div.tn-fake", { attrs: { "aria-hidden": "true" } });
  root.appendChild(fake);
  function fakeScreen(kind, dur) {
    dur = Math.max(0.5, Number(dur) || 2);
    clear(fake);
    fake.className = "tn-fake";
    fake.style.display = "flex";
    if (kind === "youWin") {
      fake.classList.add("win");
      for (const part of ["top", "bot"]) {
        const h = el("div.half." + part);
        h.appendChild(el("h1", { text: "YOU WIN" }));
        fake.appendChild(h);
      }
      setTimeout(() => {
        fake.classList.add("torn");
        try { ctx.audio && ctx.audio.sfx && ctx.audio.sfx("glitch"); } catch (e) { /* */ }
      }, dur * 600);
    } else {
      fake.classList.add("lost");
      fake.appendChild(el("div.sp"));
      fake.appendChild(el("div", { text: "Connection lost" }));
      fake.appendChild(el("small", { text: "Reconnecting to server..." }));
    }
    return wait(dur * 1000).then(() => { fake.style.display = "none"; clear(fake); });
  }

  // ---------------------------------------------------------------- glitch (no flashing: low-alpha bands, slow updates)
  const gl = el("canvas.tn-glitch", { attrs: { "aria-hidden": "true" } });
  root.appendChild(gl);
  const gg = gl.getContext("2d");
  let glitchEnd = 0, glitchStr = 0, glitchRaf = 0, glitchLast = 0;
  const BANDS = ["rgba(255,0,60,", "rgba(0,255,220,", "rgba(255,255,255,", "rgba(120,0,255,"];
  function glitchTick(now) {
    if (now >= glitchEnd) { gl.style.display = "none"; glitchRaf = 0; gg.clearRect(0, 0, gl.width, gl.height); root.style.transform = ""; return; }
    glitchRaf = requestAnimationFrame(glitchTick);
    if (now - glitchLast < 90) return;
    glitchLast = now;
    const w = gl.width, h = gl.height;
    gg.clearRect(0, 0, w, h);
    const n = 3 + Math.round(glitchStr * 6);
    for (let i = 0; i < n; i++) {
      gg.fillStyle = BANDS[i % BANDS.length] + (0.08 + Math.random() * 0.17 * glitchStr).toFixed(3) + ")";
      const bh = 2 + Math.random() * h * 0.025;
      gg.fillRect((Math.random() - 0.5) * w * 0.1, Math.random() * h, w * (0.4 + Math.random() * 0.8), bh);
    }
    const j = glitchStr * 3;
    root.style.transform = Math.random() < 0.5 ? "translate(" + ((Math.random() - 0.5) * j).toFixed(1) + "px,0)" : "";
  }
  function glitch(dur, strength) {
    glitchStr = Math.max(0.1, Math.min(1, strength === undefined ? 0.6 : Number(strength) || 0.6));
    gl.width = Math.max(64, Math.round(window.innerWidth / 3)); gl.height = Math.max(64, Math.round(window.innerHeight / 3));
    gl.style.display = "block";
    glitchEnd = performance.now() + Math.max(0.1, Number(dur) || 0.5) * 1000;
    if (!glitchRaf) glitchRaf = requestAnimationFrame(glitchTick);
  }

  return {
    fade, setFadeInstant, letterbox, deathScreen, ending, hideEnding, fakeScreen, glitch,
    get fadeValue() { return fadeVal; },
    get endingOpen() { return !!endJob; },
    get deathOpen() { return !!deathBusy; }
  };
}
