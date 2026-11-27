// touch.js - phone controls inside #touch (CONTRACT 5.5): floating joystick on the left half, look-drag on the right
// half, ATTACK (hold = heavy), JUMP, DODGE, MENU and a contextual INTERACT button. Pointer events only.
// Visible only on coarse-pointer devices or after a touch, and only while setVisible(true).

export function createTouch(ctx, engine, input) {
  const host = document.getElementById("touch") || (() => { const d = document.createElement("div"); d.id = "touch"; document.body.appendChild(d); return d; })();
  host.innerHTML = "";
  let wanted = false;
  let isTouch = false;
  try { isTouch = matchMedia("(pointer: coarse)").matches; } catch (e) { /* ignore */ }

  const zone = el("div", "tz-zone");
  const base = el("div", "tz-joy"); const knob = el("div", "tz-knob"); base.appendChild(knob);
  const btnAttack = button("tz-btn tz-attack", "ATTACK", "attack");
  const btnJump = button("tz-btn tz-jump", "JUMP", "jump");
  const btnDodge = button("tz-btn tz-dodge", "DODGE", "dodge");
  const btnInteract = button("tz-btn tz-interact", "", "interact");
  const btnMenu = button("tz-btn tz-menu", "☰", "menu");
  btnMenu.setAttribute("aria-label", "Menu");
  btnInteract.style.display = "none";
  host.append(zone, base, btnAttack, btnJump, btnDodge, btnInteract, btnMenu);

  function el(tag, cls) { const d = document.createElement(tag); d.className = cls; return d; }
  function button(cls, label, action) {
    const b = el("button", cls);
    b.type = "button";
    b.textContent = label;
    b.addEventListener("pointerdown", (e) => {
      e.preventDefault(); e.stopPropagation();
      try { b.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      b.classList.add("on");
      input._btn(action, true);
      if (action !== "attack") setTimeout(() => input._btn(action, false), 60);
    });
    const up = (e) => { b.classList.remove("on"); if (action === "attack") input._btn("attack", false); };
    b.addEventListener("pointerup", up);
    b.addEventListener("pointercancel", up);
    b.addEventListener("contextmenu", (e) => e.preventDefault());
    return b;
  }

  // joystick + look on the full-screen zone
  let joyId = -1, joyX = 0, joyY = 0;
  let lookId = -1, lookX = 0, lookY = 0;
  const R = 56;
  zone.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (!isTouch && e.pointerType === "touch") sawTouch();
    const w = window.innerWidth;
    if (e.clientX < w * 0.5 && joyId === -1) {
      joyId = e.pointerId; joyX = e.clientX; joyY = e.clientY;
      base.style.left = joyX + "px"; base.style.top = joyY + "px";
      base.classList.add("on"); knob.style.transform = "translate(-50%,-50%)";
      input._joy(0, 0, true);
    } else if (lookId === -1) {
      lookId = e.pointerId; lookX = e.clientX; lookY = e.clientY;
    }
    try { zone.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  });
  zone.addEventListener("pointermove", (e) => {
    if (e.pointerId === joyId) {
      let dx = e.clientX - joyX, dy = e.clientY - joyY;
      const l = Math.hypot(dx, dy);
      if (l > R) { dx *= R / l; dy *= R / l; }
      knob.style.transform = `translate(calc(-50% + ${dx.toFixed(1)}px), calc(-50% + ${dy.toFixed(1)}px))`;
      input._joy(dx / R, -dy / R, true);
    } else if (e.pointerId === lookId) {
      const dx = e.clientX - lookX, dy = e.clientY - lookY;
      lookX = e.clientX; lookY = e.clientY;
      input._look(dx * 1.6, dy * 1.6);
    }
  });
  const end = (e) => {
    if (e.pointerId === joyId) { joyId = -1; base.classList.remove("on"); input._joy(0, 0, false); }
    if (e.pointerId === lookId) lookId = -1;
  };
  zone.addEventListener("pointerup", end);
  zone.addEventListener("pointercancel", end);
  zone.addEventListener("contextmenu", (e) => e.preventDefault());

  // first real touch anywhere turns the layer on
  window.addEventListener("pointerdown", (e) => { if (e.pointerType === "touch" && !isTouch) sawTouch(); }, { capture: true, passive: true });

  function sawTouch() { isTouch = true; refresh(); }
  function refresh() {
    const on = wanted && isTouch;
    host.classList.toggle("on", on);
    host.style.display = on ? "block" : "none";
    try { document.body.classList.toggle("tn-touch", on); } catch (e) { /* */ }
    if (!on) { joyId = -1; lookId = -1; base.classList.remove("on"); input._joy(0, 0, false); input._btn("attack", false); }
  }
  refresh();

  return {
    el: host,
    setVisible(v) { wanted = !!v; refresh(); },
    get visible() { return wanted && isTouch; },
    get isTouch() { return isTouch; },
    setInteract(label) {
      if (label) { btnInteract.textContent = String(label).slice(0, 18); btnInteract.style.display = ""; }
      else btnInteract.style.display = "none";
    },
    _sawTouch: sawTouch
  };
}
