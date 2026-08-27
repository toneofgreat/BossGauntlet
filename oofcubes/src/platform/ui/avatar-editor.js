// src/platform/ui/avatar-editor.js — spec 05 §5.10: the full-screen Avatar Editor.
//
// A 46-item catalogue is not browsable as one flat list, which is what the slice's
// Catalog panel was. This is the real thing: six category tabs, a grid of tiles with
// procedurally-generated thumbnails, and a live 3D preview of the avatar you are
// building, on its own renderer so nothing it does can touch the world underneath.
//
// Every equip is live (§5.10 step 9) — there is no Save button to forget to press.

import * as THREE from "../../../assets/vendor/three.module.js";
import { buildRig } from "../services/avatar/rig.js";
import { paintFace } from "../services/avatar/faces.js";
import {
  getAllItems, getItemsByType, getItem, BASE_SWATCHES, DEFAULT_BODY_COLORS,
} from "../services/avatar/catalog-data.js";

const TABS = [
  { id: "bodycolor", label: "Body" },
  { id: "face", label: "Faces" },
  { id: "hat", label: "Hats" },
  { id: "gear", label: "Gear" },
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
const CONFIRM_OVER = 1000; // §5.10 step 8: a four-figure purchase asks first

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

// ---------------------------------------------------------------------------
// preview scene — its own renderer, disposed with the editor
// ---------------------------------------------------------------------------

function createPreview(host, state) {
  const canvas = document.createElement("canvas");
  canvas.setAttribute("style", "width:100%;height:100%;display:block;touch-action:none;");
  host.appendChild(canvas);

  let renderer = null;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  } catch {
    // No second WebGL context available (some phones cap them). The editor still works;
    // it just does not show a preview, which beats refusing to open at all.
    return { update() {}, setState() {}, dispose() {} };
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
    canvas.setPointerCapture(e.pointerId);
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
    dispose() {
      rig.dispose();
      renderer.dispose();
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    },
  };
}

// ---------------------------------------------------------------------------
// the editor
// ---------------------------------------------------------------------------

let openHandle = null;

// openAvatarEditor(deps) -> Promise (resolves when it closes).
// deps = { avatar, economy, ui, confirmDialog, onFrame }
export function openAvatarEditor(deps) {
  if (openHandle) return openHandle.done;
  const { avatar, economy, ui, confirmDialog } = deps;

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
  top.append(balance, close);

  const main = el("div", "flex:1;display:flex;min-height:0;");
  const previewPane = el("div", "flex:0 0 40%;min-width:0;background:#14161c;position:relative;");
  const rightPane = el("div", "flex:1;display:flex;flex-direction:column;min-width:0;min-height:0;");
  main.append(previewPane, rightPane);
  // Portrait stacks: a preview beside a grid on a phone leaves neither usable.
  const applyOrientation = () => {
    const portrait = window.innerHeight > window.innerWidth;
    main.style.flexDirection = portrait ? "column" : "row";
    previewPane.style.flex = portrait ? "0 0 38%" : "0 0 40%";
  };
  applyOrientation();
  window.addEventListener("resize", applyOrientation);

  const tabsRow = el("div", "flex:none;display:flex;gap:6px;padding:8px 10px;overflow-x:auto;");
  const grid = el("div", "flex:1;overflow-y:auto;padding:0 10px 10px;display:grid;"
    + "grid-template-columns:repeat(auto-fill,minmax(88px,1fr));gap:8px;align-content:start;");
  const footer = el("div", "flex:none;min-height:56px;display:none;align-items:center;"
    + "justify-content:space-between;gap:10px;padding:8px 12px;background:#171a21;");
  const footLabel = el("div", "font-size:13px;font-weight:700;min-width:0;overflow:hidden;"
    + "text-overflow:ellipsis;white-space:nowrap;");
  const footBtn = el("button", "min-width:120px;min-height:44px;border:none;border-radius:12px;"
    + "font-weight:700;font-size:14px;cursor:pointer;");
  footer.append(footLabel, footBtn);
  rightPane.append(tabsRow, grid, footer);
  root.append(top, main);
  document.body.appendChild(root);

  const style = document.createElement("style");
  style.textContent = "@keyframes oofShake{0%,100%{transform:translateX(0)}"
    + "25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}";
  root.appendChild(style);

  let tab = "hat";
  let selected = null;
  let selectedLimbs = new Set(["head"]);
  const preview = createPreview(previewPane, avatar.getState());

  function refreshBalance() {
    balance.textContent = "⬡ " + economy.getBalance() + " Oofbux";
  }
  const offEconomy = economy.onChange ? economy.onChange(refreshBalance) : null;

  function equippedIds() {
    const s = avatar.getState();
    return s && s.equipped ? s.equipped : {};
  }

  function renderTabs() {
    tabsRow.textContent = "";
    for (const t of TABS) {
      const on = t.id === tab;
      const btn = el("button", "min-width:56px;height:40px;border:none;border-radius:9px;"
        + "font-size:13px;font-weight:700;cursor:pointer;padding:0 12px;"
        + (on ? "background:#00a2ff;color:#0c0e14;" : "background:#171a21;color:#9aa3b8;"), t.label);
      btn.dataset.tab = t.id;
      btn.addEventListener("click", () => {
        tab = t.id;
        selected = null;
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
      footBtn.setAttribute("style", footBtn.getAttribute("style") + "background:#171a21;color:#9aa3b8;");
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

  function render() {
    refreshBalance();
    renderTabs();
    if (tab === "bodycolor") renderBody();
    else renderGrid();
    renderFooter();
  }

  function onKey(e) {
    if (e.key === "Escape") closeEditor();
  }
  document.addEventListener("keydown", onKey);
  close.addEventListener("click", () => closeEditor());
  root.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });

  let raf = 0;
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    preview.update(dt);
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  function closeEditor() {
    if (!openHandle) return;
    cancelAnimationFrame(raf);
    document.removeEventListener("keydown", onKey);
    window.removeEventListener("resize", applyOrientation);
    if (offEconomy) offEconomy();
    preview.dispose();
    if (root.parentNode) root.parentNode.removeChild(root);
    openHandle = null;
    resolveDone();
  }

  openHandle = { done, close: closeEditor };
  render();
  return done;
}

export function closeAvatarEditor() {
  if (openHandle) openHandle.close();
}

export function isEditorOpen() {
  return !!openHandle;
}
