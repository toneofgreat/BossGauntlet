// title.js - the title screen (DESIGN 1, 1.1): black, drifting particles, thin serif name, PLAY / CONTINUE / new game /
// SETTINGS, the photosensitivity note with an inline Reduce-flashing toggle, the name entry, and the red NG+ title.
import { el, makeButtonFactory, reduceFlashing } from "./dom.js";
import { createParticles } from "./particles.js";
import { validateName, friendlyNameError } from "./names.js";

export function createTitle(ctx, root, hooks) {
  // hooks: { onPlay(newGame), onSettings(), confirm(text, labels) -> Promise, setSetting(key, value), onName(name) }
  const button = makeButtonFactory(ctx);
  const node = el("div.tn-title", { attrs: { role: "dialog", "aria-label": "Title screen" } });
  const cv = el("canvas", { attrs: { "aria-hidden": "true" } });
  node.appendChild(cv);
  const back = el("a.tn-back", { text: "← platyfy", attrs: { href: "/" } });
  const coarse = (() => { try { return matchMedia("(pointer: coarse)").matches; } catch (e) { return false; } })();
  const sound = el("div.tn-sound", { text: (coarse ? "tap" : "click") + " anywhere for sound" });
  node.appendChild(back); node.appendChild(sound);

  const center = el("div.tn-center");
  const real = el("span.tn-real", { text: "Normal" }), ghost = el("span.tn-ghost", { text: "Normal", attrs: { "aria-hidden": "true" } });
  const normal = el("span.tn-normal", null, [real, ghost]);
  const name = el("h1.tn-name", null, ["Totally a ", normal, " RPG"]);
  const subt = el("p.tn-subt", { text: "a perfectly ordinary adventure" });
  center.appendChild(name); center.appendChild(subt);

  // main menu column
  const col = el("div.tn-menu-col");
  const playBtn = button("Play", "tn-btn.tn-primary", () => hooks.onPlay(true, false));
  const contBtn = button("Continue", "tn-btn.tn-primary", () => hooks.onPlay(false, false));
  const newLink = button("new game", "tn-link", async () => {
    const c = await hooks.confirm("Start over? Your secrets and endings are kept.", ["Yes", "No"]);
    if (c === 0) hooks.onPlay(true, false);
  });
  const asName = el("div.tn-asname");
  const setBtn = button("Settings", "tn-btn", () => hooks.onSettings());
  col.appendChild(playBtn); col.appendChild(contBtn); col.appendChild(newLink); col.appendChild(setBtn); col.appendChild(asName);
  center.appendChild(col);

  // name entry
  const entry = el("form.tn-entry.tn-hide", { attrs: { autocomplete: "off", novalidate: "" } });
  const inId = "tn-name-in";
  const lab = el("label", { text: "What is your name, traveller?", attrs: { for: inId } });
  const input = el("input", { attrs: { id: inId, type: "text", placeholder: "your name", maxlength: "32", autocomplete: "off", autocapitalize: "words", spellcheck: "false", enterkeyhint: "go", "aria-describedby": "tn-name-err" } });
  const err = el("div.tn-err", { attrs: { id: "tn-name-err", role: "alert", "aria-live": "polite" } });
  const begin = button("Begin", "tn-btn.tn-primary", () => submitName());
  const backBtn = button("back", "tn-link", () => closeEntry());
  begin.type = "submit";
  entry.appendChild(lab); entry.appendChild(input); entry.appendChild(err); entry.appendChild(begin); entry.appendChild(backBtn);
  entry.addEventListener("submit", (e) => { e.preventDefault(); submitName(); });
  input.addEventListener("input", () => { err.textContent = ""; });
  input.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Escape") closeEntry(); });
  center.appendChild(entry);
  node.appendChild(center);

  // photosensitivity note
  const photo = el("div.tn-photo");
  const flashTog = button("", "tn-link", () => {
    hooks.setSetting("reduceFlashing", !reduceFlashing(ctx));
    syncPhoto();
  });
  photo.appendChild(document.createTextNode("This game contains jump scares and bright flashes. Turn on Reduce flashing in Settings to soften them. "));
  photo.appendChild(flashTog);
  node.appendChild(photo);
  root.appendChild(node);

  function syncPhoto() {
    const on = reduceFlashing(ctx);
    flashTog.textContent = "Reduce flashing: " + (on ? "ON" : "OFF");
    flashTog.setAttribute("aria-pressed", on ? "true" : "false");
  }

  const lowQ = () => { try { return ctx.engine && ctx.engine.quality && ctx.engine.quality.level === 0; } catch (e) { return false; } };
  const field = createParticles(cv, { count: 350 });

  node.addEventListener("pointermove", (e) => field.setPointer(e.clientX, e.clientY));
  node.addEventListener("pointerdown", (e) => field.setPointer(e.clientX, e.clientY));
  node.addEventListener("pointerleave", () => field.clearPointer());

  let visible = false, red = false, flickerTimer = 0, onNameDone = null;

  function scheduleFlicker() {
    clearTimeout(flickerTimer);
    flickerTimer = setTimeout(() => {
      if (!visible) return;
      if (reduceFlashing(ctx)) {
        normal.classList.remove("dip"); void normal.offsetWidth; normal.classList.add("dip");
      } else {
        // two frames of a misaligned copy
        normal.classList.add("glitch");
        requestAnimationFrame(() => requestAnimationFrame(() => normal.classList.remove("glitch")));
      }
      scheduleFlicker();
    }, 10000 + Math.random() * 2000);
  }

  function hasSave() { try { return !!(ctx.save && ctx.save.has && ctx.save.has()); } catch (e) { return false; } }

  function syncButtons() {
    const save = hasSave();
    playBtn.classList.toggle("tn-hide", save);
    contBtn.classList.toggle("tn-hide", !save);
    newLink.classList.toggle("tn-hide", !save);
    const nm = ctx.state.profile.name;
    asName.textContent = "";
    if (nm) {
      asName.appendChild(document.createTextNode("playing as " + nm + " · "));
      asName.appendChild(button("change name", "tn-link", () => openEntry(true)));
    }
  }

  function show(opts) {
    opts = opts || {};
    red = !!opts.red;
    node.classList.toggle("red", red);
    node.classList.remove("naming");
    entry.classList.add("tn-hide");
    col.classList.toggle("tn-hide", red);
    photo.classList.toggle("tn-hide", red);
    back.classList.toggle("tn-hide", red);
    sound.classList.toggle("tn-hide", red);
    field.setColor(red ? "#ff3030" : "#ffffff");
    field.setCount(lowQ() ? 120 : 350);
    syncButtons(); syncPhoto();
    node.style.display = "";
    node.style.opacity = "1";
    node.style.pointerEvents = "";
    if (!visible) {
      name.classList.remove("in"); node.classList.remove("ready");
      void name.offsetWidth;
    }
    visible = true;
    field.start();
    requestAnimationFrame(() => { name.classList.add("in"); if (!red) node.classList.add("ready"); });
    if (opts.instant) { name.style.transition = "none"; name.classList.add("in"); node.classList.add("ready"); void name.offsetWidth; name.style.transition = ""; }
    scheduleFlicker();
    if (!red && !opts.keepFocus) setTimeout(() => { try { (hasSave() ? contBtn : playBtn).focus({ preventScroll: true }); } catch (e) { /* */ } }, 60);
  }

  /** fade the title out (particles accelerate up and thin out); resolves when gone */
  function leave(dur) {
    dur = dur === undefined ? 1.6 : dur;
    field.leave();
    node.style.pointerEvents = "none";
    node.style.transition = "opacity " + dur + "s ease";
    node.style.opacity = "0";
    return new Promise((r) => setTimeout(() => { hide(); r(); }, dur * 1000));
  }

  function hide() {
    visible = false;
    clearTimeout(flickerTimer);
    field.stop();
    node.style.display = "none";
    node.style.transition = "";
  }

  function soundUnlocked() { sound.classList.add("gone"); }

  // ---- name entry
  function openEntry(change) {
    return new Promise((resolve) => {
      onNameDone = resolve;
      node.classList.add("naming");
      col.classList.add("tn-hide");
      entry.classList.remove("tn-hide");
      entry.dataset.change = change ? "1" : "";
      input.value = change ? (ctx.state.profile.name || "") : "";
      err.textContent = "";
      setTimeout(() => { try { input.focus({ preventScroll: true }); } catch (e) { /* */ } }, 50);
    });
  }
  function closeEntry() {
    node.classList.remove("naming");
    entry.classList.add("tn-hide");
    col.classList.remove("tn-hide");
    const r = onNameDone; onNameDone = null;
    if (r) r(null);
  }
  function submitName() {
    const res = validateName(input.value);
    if (!res.ok) {
      err.textContent = friendlyNameError(res);
      err.classList.remove("shake"); void err.offsetWidth; err.classList.add("shake");
      try { ctx.audio && ctx.audio.sfx && ctx.audio.sfx("ui_error"); } catch (e) { /* */ }
      return;
    }
    try { input.blur(); } catch (e) { /* */ }
    hooks.onName(res.name);
    const change = entry.dataset.change === "1";
    const r = onNameDone; onNameDone = null;
    if (change) { closeEntry(); syncButtons(); }
    if (r) r(res.name);
  }

  return {
    node, field, show, hide, leave, openEntry, soundUnlocked, syncPhoto, syncButtons,
    get visible() { return visible; }, get red() { return red; }
  };
}
