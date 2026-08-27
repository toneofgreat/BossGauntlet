// src/platform/studio/palette.js — the part palette down the left edge: four shapes,
// the current default material, the current default colour. Spec 11 §5.6.2.
//
// The palette holds the "what will the next part look like" state. Tapping a shape
// ARMS place mode with these defaults (§5.5); it never places anything itself.
//
// Style note (repeated in every Studio DOM module): §5.6 names the tokens
// --oof-panel / --oof-panel-2 / --oof-ui-line / --oof-muted, which the shipped UI kit
// (spec 06 §5.6.1) does not define — it calls them --oof-surface / --oof-surface2 /
// --oof-stroke / --oof-text-dim. Every colour below is therefore written as
// var(--spec-11-name, <the §5.6 fallback>): today the fallback paints, and the day the
// kit adds the names Studio picks them up with no edit. Reported as a spec conflict.

const PANEL = "var(--oof-panel, rgba(20,24,34,.92))";
const PANEL2 = "var(--oof-panel-2, rgba(34,40,54,.92))";
const TEXT = "var(--oof-text, #fff)";
const MUTED = "var(--oof-muted, rgba(255,255,255,.55))";
const ACCENT = "var(--oof-accent, #4aa8ff)";
const LINE = "var(--oof-ui-line, rgba(255,255,255,.18))";
const ON_ACCENT = "#0c0e14";

// STUDIO_COLORS — §5.6.2, exact, lowercase, in this order (6 per row).
export const STUDIO_COLORS = Object.freeze([
  "#f2f3f3", "#d5d8dd", "#a3a2a5", "#635f62", "#27282b", "#1b2a35",
  "#c4281c", "#e5793b", "#f5cd30", "#fdea9c", "#694028", "#c69c6d",
  "#75b843", "#287f47", "#a4bd47", "#1fc0c9", "#0d69ac", "#1e3f8a",
  "#6b327c", "#d2569d", "#e8bac8", "#9fc5e8", "#4a90d9", "#ffffff",
]);

const SHAPES = [
  { shape: "box", glyph: "▦", label: "Box" },
  { shape: "wedge", glyph: "◺", label: "Wedge" },
  { shape: "cylinder", glyph: "⬤", label: "Cylinder" },
  { shape: "sphere", glyph: "●", label: "Sphere" },
];

const MATERIALS = ["plastic", "neon", "metal", "grass", "lava", "ice", "glass", "wood"];

// §6's "default part sizes" row. Sphere is uniform because spec 04 rejects a
// non-uniform sphere outright, and cylinder x/z must match for the same reason.
const DEFAULT_SIZES = Object.freeze({
  box: [4, 1, 4], wedge: [4, 2, 4], cylinder: [4, 1, 4], sphere: [2, 2, 2],
});

// §6's "default new-part color/material" row.
const INITIAL_COLOR = "#a3a2a5";
const INITIAL_MATERIAL = "plastic";

// Materials with no canvas texture of their own (spec 03 §5.1 builds them from pure
// colour/emissive) get a flat swatch instead of a thumbnail, per §5.6.2.
const FLAT_THUMBS = { neon: "#7ec8ff", glass: "#cfe4ff" };

const HEX_INPUT_RE = /^#?[0-9a-fA-F]{6}$/;

function el(tag, style, text) {
  const node = document.createElement(tag);
  if (style) node.setAttribute("style", style);
  if (text !== undefined) node.textContent = text;
  return node;
}

// Draws a 40×40 preview of one material. Spec 03's getMaterial() caches a canvas
// texture per material; its `image` is that canvas, so the thumbnail is the real
// surface the part will have rather than a hand-picked approximation.
function drawThumb(canvas, partsApi, material, color) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const flat = FLAT_THUMBS[material];
  if (flat) {
    ctx.fillStyle = flat;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return;
  }
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  try {
    const mat = partsApi.getMaterial(material, color, 0);
    const image = mat && mat.map ? mat.map.image : null;
    if (image && image.width) {
      ctx.globalAlpha = 0.85; // let the part colour show through the grey-scale texture
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1;
    }
  } catch (err) {
    console.warn("[oof] material thumbnail unavailable", material, err);
  }
}

function squareButton(size, extra) {
  return "width:" + size + "px;height:" + size + "px;border-radius:10px;border:1px solid " + LINE + ";"
    + "background:" + PANEL2 + ";color:" + TEXT + ";display:flex;align-items:center;"
    + "justify-content:center;cursor:pointer;pointer-events:auto;flex:none;"
    + "font-family:inherit;padding:0;" + (extra || "");
}

// createPalette(container, opts) -> palette — §5.6.2.
// opts: { partsApi, narrow, onArm(shape), onApplyColor(hex), onApplyMaterial(name),
//         getSelectionCount() }
export function createPalette(container, opts = {}) {
  const partsApi = opts.partsApi;
  const defaults = { shape: null, material: INITIAL_MATERIAL, color: INITIAL_COLOR };
  let armed = null;
  let popover = null;

  let narrow = !!opts.narrow;
  const root = el("div", "");
  root.id = "oof-studio-palette";
  container.appendChild(root);

  // Re-applied on every breakpoint change: the owner tests on a phone, and a rotation
  // across 720 px would otherwise leave the palette in the other orientation layout.
  function applyLayout() {
    root.setAttribute("style", narrow
      ? "position:absolute;left:8px;right:8px;bottom:64px;height:64px;display:flex;gap:6px;"
        + "align-items:center;overflow-x:auto;background:" + PANEL + ";border-radius:12px;"
        + "padding:6px;pointer-events:auto;box-sizing:border-box;"
      : "position:absolute;left:8px;top:56px;bottom:8px;width:76px;display:flex;"
        + "flex-direction:column;gap:6px;align-items:center;overflow-y:auto;background:" + PANEL + ";"
        + "border-radius:12px;padding:6px;pointer-events:auto;box-sizing:border-box;");
  }
  applyLayout();

  // ---- shape buttons -------------------------------------------------------------
  const shapeButtons = new Map();
  for (const entry of SHAPES) {
    const btn = el("button", squareButton(60, "font-size:26px;"), entry.glyph);
    btn.title = entry.label;
    btn.setAttribute("aria-label", entry.label);
    btn.addEventListener("click", () => {
      closePopover();
      setArmed(armed === entry.shape ? null : entry.shape);
      if (opts.onArm) opts.onArm(armed);
    });
    root.appendChild(btn);
    shapeButtons.set(entry.shape, btn);
  }

  root.appendChild(el("div", narrow
    ? "width:1px;height:44px;background:" + LINE + ";flex:none;"
    : "height:1px;width:60px;background:" + LINE + ";flex:none;"));

  // ---- material + colour buttons -------------------------------------------------
  const matBtn = el("button", squareButton(60));
  const matCanvas = el("canvas", "width:40px;height:40px;border-radius:6px;");
  matCanvas.width = 40;
  matCanvas.height = 40;
  matBtn.appendChild(matCanvas);
  matBtn.title = "Material";
  matBtn.addEventListener("click", () => togglePopover("material"));
  root.appendChild(matBtn);

  const colorBtn = el("button", squareButton(60));
  const colorChip = el("div", "width:40px;height:40px;border-radius:6px;border:1px solid " + LINE + ";");
  colorBtn.appendChild(colorChip);
  colorBtn.title = "Colour";
  colorBtn.addEventListener("click", () => togglePopover("color"));
  root.appendChild(colorBtn);

  // ---- popovers ------------------------------------------------------------------
  function closePopover() {
    if (popover) {
      popover.remove();
      popover = null;
    }
  }

  function popoverShell() {
    const node = el("div", "position:absolute;" + (narrow ? "bottom:132px;left:8px;" : "left:92px;top:56px;")
      + "background:" + PANEL + ";border:1px solid " + LINE + ";border-radius:12px;padding:10px;"
      + "display:flex;flex-direction:column;gap:8px;pointer-events:auto;z-index:2;"
      + "max-height:70vh;overflow-y:auto;box-shadow:0 8px 24px rgba(0,0,0,.4);");
    container.appendChild(node);
    return node;
  }

  function togglePopover(which) {
    const wasOpen = popover && popover.dataset.which === which;
    closePopover();
    if (wasOpen) return;
    popover = which === "material" ? buildMaterialPopover() : buildColorPopover();
    popover.dataset.which = which;
  }

  function buildMaterialPopover() {
    const node = popoverShell();
    const grid = el("div", "display:grid;grid-template-columns:repeat(4,56px);gap:8px;");
    for (const name of MATERIALS) {
      const cell = el("button", squareButton(56, "flex-direction:column;gap:2px;"));
      const canvas = el("canvas", "width:36px;height:36px;border-radius:5px;");
      canvas.width = 36;
      canvas.height = 36;
      drawThumb(canvas, partsApi, name, defaults.color);
      cell.appendChild(canvas);
      cell.appendChild(el("div", "font-size:9px;color:" + MUTED + ";", name));
      cell.addEventListener("click", () => {
        defaults.material = name;
        refresh();
        closePopover();
        if (opts.onApplyMaterial && opts.getSelectionCount && opts.getSelectionCount() > 0) {
          opts.onApplyMaterial(name);
        }
      });
      grid.appendChild(cell);
    }
    node.appendChild(grid);
    return node;
  }

  function buildColorPopover() {
    const node = popoverShell();
    const count = opts.getSelectionCount ? opts.getSelectionCount() : 0;
    if (count > 0 && opts.onApplyColor) {
      const apply = el("button", "height:32px;border-radius:8px;border:none;background:" + ACCENT + ";"
        + "color:" + ON_ACCENT + ";font-weight:700;cursor:pointer;font-family:inherit;",
      "Apply to selection");
      apply.addEventListener("click", () => {
        opts.onApplyColor(defaults.color);
        closePopover();
      });
      node.appendChild(apply);
    }
    const grid = el("div", "display:grid;grid-template-columns:repeat(6,40px);gap:6px;");
    for (const hex of STUDIO_COLORS) {
      const swatch = el("button", "width:40px;height:40px;border-radius:8px;cursor:pointer;"
        + "border:2px solid " + (hex === defaults.color ? TEXT : "transparent") + ";background:" + hex + ";");
      swatch.title = hex;
      swatch.addEventListener("click", () => {
        defaults.color = hex;
        refresh();
        closePopover();
      });
      grid.appendChild(swatch);
    }
    node.appendChild(grid);

    const row = el("div", "display:flex;gap:6px;align-items:center;");
    const input = el("input", "width:110px;height:32px;border-radius:8px;border:1px solid " + LINE + ";"
      + "background:" + PANEL2 + ";color:" + TEXT + ";padding:0 8px;font-family:monospace;font-size:12px;");
    input.value = defaults.color;
    input.setAttribute("aria-label", "Hex colour");
    const commit = () => {
      const text = input.value.trim();
      if (!HEX_INPUT_RE.test(text)) {
        input.style.borderColor = "#e5484d";
        return;
      }
      defaults.color = ("#" + text.replace("#", "")).toLowerCase();
      input.style.borderColor = LINE;
      refresh();
    };
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") commit();
    });
    input.addEventListener("blur", commit);
    row.append(input);
    node.appendChild(row);
    return node;
  }

  function setArmed(shape) {
    armed = shape || null;
    for (const [name, btn] of shapeButtons) {
      const on = name === armed;
      btn.style.background = on ? ACCENT : PANEL2;
      btn.style.color = on ? ON_ACCENT : TEXT;
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    }
  }

  function refresh() {
    drawThumb(matCanvas, partsApi, defaults.material, defaults.color);
    colorChip.style.background = defaults.color;
  }

  refresh();
  setArmed(null);

  return {
    el: root,
    getDefaults: () => ({ shape: armed, material: defaults.material, color: defaults.color }),
    defaultSizeFor: (shape) => (DEFAULT_SIZES[shape] || DEFAULT_SIZES.box).slice(),
    setArmed,
    getArmed: () => armed,
    setColor(hex) {
      defaults.color = hex;
      refresh();
    },
    setMaterial(name) {
      defaults.material = name;
      refresh();
    },
    closePopover,
    setNarrow(value) {
      narrow = !!value;
      closePopover();
      applyLayout();
    },
    dispose() {
      closePopover();
      root.remove();
    },
  };
}
