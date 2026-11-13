// src/platform/ui/avatar-editor.js — spec 05 §5.10: the Avatar Editor.
//
// A 46-item catalogue is not browsable as one flat list, which is what the slice's
// Catalog panel was. This is the real thing: category tabs, a grid of tiles with
// procedurally-generated thumbnails, and a live 3D preview of the avatar you are
// building, on its own renderer so nothing it does can touch the world underneath.
//
// It comes in two mounts of ONE customizer (amended 2026-11-12, §5.10.2):
//   openAvatarEditor(deps)               — the full-screen overlay (#oof-avatar-editor)
//   mountAvatarEditor(container, deps)   — the same customizer inline in any element,
//                                          which the front page puts at the foot of
//                                          its scroll list.
//
// Every equip is live (§5.10 step 9) — there is no Save button to forget to press.

import * as THREE from "../../../assets/vendor/three.module.js";
import { buildRig } from "../services/avatar/rig.js";
import { paintFace } from "../services/avatar/faces.js";
import {
  getItemsByType, getItem, BASE_SWATCHES, DEFAULT_BODY_COLORS,
} from "../services/avatar/catalog-data.js";
import {
  HAIR_STYLES, getHairStyle, normalizeHairColor, paintHair, hexToHsl, hslToHex, hairMode,
} from "../services/avatar/hair.js";

const TABS = [
  { id: "bodycolor", label: "Body" },
  { id: "hair", label: "Hair" },
  { id: "face", label: "Faces" },
  { id: "hat", label: "Hats" },
  { id: "gear", label: "Gear" },
  { id: "shirt", label: "Shirts" },
  { id: "pants", label: "Pants" },
  { id: "aura", label: "Auras" },
  { id: "trail", label: "Trails" },
];
const RARITY = {
  common: "#9aa3b8", uncommon: "#7ac74f", rare: "#35a3e0", epic: "#6b3fa0", legendary: "#f7c948",
};
const LIMBS = [
  { key: "head", label: "Head" }, { key: "torso", label: "Torso" },
  { key: "leftArm", label: "L Arm" }, { key: "rightArm", label: "R Arm" },
  { key: "leftLeg", label: "L Leg" }, { key: "rightLeg", label: "R Leg" },
];
const THUMBS = new Map(); // id -> dataURL, generated once and kept for the session
const HAIR_THUMBS = new Map(); // id|colour|head -> dataURL
const HAIR_THUMBS_MAX = 120;
const CONFIRM_OVER = 1000; // §5.10 step 8: a four-figure purchase asks first
const HUE_TRACK = "linear-gradient(90deg,#ff0000,#ffff00,#00ff00,#00ffff,#0000ff,#ff00ff,#ff0000)";

function el(tag, style, text) {
  const node = document.createElement(tag);
  if (style) node.setAttribute("style", style);
  if (text !== undefined) node.textContent = text;
  return node;
}

// ---------------------------------------------------------------------------
// §5.10.1 thumbnails
// ---------------------------------------------------------------------------

function canvas96() {
  const c = document.createElement("canvas");
  c.width = 96;
  c.height = 96;
  return c;
}

function thumbFor(item) {
  if (THUMBS.has(item.id)) return THUMBS.get(item.id);
  const c = canvas96();
  const g = c.getContext("2d");
  if (item.type === "face") {
    // The face ops paint over the head colour, exactly as they do on the rig.
    g.fillStyle = DEFAULT_BODY_COLORS.head;
    g.fillRect(0, 0, 96, 96);
    paintFace(g, item.id, DEFAULT_BODY_COLORS.head);
  } else if (item.type === "bodycolor") {
    const app = item.appearance || {};
    if (app.swatch) {
      g.fillStyle = app.swatch;
      g.fillRect(0, 0, 96, 96);
    } else if (app.preset) {
      // A whole-body colourway reads as its palette, one stripe per limb.
      const keys = ["head", "torso", "leftArm", "rightArm", "leftLeg", "rightLeg"];
      keys.forEach((k, i) => {
        g.fillStyle = app.preset[k] || "#888";
        g.fillRect(i * 16, 0, 16, 96);
      });
    }
  } else if (item.type === "aura" || item.type === "trail") {
    const colors = (item.appearance && item.appearance.colors) || ["#ffffff"];
    if (colors[0] === "rainbow") {
      const grad = g.createLinearGradient(0, 0, 96, 96);
      ["#ff4d4d", "#ffb84d", "#ffff4d", "#4dff88", "#4db8ff", "#b84dff"].forEach((c2, i, a) => {
        grad.addColorStop(i / (a.length - 1), c2);
      });
      g.fillStyle = grad;
    } else {
      const grad = g.createRadialGradient(48, 48, 4, 48, 48, 48);
      grad.addColorStop(0, colors[0]);
      grad.addColorStop(1, "#14161c");
      g.fillStyle = grad;
    }
    g.fillRect(0, 0, 96, 96);
    g.fillStyle = "#f2f4f6";
    g.font = "34px system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(item.type === "aura" ? "◎" : "〰", 48, 50);
  } else {
    // hat / gear: draw the prim silhouette flat. A throwaway WebGL context per tile is
    // far more expensive than this, and at 96px the shapes read fine either way.
    g.fillStyle = "#14161c";
    g.fillRect(0, 0, 96, 96);
    const prims = (item.appearance && item.appearance.prims) || [];
    let maxY = 0.5;
    for (const p of prims) maxY = Math.max(maxY, Math.abs(p.offset[1]) + p.size[1] / 2);
    const scale = 74 / (maxY * 2);
    for (const p of prims) {
      const w = Math.max(3, p.size[0] * scale);
      const h = Math.max(3, p.size[1] * scale);
      const x = 48 + p.offset[0] * scale - w / 2;
      const y = 88 - (p.offset[1] * scale + h);
      g.fillStyle = p.color;
      if (p.shape === "sphere" || p.shape === "cylinder" || p.shape === "torus") {
        g.beginPath();
        g.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
        g.fill();
      } else if (p.shape === "cone") {
        g.beginPath();
        g.moveTo(x + w / 2, y);
        g.lineTo(x + w, y + h);
        g.lineTo(x, y + h);
        g.closePath();
        g.fill();
      } else {
        g.fillRect(x, y, w, h);
      }
    }
  }
  const url = c.toDataURL();
  THUMBS.set(item.id, url);
  return url;
}

// A hair tile: the real 3D hairstyle, projected in 2D (hair.js paintHair) on a head of
// the player's own head colour, three-quarter view from a little above.
function hairThumb(styleId, color, headHex) {
  const key = (styleId || "none") + "|" + color + "|" + headHex;
  if (HAIR_THUMBS.has(key)) return HAIR_THUMBS.get(key);
  const c = canvas96();
  const g = c.getContext("2d");
  const grad = g.createLinearGradient(0, 0, 0, 96);
  grad.addColorStop(0, "#1d2130");
  grad.addColorStop(1, "#101219");
  g.fillStyle = grad;
  g.fillRect(0, 0, 96, 96);
  const opts = { cx: 48, cy: 60, scale: 24, yaw: 0.55, pitch: -0.32, head: headHex, face: true };
  paintHair(g, styleId, color, opts);
  if (!styleId) {
    g.fillStyle = "#9aa3b8";
    g.font = "bold 13px system-ui, sans-serif";
    g.textAlign = "center";
    g.fillText("BALD", 48, 18);
  }
  const url = c.toDataURL();
  if (HAIR_THUMBS.size >= HAIR_THUMBS_MAX) HAIR_THUMBS.delete(HAIR_THUMBS.keys().next().value);
  HAIR_THUMBS.set(key, url);
  return url;
}

function headHexOf(state) {
  const v = state && state.bodyColors ? state.bodyColors.head : null;
  if (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v)) return v;
  const item = getItem(v);
  return item && item.appearance && item.appearance.swatch ? item.appearance.swatch : DEFAULT_BODY_COLORS.head;
}

// ---------------------------------------------------------------------------
// preview scene — its own renderer, disposed with the editor
// ---------------------------------------------------------------------------

function createPreview(host, state, embedded) {
  const canvas = document.createElement("canvas");
  // Inline, a vertical swipe over the preview must still scroll the page it sits in.
  canvas.setAttribute("style", "width:100%;height:100%;display:block;touch-action:"
    + (embedded ? "pan-y" : "none") + ";");
  host.appendChild(canvas);

  let renderer = null;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  } catch {
    // No second WebGL context available (some phones cap them). The editor still works;
    // it just does not show a preview, which beats refusing to open at all.
    return { update() {}, setState() {}, setWalking() {}, dispose() {} };
  }
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#14161c");
  const key = new THREE.DirectionalLight(0xffffff, 1.0);
  key.position.set(1, 2, 1.5);
  scene.add(key, new THREE.AmbientLight(0xffffff, 0.55));

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  // Framed for a HATTED avatar, not a bare one: the rig is 5 units but a wizard hat
  // or a crown reaches past 6.5, and cropping the thing someone just bought is the one
  // thing this pane must not do.
  const target = new THREE.Vector3(0, 3.0, 0);
  let yaw = 0;
  let pitch = 0.18;
  let dist = 10.5;
  let auto = true;

  const rig = buildRig(scene, state);

  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  canvas.addEventListener("pointerdown", (e) => {
    dragging = true;
    auto = false; // the moment you touch it, it is yours
    lastX = e.clientX;
    lastY = e.clientY;
    try { canvas.setPointerCapture(e.pointerId); } catch { /* already released */ }
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    yaw -= (e.clientX - lastX) * 0.01;
    pitch = Math.max(-0.17, Math.min(1.05, pitch + (e.clientY - lastY) * 0.005));
    lastX = e.clientX;
    lastY = e.clientY;
  });
  const stop = () => { dragging = false; };
  canvas.addEventListener("pointerup", stop);
  canvas.addEventListener("pointercancel", stop);
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    dist = Math.max(4, Math.min(12, dist + Math.sign(e.deltaY) * 0.6));
  }, { passive: false });

  rig.setAnimState({ state: "idle", speed: 0 });
  rig.playEmote("wave");

  return {
    rig,
    update(dt) {
      if (auto) yaw += dt * (30 * Math.PI) / 180;
      const r = host.getBoundingClientRect();
      const w = Math.max(1, Math.floor(r.width));
      const h = Math.max(1, Math.floor(r.height));
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      camera.position.set(
        target.x + Math.sin(yaw) * Math.cos(pitch) * dist,
        target.y + Math.sin(pitch) * dist,
        target.z + Math.cos(yaw) * Math.cos(pitch) * dist
      );
      camera.lookAt(target);
      rig.update(dt);
      renderer.render(scene, camera);
    },
    setState(next) { rig.setState(next); },
    // A trail only means anything on something that is moving.
    setWalking(on) { rig.setAnimState({ state: on ? "walk" : "idle", speed: on ? 16 : 0 }); },
    // Turn the camera to look at the face/hair the moment the Hair tab opens.
    faceFront() { auto = false; yaw = 0.35; pitch = 0.32; dist = 7; target.set(0, 4.1, 0); },
    frameBody() { target.set(0, 3.0, 0); dist = 10.5; pitch = 0.18; },
    dispose() {
      rig.dispose();
      renderer.dispose();
      if (typeof renderer.forceContextLoss === "function") renderer.forceContextLoss();
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    },
  };
}

// ---------------------------------------------------------------------------
// the customizer — the shared core of both mounts
// ---------------------------------------------------------------------------

let openHandle = null; // the full-screen editor, if open

// createCustomizer(deps, { embedded }) -> { el, dispose }
function createCustomizer(deps, opts) {
  const { avatar, economy, ui, confirmDialog } = deps;
  const embedded = Boolean(opts && opts.embedded);

  // Inline: overflow CLIP, not hidden — `hidden` makes this box a scroll container, and
  // then neither the sticky preview nor the sticky footer below can stick to the page.
  const main = el("div", embedded
    ? "display:flex;flex-direction:column;min-width:0;background:#0c0e14;border-radius:16px;overflow:clip;"
    : "flex:1;display:flex;min-height:0;");
  const previewPane = el("div", embedded
    ? "flex:none;min-width:0;background:#14161c;position:sticky;z-index:2;"
    : "flex:0 0 40%;min-width:0;background:#14161c;position:relative;");
  const rightPane = el("div", embedded
    ? "flex:1;display:flex;flex-direction:column;min-width:0;"
    : "flex:1;display:flex;flex-direction:column;min-width:0;min-height:0;");
  main.append(previewPane, rightPane);
  const tabsRow = el("div", "flex:none;display:flex;gap:6px;padding:8px 10px;overflow-x:auto;"
    + (embedded ? "position:sticky;z-index:2;background:#0c0e14;" : ""));

  let applyOrientation = null;
  let resizeObs = null;
  if (embedded) {
    // Inline, the preview STICKS while the page scrolls the grid under/beside it: a hair
    // or hat picked at the foot of a long grid is otherwise put on a model that is
    // scrolled out of sight. Wide: preview beside the controls. Narrow: a shorter preview
    // pinned under the HUD's top row, the grid scrolling beneath it.
    // The tab row sticks too (just under the preview when stacked), so switching category
    // never means scrolling back up past the grid. 100px clears the HUD's top row and its
    // Oof Studio button on a phone.
    // The 72/100px are measured from the top of the SCREEN, but a sticky offset counts from
    // the scroll container's padding edge — and the front page pads its top 64px for the
    // HUD — so that padding is taken off, or the preview would stick 64px too low with the
    // grid scrolling visibly through the gap above it.
    const scrollPadTop = () => {
      for (let e = main.parentElement; e && e !== document.documentElement; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (/(auto|scroll)/.test(cs.overflowY)) return parseFloat(cs.paddingTop) || 0;
      }
      return 0;
    };
    const layout = () => {
      const wide = (main.clientWidth || window.innerWidth) >= 720;
      const pad = scrollPadTop();
      const at = (px) => Math.max(0, px - pad);
      main.style.flexDirection = wide ? "row" : "column";
      main.style.alignItems = wide ? "flex-start" : "stretch";
      previewPane.style.flex = wide ? "0 0 42%" : "none";
      previewPane.style.top = at(wide ? 72 : 100) + "px";
      previewPane.style.height = wide
        ? "min(520px, calc(100vh - 96px))"
        : "clamp(200px, 32vh, 300px)";
      // Stacked, the band between the HUD and the stuck preview would show the grid
      // scrolling past; an upward shadow in the panel colour covers it (clipped by
      // `main` while nothing is stuck, so it is invisible until it is needed).
      const band = wide ? 0 : Math.max(0, at(100) - Math.max(0, 64 - pad));
      previewPane.style.boxShadow = band ? `0 -${band}px 0 0 #0c0e14` : "";
      tabsRow.style.top = wide ? at(72) + "px" : at(100) + Math.round(previewPane.getBoundingClientRect().height) + "px";
    };
    layout();
    if (typeof ResizeObserver === "function") {
      resizeObs = new ResizeObserver(layout);
      resizeObs.observe(main);
    } else {
      applyOrientation = layout;
      window.addEventListener("resize", applyOrientation);
    }
  } else {
    // Portrait stacks: a preview beside a grid on a phone leaves neither usable.
    applyOrientation = () => {
      const portrait = window.innerHeight > window.innerWidth;
      main.style.flexDirection = portrait ? "column" : "row";
      previewPane.style.flex = portrait ? "0 0 38%" : "0 0 40%";
    };
    applyOrientation();
    window.addEventListener("resize", applyOrientation);
  }

  // Inline, the balance sits on the customizer itself; full-screen it is in the top bar.
  const balance = el("div", "background:#171a21;border-radius:9px;padding:8px 12px;font-size:14px;"
    + "font-weight:700;");
  if (embedded) {
    const head = el("div", "display:flex;align-items:center;justify-content:space-between;gap:8px;"
      + "padding:10px 10px 0;");
    head.append(el("div", "font-size:16px;font-weight:800;", "Customize your character"), balance);
    rightPane.appendChild(head);
  }

  const grid = el("div", (embedded ? "" : "flex:1;overflow-y:auto;")
    + "padding:0 10px 10px;display:grid;"
    + "grid-template-columns:repeat(auto-fill,minmax(88px,1fr));gap:8px;align-content:start;");
  // The full-screen overlay blocks touchmove on everything but [data-scrollable]: this
  // grid is the one thing in it that has to scroll with a finger.
  grid.dataset.scrollable = "1";
  const footer = el("div", "flex:none;min-height:56px;display:none;align-items:center;"
    + "justify-content:space-between;gap:10px;padding:8px 12px;background:#171a21;"
    + (embedded ? "position:sticky;bottom:0;z-index:1;" : ""));
  const footLabel = el("div", "font-size:13px;font-weight:700;min-width:0;overflow:hidden;"
    + "text-overflow:ellipsis;white-space:nowrap;");
  const footBtn = el("button", "min-width:120px;min-height:44px;border:none;border-radius:12px;"
    + "font-weight:700;font-size:14px;cursor:pointer;");
  footer.append(footLabel, footBtn);
  rightPane.append(tabsRow, grid, footer);

  const style = document.createElement("style");
  style.textContent = "@keyframes oofShake{0%,100%{transform:translateX(0)}"
    + "25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}"
    + ".oof-hue{-webkit-appearance:none;appearance:none;height:28px;border-radius:14px;outline:none;"
    + "margin:0;flex:1;min-width:120px;cursor:pointer}"
    + ".oof-hue::-webkit-slider-thumb{-webkit-appearance:none;width:26px;height:26px;border-radius:13px;"
    + "background:#fff;border:3px solid #0c0e14;box-shadow:0 0 0 2px #fff}"
    + ".oof-hue::-moz-range-thumb{width:22px;height:22px;border-radius:11px;background:#fff;border:3px solid #0c0e14}";
  main.appendChild(style);

  const initial = opts && TABS.some((t) => t.id === opts.initialTab) ? opts.initialTab : "hat";
  let tab = initial;
  let selected = null;
  const selectedLimbs = new Set(["head"]);
  const preview = createPreview(previewPane, avatar.getState(), embedded);
  if (tab === "hair" && preview.faceFront) preview.faceFront();

  // While a colour control is being dragged, the DOM under it must not be rebuilt (that
  // would drop the drag); the rig recolours in place regardless.
  let holdRender = false;
  let renderQueued = false;
  function scheduleRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      if (!disposed && !holdRender) render();
    });
  }

  function refreshBalance() {
    balance.textContent = "⬡ " + economy.getBalance() + " Oofbux";
  }
  const offEconomy = economy.onChange ? economy.onChange(refreshBalance) : null;
  // Changes made anywhere — the other mount, a Place's grant, a save import — show here.
  const offAvatar = typeof avatar.onChange === "function"
    ? avatar.onChange((snap) => { preview.setState(snap); scheduleRender(); })
    : null;

  function equippedIds() {
    const s = avatar.getState();
    return s && s.equipped ? s.equipped : {};
  }

  function renderTabs() {
    tabsRow.textContent = "";
    for (const t of TABS) {
      const on = t.id === tab;
      const btn = el("button", "min-width:56px;height:40px;border:none;border-radius:9px;"
        + "font-size:13px;font-weight:700;cursor:pointer;padding:0 12px;flex:none;"
        + (on ? "background:#00a2ff;color:#0c0e14;" : "background:#171a21;color:#9aa3b8;"), t.label);
      btn.dataset.tab = t.id;
      btn.addEventListener("click", () => {
        const wasHair = tab === "hair";
        tab = t.id;
        selected = null;
        if (tab === "hair" && preview.faceFront) preview.faceFront();
        else if (wasHair && preview.frameBody) preview.frameBody();
        render();
      });
      tabsRow.appendChild(btn);
    }
  }

  function tile(item) {
    const owned = avatar.owns(item.id);
    const isEquipped = Object.values(equippedIds()).includes(item.id);
    const border = isEquipped ? "#00a2ff" : selected === item.id ? RARITY[item.rarity] || "#9aa3b8" : "transparent";
    const node = el("div", "background:#171a21;border-radius:12px;border:2px solid " + border + ";"
      + "padding:6px;cursor:pointer;display:flex;flex-direction:column;gap:4px;");
    node.dataset.item = item.id;
    const img = document.createElement("img");
    img.src = thumbFor(item);
    img.alt = "";
    img.setAttribute("style", "width:100%;aspect-ratio:1;border-radius:8px;background:#0c0e14;"
      + "image-rendering:auto;");
    const name = el("div", "font-size:11px;overflow:hidden;text-overflow:ellipsis;"
      + "white-space:nowrap;", item.name);
    const price = el("div", "font-size:11px;color:#9aa3b8;",
      owned ? "Owned" : item.grantOnly ? "🔒 " + (item.sourcePlace || "reward") : "⬡ " + item.price);
    node.append(img, name, price);
    node.addEventListener("click", () => {
      selected = item.id;
      render();
    });
    return node;
  }

  function renderGrid() {
    grid.textContent = "";
    grid.style.display = "grid";
    const items = getItemsByType(tab).slice().sort((a, b) => {
      if (!!a.grantOnly !== !!b.grantOnly) return a.grantOnly ? 1 : -1;
      if ((a.price || 0) !== (b.price || 0)) return (a.price || 0) - (b.price || 0);
      return a.name.localeCompare(b.name);
    });
    for (const item of items) grid.appendChild(tile(item));
  }

  // §5.10 step 6 — the Body tab is a colour picker, not a grid of things to own.
  function renderBody() {
    grid.textContent = "";
    grid.style.display = "block";
    const limbRow = el("div", "display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;");
    for (const limb of LIMBS) {
      const on = selectedLimbs.has(limb.key);
      const chip = el("button", "min-height:40px;padding:0 12px;border:none;border-radius:9px;"
        + "font-size:12px;font-weight:700;cursor:pointer;"
        + (on ? "background:#00a2ff;color:#0c0e14;" : "background:#171a21;color:#9aa3b8;"), limb.label);
      chip.addEventListener("click", () => {
        if (selectedLimbs.has(limb.key)) selectedLimbs.delete(limb.key);
        else selectedLimbs.add(limb.key);
        if (!selectedLimbs.size) selectedLimbs.add(limb.key); // never zero: a tap must do something
        render();
      });
      limbRow.appendChild(chip);
    }
    grid.appendChild(limbRow);

    for (const item of getItemsByType("bodycolor")) {
      if (!item.appearance || !item.appearance.preset) continue;
      const chip = el("button", "width:100%;min-height:44px;border:none;border-radius:10px;"
        + "background:#171a21;color:#f2f4f6;font-weight:700;font-size:13px;cursor:pointer;"
        + "margin-bottom:8px;text-align:left;padding:0 12px;", item.name + " — apply");
      chip.addEventListener("click", () => {
        if (!avatar.owns(item.id)) { selected = item.id; render(); return; }
        avatar.equip(item.id);
        preview.setState(avatar.getState());
        render();
      });
      grid.appendChild(chip);
    }

    const swatches = el("div", "display:flex;flex-wrap:wrap;gap:8px;");
    const add = (hex, ring, dim, onTap) => {
      const dot = el("button", `width:32px;height:32px;border-radius:16px;cursor:pointer;`
        + `background:${hex};border:2px solid ${ring || "transparent"};`
        + (dim ? "opacity:0.4;" : ""));
      dot.addEventListener("click", onTap);
      swatches.appendChild(dot);
    };
    for (const hex of BASE_SWATCHES) {
      add(hex, null, false, () => {
        for (const limb of selectedLimbs) avatar.setBodyColor(limb, hex);
        preview.setState(avatar.getState());
      });
    }
    for (const item of getItemsByType("bodycolor")) {
      const sw = item.appearance && item.appearance.swatch;
      if (!sw) continue;
      const owned = avatar.owns(item.id);
      add(sw, RARITY[item.rarity], !owned, () => {
        if (!owned) { selected = item.id; render(); return; }
        for (const limb of selectedLimbs) avatar.setBodyColor(limb, sw);
        preview.setState(avatar.getState());
      });
    }
    grid.appendChild(swatches);
  }

  // §5.12 — the Hair tab: every style free, one tap to wear, and a colour picker that
  // takes any hue. Nothing here touches Oofbux.
  function renderHair() {
    grid.textContent = "";
    grid.style.display = "block";
    if (typeof avatar.setHair !== "function") {
      grid.appendChild(el("div", "color:#9aa3b8;font-size:13px;padding:8px 0;", "Hair is not available."));
      return;
    }
    const st = avatar.getState();
    const eq = (st && st.equipped) || {};
    const styleId = getHairStyle(eq.hair) ? eq.hair : null;
    // With no hair on, the controls still show (and set) the colour the next style will use.
    const shownColor = styleId ? normalizeHairColor(styleId, eq.hairColor) : (eq.hairColor || null);
    const color = shownColor || HAIR_STYLES[0].color;
    const head = headHexOf(st);

    const intro = el("div", "font-size:12px;color:#9aa3b8;margin:2px 0 10px;",
      "Every hairstyle is free. Tap one to wear it, then pick any colour.");
    grid.appendChild(intro);

    // ---- colour controls
    const colorBox = el("div", "background:#171a21;border-radius:12px;padding:10px;margin-bottom:10px;"
      + "display:flex;flex-direction:column;gap:10px;");
    colorBox.dataset.hairColorBox = "1";
    const row1 = el("div", "display:flex;align-items:center;gap:10px;flex-wrap:wrap;");
    const label = el("div", "font-size:13px;font-weight:700;", "Hair colour");
    const picker = document.createElement("input");
    picker.type = "color";
    picker.value = shownColor || color;
    picker.setAttribute("aria-label", "Pick any hair colour");
    picker.setAttribute("style", "width:44px;height:36px;border:none;border-radius:8px;padding:0;"
      + "background:transparent;cursor:pointer;");
    picker.dataset.hairPicker = "1";
    const hexOut = el("div", "font-size:12px;color:#9aa3b8;font-family:ui-monospace,monospace;",
      (shownColor || color).toUpperCase());
    row1.append(label, picker, hexOut);

    const hue = document.createElement("input");
    hue.type = "range";
    hue.min = "0";
    hue.max = "359";
    hue.className = "oof-hue";
    hue.setAttribute("aria-label", "Hair hue");
    hue.dataset.hairHue = "1";
    hue.style.background = HUE_TRACK;
    const [h0, s0, l0] = hexToHsl(shownColor || color);
    hue.value = String(Math.round(h0));

    const shadeRow = el("div", "display:flex;align-items:center;gap:10px;");
    const light = document.createElement("input");
    light.type = "range";
    light.min = "8";
    light.max = "92";
    light.className = "oof-hue";
    light.setAttribute("aria-label", "Hair brightness");
    light.value = String(Math.round(l0 * 100));
    const paintLightTrack = (hh, ss) => {
      light.style.background = `linear-gradient(90deg,${hslToHex(hh, ss, 0.08)},${hslToHex(hh, ss, 0.5)},${hslToHex(hh, ss, 0.92)})`;
    };
    paintLightTrack(h0, Math.max(s0, 0.6));
    shadeRow.append(el("div", "font-size:11px;color:#9aa3b8;width:56px;", "Shade"), light);
    const hueRow = el("div", "display:flex;align-items:center;gap:10px;");
    hueRow.append(el("div", "font-size:11px;color:#9aa3b8;width:56px;", "Hue"), hue);

    const presetRow = el("div", "display:flex;flex-wrap:wrap;gap:8px;");
    const presetList = (getHairStyle(styleId) || HAIR_STYLES[0]).presets;
    for (const hex of presetList) {
      const on = (shownColor || "").toLowerCase() === hex.toLowerCase();
      const dot = el("button", `width:32px;height:32px;border-radius:16px;cursor:pointer;background:${hex};`
        + `border:2px solid ${on ? "#00a2ff" : "#2e3345"};`);
      dot.setAttribute("aria-label", "Hair colour " + hex);
      dot.dataset.hairPreset = hex;
      dot.addEventListener("click", () => {
        avatar.setHairColor(hex);
        render();
      });
      presetRow.appendChild(dot);
    }

    const live = (hex) => {
      holdRender = true;
      avatar.setHairColor(hex);
      picker.value = hex;
      hexOut.textContent = hex.toUpperCase();
    };
    const settle = () => {
      holdRender = false;
      scheduleRender();
    };
    hue.addEventListener("input", () => {
      const [, s, l] = hexToHsl(picker.value);
      const ss = s < 0.15 ? 0.75 : s;          // a grey has no hue to turn: give it some colour
      const ll = l < 0.12 || l > 0.9 ? 0.5 : l;
      paintLightTrack(Number(hue.value), ss);
      live(hslToHex(Number(hue.value), ss, ll));
    });
    light.addEventListener("input", () => {
      const [, s] = hexToHsl(picker.value);
      live(hslToHex(Number(hue.value), Math.max(s, 0.05), Number(light.value) / 100));
    });
    picker.addEventListener("input", () => live(picker.value));
    for (const c of [hue, light, picker]) c.addEventListener("change", settle);
    colorBox.append(row1, hueRow, shadeRow, presetRow);

    if (styleId && hairMode(eq.hat) === "tucked") {
      const note = el("div", "display:flex;align-items:center;justify-content:space-between;gap:8px;"
        + "font-size:12px;color:#f7c948;");
      note.append(el("span", "", "Your hat is covering the top of your hair."));
      const off = el("button", "min-height:34px;padding:0 10px;border:none;border-radius:8px;"
        + "background:#2e3345;color:#f2f4f6;font-weight:700;font-size:12px;cursor:pointer;", "Take hat off");
      off.addEventListener("click", () => { avatar.unequip("hat"); render(); });
      note.appendChild(off);
      colorBox.appendChild(note);
    }
    grid.appendChild(colorBox);

    // ---- style tiles
    const tiles = el("div", "display:grid;grid-template-columns:repeat(auto-fill,minmax(88px,1fr));gap:8px;");
    const mk = (id, name, sub) => {
      const on = id === styleId;
      const node = el("div", "background:#171a21;border-radius:12px;border:2px solid "
        + (on ? "#00a2ff" : "transparent") + ";padding:6px;cursor:pointer;display:flex;"
        + "flex-direction:column;gap:4px;");
      node.dataset.hair = id || "none";
      node.setAttribute("role", "button");
      node.setAttribute("aria-pressed", on ? "true" : "false");
      const img = document.createElement("img");
      img.alt = "";
      img.src = hairThumb(id, id ? normalizeHairColor(id, eq.hairColor) : null, head);
      img.setAttribute("style", "width:100%;aspect-ratio:1;border-radius:8px;background:#0c0e14;");
      node.append(img,
        el("div", "font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;", name),
        el("div", "font-size:11px;color:" + (on ? "#00a2ff" : "#7ac74f") + ";", on ? "Wearing" : sub));
      node.tabIndex = 0;
      node.setAttribute("aria-label", name);
      const wear = () => { avatar.setHair(id); render(); };
      node.addEventListener("click", wear);
      node.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); wear(); }
      });
      tiles.appendChild(node);
    };
    mk(null, "No hair", "Free");
    for (const s of HAIR_STYLES) mk(s.id, s.name, s.glow ? "Free · ✨" : "Free");
    grid.appendChild(tiles);
  }

  function renderFooter() {
    if (!selected) { footer.style.display = "none"; return; }
    const item = getItem(selected);
    if (!item) { footer.style.display = "none"; return; }
    footer.style.display = "flex";
    const rarityColor = RARITY[item.rarity] || "#9aa3b8";
    footLabel.textContent = item.name + " · " + item.rarity;
    footLabel.style.color = rarityColor;
    const owned = avatar.owns(item.id);
    const isEquipped = Object.values(equippedIds()).includes(item.id);

    if (!owned && item.grantOnly) {
      footBtn.textContent = "Earn in " + (item.sourcePlace || "a Place");
      footBtn.disabled = true;
      footBtn.style.background = "#171a21";
      footBtn.style.color = "#9aa3b8";
      footBtn.onclick = null;
      return;
    }
    footBtn.disabled = false;
    if (!owned) {
      footBtn.textContent = "Buy · ⬡ " + item.price;
      footBtn.style.background = "#00a2ff";
      footBtn.style.color = "#0c0e14";
      footBtn.onclick = () => buy(item);
      return;
    }
    // The face slot is never empty (§5.6), so the default face has no Unequip.
    if (isEquipped && item.type === "face") { footer.style.display = "none"; return; }
    footBtn.textContent = isEquipped ? "Unequip" : "Equip";
    footBtn.style.background = isEquipped ? "#171a21" : "#00a2ff";
    footBtn.style.color = isEquipped ? "#f2f4f6" : "#0c0e14";
    footBtn.onclick = () => {
      if (isEquipped) avatar.unequip(item.type);
      else avatar.equip(item.id);
      preview.setState(avatar.getState());
      preview.setWalking && preview.setWalking(item.type === "trail" && !isEquipped);
      render();
    };
  }

  async function buy(item) {
    if (!economy.canAfford(item.price)) {
      ui.toast("Not enough Oofbux", { icon: "💸" });
      footBtn.style.animation = "oofShake 0.3s";
      setTimeout(() => { footBtn.style.animation = ""; }, 320);
      return;
    }
    if (item.price >= CONFIRM_OVER && confirmDialog) {
      const yes = await confirmDialog("Buy " + item.name + "?", "This costs ⬡ " + item.price + " Oofbux.");
      if (!yes) return;
    }
    const res = avatar.buy(item.id);
    if (res && res.ok) {
      ui.toast("Bought " + item.name + "!", { icon: "🛍️" });
      preview.setState(avatar.getState());
    } else if (res && res.reason === "afford") {
      ui.toast("Not enough Oofbux", { icon: "💸" });
    }
    render();
  }

  let disposed = false;
  function render() {
    if (disposed) return;
    refreshBalance();
    renderTabs();
    if (tab === "bodycolor") renderBody();
    else if (tab === "hair") renderHair();
    else renderGrid();
    renderFooter();
  }

  // Rendering: full-screen always; inline only while it is on screen, the page is
  // visible, and the full-screen editor is not covering it — an inline preview at the
  // foot of a long scroll list otherwise renders a second 3D scene nobody can see.
  let onScreen = !embedded;
  let io = null;
  if (embedded && typeof IntersectionObserver === "function") {
    io = new IntersectionObserver((entries) => {
      for (const e of entries) onScreen = e.isIntersecting;
    }, { rootMargin: "120px" });
    io.observe(previewPane);
  } else if (embedded) {
    onScreen = true;
  }
  let raf = 0;
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const covered = embedded && openHandle;
    if (onScreen && !covered && !document.hidden) preview.update(dt);
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  render();

  return {
    el: main,
    preview,
    render,
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(raf);
      if (io) io.disconnect();
      if (resizeObs) resizeObs.disconnect();
      if (applyOrientation) window.removeEventListener("resize", applyOrientation);
      if (offEconomy) offEconomy();
      if (offAvatar) offAvatar();
      preview.dispose();
      if (main.parentNode) main.parentNode.removeChild(main);
    },
  };
}

// ---------------------------------------------------------------------------
// mount 1: the full-screen overlay
// ---------------------------------------------------------------------------

// openAvatarEditor(deps) -> Promise (resolves when it closes).
// deps = { avatar, economy, ui, confirmDialog, initialTab? }
export function openAvatarEditor(deps) {
  if (openHandle) return openHandle.done;

  let resolveDone;
  const done = new Promise((r) => { resolveDone = r; });

  const root = el("div", "position:fixed;inset:0;z-index:120;background:#0c0e14;"
    + "display:flex;flex-direction:column;font-family:system-ui,sans-serif;color:#f2f4f6;");
  root.id = "oof-avatar-editor";

  // top row: balance chip + close
  const top = el("div", "flex:none;height:56px;display:flex;align-items:center;"
    + "justify-content:space-between;padding:0 12px;gap:8px;");
  const balance = el("div", "background:#171a21;border-radius:9px;padding:8px 12px;font-size:14px;"
    + "font-weight:700;");
  const close = el("button", "width:44px;height:44px;border:none;border-radius:10px;"
    + "background:#171a21;color:#f2f4f6;font-size:18px;cursor:pointer;", "✕");
  close.id = "oof-editor-close";
  close.setAttribute("aria-label", "Close");
  top.append(balance, close);
  root.appendChild(top);
  document.body.appendChild(root);

  const refreshBalance = () => { balance.textContent = "⬡ " + deps.economy.getBalance() + " Oofbux"; };
  refreshBalance();
  const offEconomy = deps.economy.onChange ? deps.economy.onChange(refreshBalance) : null;

  // openHandle first, so an inline customizer pauses its own preview from frame one
  openHandle = { done, close: closeEditor };
  let core = null;
  try {
    core = createCustomizer(deps, { embedded: false, initialTab: deps.initialTab });
  } catch (err) {
    openHandle = null;
    if (offEconomy) offEconomy();
    if (root.parentNode) root.parentNode.removeChild(root);
    throw err;
  }
  root.appendChild(core.el);

  function onKey(e) {
    if (e.key === "Escape") closeEditor();
  }
  document.addEventListener("keydown", onKey);
  close.addEventListener("click", () => closeEditor());
  // Full-screen only: nothing behind the overlay may scroll or pan. The colour sliders and
  // the grid still take their own gestures (this blocks the page, not the controls).
  const blockTouch = (e) => {
    const t = e.target;
    // (Not a [style*=overflow-y:auto] match: setting grid.style.display re-serializes the
    // attribute as "overflow-y: auto", and the grid then silently refused to scroll.)
    if (t && t.closest && (t.closest("input") || t.closest("[data-scrollable]"))) return;
    e.preventDefault();
  };
  root.addEventListener("touchmove", blockTouch, { passive: false });

  function closeEditor() {
    if (!openHandle) return;
    document.removeEventListener("keydown", onKey);
    if (offEconomy) offEconomy();
    if (core) core.dispose();
    if (root.parentNode) root.parentNode.removeChild(root);
    openHandle = null;
    resolveDone();
  }

  return done;
}

export function closeAvatarEditor() {
  if (openHandle) openHandle.close();
}

export function isEditorOpen() {
  return !!openHandle;
}

// ---------------------------------------------------------------------------
// mount 2: inline, in any container (§5.10.2)
// ---------------------------------------------------------------------------

// mountAvatarEditor(container, deps) -> { el, dispose, refresh }
// deps as openAvatarEditor. The customizer flows with its container (no inner scroll,
// no fixed positioning, no page-wide listeners), so it can sit at the bottom of a
// scrolling page. Any number may be mounted; each owns one WebGL preview and pauses it
// while off screen. Call dispose() when the container goes away.
export function mountAvatarEditor(container, deps) {
  if (!container || typeof container.appendChild !== "function") {
    throw new Error("mountAvatarEditor: a container element is required");
  }
  const wrap = el("div", "font-family:system-ui,sans-serif;color:#f2f4f6;min-width:0;");
  wrap.className = "oof-avatar-customizer";
  container.appendChild(wrap);
  let core;
  try {
    core = createCustomizer(deps, { embedded: true, initialTab: deps && deps.initialTab });
  } catch (err) {
    if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
    throw err;
  }
  wrap.appendChild(core.el);
  return {
    el: wrap,
    refresh() { core.render(); },
    dispose() {
      core.dispose();
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
    },
  };
}
