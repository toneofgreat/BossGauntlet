// hud.js - the in-game HUD (DESIGN 14, CONTRACT 12): name + level (big number) + MULT, HP bar, equipped items, lives,
// objective line + compass + world waypoint marker (clamped to the screen edges with an arrow), boss bar, interact
// prompt, toasts, banner, subtitles, pooled damage numbers, hurt vignette, FPS counter.
// update(dt) runs every frame from the UI system: no allocation, DOM writes only when a shown value changed.
import { el, makeButtonFactory, reduceFlashing } from "./dom.js";
import { fmtLevel, fmtPopup, fmtMult, commas } from "./format.js";
import { itemIcon, SLOT_ICON, prettyId } from "./icons.js";

const SLOTS = ["sword", "armor", "morph", "crown", "charm"];
const DMG_POOL = 32;

export function createHud(ctx, root, hooks) {
  const THREE = ctx.THREE;
  const button = makeButtonFactory(ctx);
  const hud = el("div.tn-hud.off");
  root.appendChild(hud);

  // ---------------------------------------------------------------- stats block (top-left)
  const stats = el("div.tn-stats");
  const who = el("div.tn-who");
  const pauseBtn = button("II", "tn-pausebtn", () => hooks.onPause && hooks.onPause());
  pauseBtn.setAttribute("aria-label", "Pause menu");
  const nameEl = el("span.n");
  who.appendChild(pauseBtn); who.appendChild(nameEl);
  const lvRow = el("div.tn-lvrow");
  const lvl = el("div.tn-lvl"), lvSmall = el("small", { text: "LV" }), lvNum = el("span", { text: "0" });
  lvl.appendChild(lvSmall); lvl.appendChild(lvNum);
  const mult = el("span.tn-mult", { text: "x1" });
  const gain = el("span.tn-gain");
  lvRow.appendChild(lvl); lvRow.appendChild(mult); lvRow.appendChild(gain);
  const hp = el("div.tn-hp"), hpLag = el("b"), hpFill = el("i");
  hp.appendChild(hpLag); hp.appendChild(hpFill);
  const hpTxt = el("div.tn-hptxt");
  const equip = el("div.tn-equip");
  const slotImgs = {};
  for (const s of SLOTS) {
    const d = el("div.s.empty", { attrs: { title: s } }), im = el("img", { attrs: { alt: s } });
    d.appendChild(im); equip.appendChild(d); slotImgs[s] = { d, im, id: "\u0000" };
  }
  const livesEl = el("div.tn-lives.tn-hide", { attrs: { "aria-label": "lives" } });
  stats.appendChild(who); stats.appendChild(lvRow); stats.appendChild(hp); stats.appendChild(hpTxt); stats.appendChild(equip); stats.appendChild(livesEl);
  hud.appendChild(stats);

  // ---------------------------------------------------------------- objective + compass (top-centre)
  const obj = el("div.tn-obj");
  const objTxt = el("div.tn-objtxt.empty", { attrs: { role: "status", "aria-live": "polite" } });
  const compass = el("canvas.tn-compass", { attrs: { "aria-hidden": "true" } });
  obj.appendChild(objTxt); obj.appendChild(compass);
  hud.appendChild(obj);
  const cg = compass.getContext("2d");

  // ---------------------------------------------------------------- boss bar
  const boss = el("div.tn-boss.off", { attrs: { role: "status" } });
  const bossName = el("div.tn-bossname");
  const bossBar = el("div.tn-bossbar"), bossLag = el("b"), bossFill = el("i");
  bossBar.appendChild(bossLag); bossBar.appendChild(bossFill);
  const pips = el("div.tn-pips");
  boss.appendChild(bossName); boss.appendChild(bossBar); boss.appendChild(pips);
  hud.appendChild(boss);

  // ---------------------------------------------------------------- marker, prompt, toasts, banner, subtitle, vignette
  const marker = el("div.tn-marker.tn-hide"), mDia = el("div.d"), mArrow = el("div.a"), mDist = el("div.m");
  marker.appendChild(mArrow); marker.appendChild(mDia); marker.appendChild(mDist);
  hud.appendChild(marker);
  const vig = el("div.tn-vig");
  hud.appendChild(vig);
  const prompt = el("div.tn-prompt.off", { attrs: { role: "status" } });
  const promptKey = el("kbd", { text: "E" }), promptTxt = el("span");
  prompt.appendChild(promptKey); prompt.appendChild(promptTxt);
  hud.appendChild(prompt);
  const toasts = el("div.tn-toasts", { attrs: { "aria-live": "polite" } });
  root.appendChild(toasts);       // toasts stay visible outside the HUD (title-less screens too)
  const banner = el("div.tn-banner"), bTitle = el("h2"), bHr = el("hr"), bSub = el("p");
  banner.appendChild(bTitle); banner.appendChild(bHr); banner.appendChild(bSub);
  root.appendChild(banner);
  const sub = el("div.tn-sub.off", { attrs: { "aria-live": "polite" } });
  root.appendChild(sub);
  const fps = el("div.tn-fps.tn-hide");
  root.appendChild(fps);
  const dmgLayer = el("div", { style: { position: "absolute", inset: "0", pointerEvents: "none" } });
  hud.appendChild(dmgLayer);

  // damage-number pool
  const pool = [];
  for (let i = 0; i < DMG_POOL; i++) {
    const d = el("div.tn-dmg", { style: { display: "none" } });
    dmgLayer.appendChild(d);
    pool.push({ el: d, on: false, x: 0, y: 0, z: 0, t: 0, dur: 1, drift: 0, kind: "" });
  }
  let poolNext = 0;

  // scratch
  const V = new THREE.Vector3(), V2 = new THREE.Vector3();
  let W = window.innerWidth, H = window.innerHeight;
  window.addEventListener("resize", () => { W = window.innerWidth; H = window.innerHeight; compassW = 0; });

  // ---------------------------------------------------------------- state
  let visible = false;
  let shownLevel = -1, dispLevel = 0, lvTarget = 0, lvPulse = 0;
  let lastMultStr = "", multTimer = 0;
  let lastHp = -1, lastMax = -1, hpLow = false;
  let lastLives = -1, explicitLives = null, lastStateLives = 0;
  let gainAcc = 0, gainT = 0;
  let objText = null, objTarget = null, objDanger = false;
  let markerOn = false, mX = -1, mY = -1, mEdge = false, mAng = 999, mDistN = -1;
  let compassFade = null;
  let compassW = 0, compassH = 0, lastHeading = 999, lastBearing = 999, lastHasBearing = false;
  let vigA = 0, vigBase = 0, lastVig = -1;
  let fpsAcc = 0, fpsN = 0, fpsT = 0, fpsOn = false;
  let subTimer = 0, bannerTimer = 0;
  let bossId = null, bossMax = 1, bossPhases = 0, bossEndTimer = 0;

  function setVisible(v) {
    visible = !!v;
    hud.classList.toggle("off", !visible);
    if (!visible) { marker.classList.add("tn-hide"); markerOn = false; }
  }

  function setName(n) { nameEl.textContent = n || ""; }

  // ---------------------------------------------------------------- level / mult / equip
  function readLevel() {
    try { const c = ctx.combat; if (c && c.level) return c.level() || 0; } catch (e) { /* */ }
    return ctx.state.run.level || 0;
  }
  function refreshMult() {
    let m = 1;
    try { const c = ctx.combat; if (c && c.mult) m = c.mult(); } catch (e) { /* */ }
    const s = fmtMult(m);
    if (s !== lastMultStr) { lastMultStr = s; mult.textContent = s; }
  }
  function refreshEquip() {
    const eq = ctx.state.run.equip || {};
    for (const s of SLOTS) {
      const id = eq[s] || null, slot = slotImgs[s];
      const key = id || "";
      if (slot.id === key) continue;
      slot.id = key;
      slot.im.src = itemIcon(id || (s === "sword" ? "fists" : SLOT_ICON[s]));
      slot.d.classList.toggle("empty", !id);
      slot.d.title = id ? itemName(id) : s;
    }
    refreshMult();
  }
  function itemName(id) {
    try { const c = ctx.combat; const d = c && c.items && c.items[id]; if (d && d.name) return d.name; } catch (e) { /* */ }
    return prettyId(id);
  }

  function snapLevel() { lvTarget = dispLevel = readLevel(); shownLevel = -1; }

  function levelGain(amount) {
    lvTarget = readLevel();
    if (amount > 0) {
      gainAcc = (gainT > 0 ? gainAcc : 0) + amount;
      gainT = 2.2;
      gain.textContent = "+" + fmtPopup(gainAcc) + " LV";
      gain.classList.add("on");
      lvPulse = 0.6;
      lvl.classList.add("pulse");
    }
    refreshMult();
  }

  // ---------------------------------------------------------------- objective
  function setObjective(text, target, opts) {
    const t = text === null || text === undefined || text === "" ? null : String(text);
    objTarget = target || null;
    if (objTarget && typeof objTarget.x !== "number") objTarget = null;
    objDanger = !!(opts && opts.danger) || (!!t && /\bRUN\b/.test(t) && t === t.toUpperCase());
    marker.classList.toggle("red", objDanger);
    if (t === objText) return;
    objText = t;
    if (!t) { objTxt.classList.add("empty"); objTxt.textContent = ""; return; }
    objTxt.classList.remove("empty");
    objTxt.classList.add("chg");
    setTimeout(() => { if (objText === t) { objTxt.textContent = t; objTxt.classList.remove("chg"); } }, objTxt.textContent ? 300 : 0);
  }

  // ---------------------------------------------------------------- prompt
  function setPrompt(label) {
    const touch = document.body.classList.contains("tn-touch");
    if (!label) { prompt.classList.add("off"); return; }
    promptTxt.textContent = String(label);
    promptKey.classList.toggle("tn-hide", touch);
    prompt.classList.remove("off");
  }

  // ---------------------------------------------------------------- toasts
  function toast(text, opts) {
    opts = opts || {};
    const kind = opts.kind || "info";
    if ((kind === "tip" || opts.tip) && ctx.state.settings.hints === false) return null;
    const d = el("div.tn-toast." + (kind === "tip" ? "info" : kind));
    if (kind === "secret") {
      const m = /^SECRET FOUND:\s*(.*)$/i.exec(String(text));
      d.appendChild(el("b", { text: "SECRET FOUND" }));
      d.appendChild(document.createTextNode(m ? m[1] : String(text)));
    } else d.textContent = String(text);
    toasts.appendChild(d);
    const maxT = window.innerWidth < 600 ? 3 : 4;
    while (toasts.children.length > maxT) toasts.removeChild(toasts.firstChild);
    const dur = (opts.dur || 3) * 1000;
    const h = { el: d, set(t) { d.textContent = String(t); } };
    setTimeout(() => { d.classList.add("out"); setTimeout(() => { if (d.parentNode) d.parentNode.removeChild(d); }, 420); }, dur);
    try { ctx.audio && ctx.audio.sfx && kind !== "secret" && ctx.audio.sfx("ui_toast", { vol: 0.6 }); } catch (e) { /* */ }
    return h;
  }

  function showBanner(title, subText, dur) {
    bTitle.textContent = String(title || "");
    bSub.textContent = subText ? String(subText) : "";
    bHr.classList.toggle("tn-hide", !subText);
    banner.classList.remove("on"); void banner.offsetWidth; banner.classList.add("on");
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => banner.classList.remove("on"), (dur || 3) * 1000);
  }

  function subtitle(text, dur) {
    clearTimeout(subTimer);
    const t = text === null || text === undefined ? "" : String(text);
    if (!t) { sub.classList.add("off"); return; }
    sub.textContent = t;
    sub.classList.toggle("hollow", t === t.toLowerCase() && /[a-z]/.test(t));
    sub.classList.remove("off");
    if (dur !== Infinity && dur !== 0) subTimer = setTimeout(() => sub.classList.add("off"), Math.max(0.6, dur || 3) * 1000);
  }

  // ---------------------------------------------------------------- damage numbers
  function damageNumber(pos, text, kind) {
    if (!pos) return;
    const p = pool[poolNext]; poolNext = (poolNext + 1) % DMG_POOL;
    p.on = true; p.x = pos.x; p.y = (pos.y || 0) + (kind === "levels" ? 2.1 : 1.6); p.z = pos.z; p.t = 0;
    p.dur = kind === "levels" ? 1.6 : kind === "crit" ? 1.1 : 0.9;
    p.drift = (Math.random() - 0.5) * 40;
    if (p.kind !== kind) { p.el.className = "tn-dmg" + (kind && kind !== "hit" ? " " + kind : ""); p.kind = kind; }
    p.el.textContent = String(text);
    p.el.style.display = "";
    p.el.style.opacity = "0";
  }

  // ---------------------------------------------------------------- hurt / lives
  function hurt(amount, max) {
    const f = Math.min(1, 0.35 + (amount / Math.max(1, max)) * 3);
    vigA = Math.max(vigA, (reduceFlashing(ctx) ? 0.45 : 0.75) * f);
  }
  function lives(n) { explicitLives = n | 0; renderLives(explicitLives); }
  function renderLives(n) {
    if (n === lastLives) return;
    lastLives = n;
    livesEl.classList.toggle("tn-hide", !(n > 0));
    if (n > 0) {
      let s = "";
      const max = Math.max(3, n);
      for (let i = 0; i < max; i++) s += i < n ? "♥" : "<span class=x>♥</span>";
      livesEl.innerHTML = s;
    }
  }

  // ---------------------------------------------------------------- boss bar
  const bossApi = {
    start(p) {
      clearTimeout(bossEndTimer);
      bossId = p && p.id !== undefined ? p.id : null;
      bossMax = Math.max(1, (p && p.maxHp) || 1);
      bossName.textContent = (p && p.name) || "";
      while (bossBar.children.length > 2) bossBar.removeChild(bossBar.lastChild);
      const seg = p && p.segments | 0;
      if (seg > 1) for (let i = 1; i < seg; i++) bossBar.appendChild(el("span.seg", { style: { left: (i / seg * 100) + "%" } }));
      bossPhases = 0; pips.innerHTML = "";
      bossFill.style.transform = "scaleX(1)"; bossLag.style.transform = "scaleX(1)";
      boss.classList.remove("off");
    },
    hp(p) {
      if (!p) return;
      if (bossId !== null && p.id !== undefined && p.id !== bossId && !boss.classList.contains("off")) return;
      if (boss.classList.contains("off")) { boss.classList.remove("off"); bossId = p.id; }
      if (p.maxHp) bossMax = Math.max(1, p.maxHp);
      const f = Math.max(0, Math.min(1, (p.hp || 0) / bossMax));
      bossFill.style.transform = "scaleX(" + f.toFixed(4) + ")";
      bossLag.style.transform = "scaleX(" + f.toFixed(4) + ")";
      const ph = p.phase | 0;
      if (ph > 0) {
        if (ph > bossPhases) {
          bossPhases = Math.min(6, Math.max(bossPhases, ph));
          let s = ""; const n = Math.max(bossPhases, 3);
          for (let i = 1; i <= n; i++) s += "<span data-p=" + i + "></span>";
          pips.innerHTML = s;
        }
        const kids = pips.children;
        for (let i = 0; i < kids.length; i++) kids[i].classList.toggle("on", i < ph);
      }
    },
    end(p) {
      if (p && bossId !== null && p.id !== undefined && p.id !== bossId) return;
      clearTimeout(bossEndTimer);
      bossEndTimer = setTimeout(() => boss.classList.add("off"), 1200);
    },
    hide() { clearTimeout(bossEndTimer); boss.classList.add("off"); bossId = null; },
    get visible() { return !boss.classList.contains("off"); }
  };

  // ---------------------------------------------------------------- per-frame
  function drawCompass(heading, bearing, has) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = compass.clientWidth || 200, ch = compass.clientHeight || 20;
    if (cw !== compassW || ch !== compassH || !compassFade) {
      compassW = cw; compassH = ch; compass.width = Math.round(cw * dpr); compass.height = Math.round(ch * dpr);
      compassFade = cg.createLinearGradient(0, 0, cw, 0);
      compassFade.addColorStop(0, "rgba(255,255,255,0)"); compassFade.addColorStop(0.2, "rgba(255,255,255,.75)"); compassFade.addColorStop(0.8, "rgba(255,255,255,.75)"); compassFade.addColorStop(1, "rgba(255,255,255,0)");
    }
    cg.setTransform(dpr, 0, 0, dpr, 0, 0);
    cg.clearRect(0, 0, cw, ch);
    const span = Math.PI; // 180 deg across
    cg.fillStyle = compassFade; cg.strokeStyle = compassFade; cg.lineWidth = 1;
    cg.font = "600 10px system-ui,sans-serif"; cg.textAlign = "center"; cg.textBaseline = "middle";
    const step = Math.PI / 12;
    const start = Math.ceil((heading - span / 2) / step);
    for (let k = start; k * step <= heading + span / 2; k++) {
      const a = k * step, x = cw / 2 + ((a - heading) / span) * cw;
      const idx = ((k % 24) + 24) % 24;
      if (idx % 6 === 0) cg.fillText("NESW".charAt(idx / 6), x, ch / 2);
      else { const tall = idx % 3 === 0; cg.beginPath(); cg.moveTo(x + 0.5, ch / 2 - (tall ? 4 : 2)); cg.lineTo(x + 0.5, ch / 2 + (tall ? 4 : 2)); cg.stroke(); }
    }
    cg.beginPath(); cg.moveTo(cw / 2 - 3, 0); cg.lineTo(cw / 2 + 3, 0); cg.lineTo(cw / 2, 3); cg.closePath(); cg.fillStyle = "rgba(255,255,255,.8)"; cg.fill();
    if (has) {
      let d = bearing - heading;
      while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      const x = cw / 2 + Math.max(-0.5, Math.min(0.5, d / span)) * cw;
      cg.save(); cg.translate(x, ch / 2); cg.rotate(Math.PI / 4);
      cg.fillStyle = objDanger ? "#ff4a4a" : "#e8c66a"; cg.fillRect(-3.5, -3.5, 7, 7); cg.restore();
    }
  }

  function update(dt, realDt) {
    // fps counter (real time)
    const showF = !!ctx.state.settings.showFps;
    if (showF !== fpsOn) { fpsOn = showF; fps.classList.toggle("tn-hide", !fpsOn); }
    if (fpsOn) { fpsAcc += realDt; fpsN++; fpsT += realDt; if (fpsT >= 0.5) { fps.textContent = Math.round(fpsN / fpsAcc) + " fps"; fpsAcc = 0; fpsN = 0; fpsT = 0; } }

    // vignette
    if (vigA > 0) vigA = Math.max(0, vigA - realDt * 1.4);
    const p = ctx.state.player;
    const maxHp = Math.max(1, p.maxHp || 100), hpv = Math.max(0, p.hp || 0);
    const low = hpv / maxHp < 0.25 && p.alive !== false && hpv > 0;
    vigBase = low ? 0.28 : 0;
    const va = Math.round(Math.max(vigA, vigBase) * 100) / 100;
    if (va !== lastVig) { lastVig = va; vig.style.opacity = String(va); }

    if (!visible) return;

    // level tick-up
    if (lvTarget !== dispLevel) {
      const diff = lvTarget - dispLevel;
      dispLevel = Math.abs(diff) < Math.max(1, Math.abs(lvTarget) * 0.002) ? lvTarget : dispLevel + diff * Math.min(1, realDt * 9) + Math.sign(diff) * 0.5;
      if ((diff > 0 && dispLevel > lvTarget) || (diff < 0 && dispLevel < lvTarget)) dispLevel = lvTarget;
    }
    const sl = Math.floor(dispLevel);
    if (sl !== shownLevel) { shownLevel = sl; lvNum.textContent = fmtLevel(sl); }
    if (lvPulse > 0) { lvPulse -= realDt; if (lvPulse <= 0) lvl.classList.remove("pulse"); }
    if (gainT > 0) { gainT -= realDt; if (gainT <= 0) { gain.classList.remove("on"); gainAcc = 0; } }
    multTimer -= realDt;
    if (multTimer <= 0) { multTimer = 1; refreshMult(); const lv = readLevel(); if (lv !== lvTarget && gainT <= 0) lvTarget = lv; }

    // hp
    if (hpv !== lastHp || maxHp !== lastMax) {
      lastHp = hpv; lastMax = maxHp;
      const f = Math.max(0, Math.min(1, hpv / maxHp));
      hpFill.style.transform = "scaleX(" + f.toFixed(3) + ")";
      hpLag.style.transform = "scaleX(" + f.toFixed(3) + ")";
      hpTxt.textContent = commas(Math.ceil(hpv)) + " / " + commas(maxHp);
      if (low !== hpLow) { hpLow = low; hp.classList.toggle("low", low); }
    }

    // lives: state wins when it changes, ui.lives(n) otherwise
    const sLives = p.lives | 0;
    if (sLives !== lastStateLives) { lastStateLives = sLives; explicitLives = null; }
    renderLives(explicitLives !== null ? explicitLives : sLives);

    // marker + compass
    const cam = ctx.camera;
    const hints = ctx.state.settings.hints !== false;
    const cine = !!ctx.state.rt.cinematic;
    const tgt = objTarget;
    let heading = 0;
    if (cam) {
      cam.getWorldDirection(V);
      heading = Math.atan2(V.x, -V.z);
    }
    let bearing = 0, hasB = false;
    if (tgt && hints && cam) {
      const pl = ctx.engine && ctx.engine.player && ctx.engine.player.position;
      const ox = pl ? pl.x : cam.position.x, oz = pl ? pl.z : cam.position.z, oy = pl ? pl.y : cam.position.y;
      const dx = tgt.x - ox, dz = tgt.z - oz, dy = (tgt.y || 0) - oy;
      bearing = Math.atan2(dx, -dz); hasB = true;
      const dist = Math.round(Math.sqrt(dx * dx + dz * dz + dy * dy));
      if (!cine) {
        V.set(tgt.x, (tgt.y || 0) + 1.2, tgt.z).applyMatrix4(cam.matrixWorldInverse);
        const behind = V.z > -0.2;
        let sx = 0, sy = 0, edge = false, ang = 0;
        const m = Math.min(46, W * 0.08);
        if (!behind) {
          V2.copy(V).applyMatrix4(cam.projectionMatrix);
          sx = (V2.x * 0.5 + 0.5) * W; sy = (-V2.y * 0.5 + 0.5) * H;
        }
        if (behind || sx < m || sx > W - m || sy < m + 60 || sy > H - m) {
          edge = true;
          let ex = V.x, ey = behind ? -Math.abs(V.y) - Math.abs(V.z) * 0.6 : V.y;
          if (Math.abs(ex) < 1e-4 && Math.abs(ey) < 1e-4) ey = -1;
          const hw = W / 2 - m, hh = H / 2 - m - 30;
          const s = Math.min(hw / Math.max(1e-4, Math.abs(ex)), hh / Math.max(1e-4, Math.abs(ey)));
          sx = W / 2 + ex * s; sy = H / 2 + 15 - ey * s;
          ang = Math.atan2(ex, ey);
        }
        if (!markerOn) { markerOn = true; marker.classList.remove("tn-hide"); }
        if (edge !== mEdge) { mEdge = edge; marker.classList.toggle("edge", edge); }
        if (Math.abs(sx - mX) > 0.4 || Math.abs(sy - mY) > 0.4) {
          mX = sx; mY = sy;
          marker.style.transform = "translate(" + sx.toFixed(1) + "px," + sy.toFixed(1) + "px)";
        }
        if (edge && Math.abs(ang - mAng) > 0.01) { mAng = ang; mArrow.style.transform = "rotate(" + ang.toFixed(3) + "rad)"; mArrow.style.transformOrigin = "7px 24px"; }
        if (dist !== mDistN) { mDistN = dist; mDist.textContent = commas(dist) + " m"; }
      } else if (markerOn) { markerOn = false; marker.classList.add("tn-hide"); }
    } else if (markerOn) { markerOn = false; marker.classList.add("tn-hide"); }
    if (Math.abs(heading - lastHeading) > 0.007 || Math.abs(bearing - lastBearing) > 0.007 || hasB !== lastHasBearing || !compassW) {
      lastHeading = heading; lastBearing = bearing; lastHasBearing = hasB;
      drawCompass(heading, bearing, hasB);
    }

    // damage numbers
    if (cam) {
      for (let i = 0; i < DMG_POOL; i++) {
        const d = pool[i];
        if (!d.on) continue;
        d.t += realDt;
        const k = d.t / d.dur;
        if (k >= 1) { d.on = false; d.el.style.display = "none"; continue; }
        V.set(d.x, d.y + k * 0.9, d.z).applyMatrix4(cam.matrixWorldInverse);
        if (V.z > -0.2) { d.el.style.opacity = "0"; continue; }
        V.applyMatrix4(cam.projectionMatrix);
        const sx = (V.x * 0.5 + 0.5) * W + d.drift * k, sy = (-V.y * 0.5 + 0.5) * H;
        const pop = k < 0.12 ? 0.6 + k / 0.12 * 0.6 : 1.2 - Math.min(0.2, (k - 0.12) * 0.6);
        d.el.style.transform = "translate(" + sx.toFixed(1) + "px," + sy.toFixed(1) + "px) translate(-50%,-50%) scale(" + pop.toFixed(2) + ")";
        d.el.style.opacity = (k > 0.7 ? (1 - k) / 0.3 : 1).toFixed(2);
      }
    }
  }

  return {
    setVisible, setName, setObjective, setPrompt, toast, banner: showBanner, subtitle, damageNumber, hurt, lives,
    bossBar: bossApi, update, refreshEquip, refreshMult, levelGain, snapLevel, itemName,
    get visible() { return visible; },
    get objective() { return { text: objText, target: objTarget }; }
  };
}
