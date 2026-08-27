// src/platform/studio/worldpanel.js — the 🌍 panel: spawn, fall limit, lighting preset,
// music. Spec 11 §5.6.4 and §5.6.5.
//
// Six lighting presets and no raw fields (§10 defers field-by-field editing): a child
// picking "Night" from six pictures gets a world that looks right; the same child given
// eight hex inputs and a sun vector gets a black screen.
//
// Style note: see palette.js's header for why every colour is var(name, fallback).

const PANEL = "var(--oof-panel, rgba(20,24,34,.92))";
const PANEL2 = "var(--oof-panel-2, rgba(34,40,54,.92))";
const TEXT = "var(--oof-text, #fff)";
const MUTED = "var(--oof-muted, rgba(255,255,255,.55))";
const ACCENT = "var(--oof-accent, #4aa8ff)";
const LINE = "var(--oof-ui-line, rgba(255,255,255,.18))";
const ON_ACCENT = "#0c0e14";

// STUDIO_LIGHTING_PRESETS — §5.6.5, verbatim. `day` is null: omitting the lighting
// block is what asks the engine for its own defaults (spec 04 §3.3).
export const STUDIO_LIGHTING_PRESETS = Object.freeze({
  day: null,
  sunset: {
    skyTop: "#2a1f3d", skyBottom: "#ff8a50", ambient: "#8a6a8f",
    ambientIntensity: 0.7, sunColor: "#ffb070", sunIntensity: 1.2,
    sunDirection: [-0.3, -0.5, -0.4], fog: { color: "#c06a48", near: 150, far: 420 },
  },
  night: {
    skyTop: "#0a0e1c", skyBottom: "#1c2440", ambient: "#3a4468",
    ambientIntensity: 0.5, sunColor: "#aac0ff", sunIntensity: 0.35,
    sunDirection: [-0.4, -1, -0.2], fog: { color: "#101528", near: 100, far: 300 },
  },
  overcast: {
    skyTop: "#9aa5b1", skyBottom: "#d8dde3", ambient: "#aab4c0",
    ambientIntensity: 0.8, sunColor: "#e8ecf2", sunIntensity: 0.6,
    sunDirection: [-0.5, -1, -0.3], fog: { color: "#c5ccd4", near: 120, far: 380 },
  },
  lava: {
    skyTop: "#1c0f0a", skyBottom: "#5c231a", ambient: "#6b3020",
    ambientIntensity: 0.6, sunColor: "#ff9a50", sunIntensity: 1.0,
    sunDirection: [-0.2, -0.8, -0.3], fog: { color: "#3a1610", near: 90, far: 260 },
  },
  ice: {
    skyTop: "#bfe3ff", skyBottom: "#eaf6ff", ambient: "#cfe0f0",
    ambientIntensity: 0.9, sunColor: "#ffffff", sunIntensity: 1.1,
    sunDirection: [-0.5, -1, -0.2], fog: { color: "#dceefc", near: 140, far: 500 },
  },
});

// PLACE_LIGHTING_DEFAULTS — spec 04 §3.3's Place-level defaults, transcribed. These are
// NOT renderer.js's own LIGHTING_DEFAULTS (spec 02 §5.2, skyTop #4aa8ff): place.js
// merges a Place's lighting block against THIS table before it ever calls applyLighting,
// so a `lighting: null` Place loads as #87ceeb sky, not #4aa8ff.
//
// SPEC AMENDMENT (§5.1 step 4, §5.6.5's `day: null` comment — both amended in this
// change): Studio used to hand `doc.world.lighting ?? {}` straight to applyLighting,
// which resolves the gaps against renderer.js's table instead. Edit mode therefore
// painted one Day and playtest painted another, and this panel's Day card — drawn from
// §3.3 all along — matched only the playtest one. Everything that lights EDIT mode goes
// through mergePlaceLighting() now, so the three agree by construction.
export const PLACE_LIGHTING_DEFAULTS = Object.freeze({
  skyTop: "#87ceeb",
  skyBottom: "#e6f2ff",
  ambient: "#9db2c9",
  ambientIntensity: 0.6,
  sunColor: "#fff4e0",
  sunIntensity: 1.0,
  sunDirection: Object.freeze([-0.5, -1, -0.3]),
  fog: null,
});

// mergePlaceLighting(lighting) -> the fully-merged block, exactly as place.js's own
// mergeLighting builds it for a real Place load (that function is private to
// src/engine/place.js and Studio may not export it from there).
export function mergePlaceLighting(lighting) {
  const u = lighting || {};
  const d = PLACE_LIGHTING_DEFAULTS;
  return {
    skyTop: u.skyTop !== undefined ? u.skyTop : d.skyTop,
    skyBottom: u.skyBottom !== undefined ? u.skyBottom : d.skyBottom,
    ambient: u.ambient !== undefined ? u.ambient : d.ambient,
    ambientIntensity: u.ambientIntensity !== undefined ? u.ambientIntensity : d.ambientIntensity,
    sunColor: u.sunColor !== undefined ? u.sunColor : d.sunColor,
    sunIntensity: u.sunIntensity !== undefined ? u.sunIntensity : d.sunIntensity,
    sunDirection: (u.sunDirection !== undefined ? u.sunDirection : d.sunDirection).slice(),
    fog: u.fog !== undefined ? u.fog : d.fog,
  };
}

const PRESET_NAMES = { day: "Day", sunset: "Sunset", night: "Night", overcast: "Overcast", lava: "Lava", ice: "Ice" };
const PRESET_ORDER = ["day", "sunset", "night", "overcast", "lava", "ice"];
// Day has no preset object to draw its gradient strip from (`day` is null), so the card
// shows what a null lighting block actually resolves to — the same table edit mode and
// playtest now light the world with, not a second copy of two hex strings.
const DAY_STRIP = [PLACE_LIGHTING_DEFAULTS.skyTop, PLACE_LIGHTING_DEFAULTS.skyBottom];

const TRACKS = [
  { id: null, label: "None" },
  { id: "plaza", label: "Plaza" },
  { id: "ascent", label: "Ascent" },
  { id: "pump", label: "Pump" },
  { id: "cashflow", label: "Cashflow" },
];

const KILL_Y_MIN = -10000;
const KILL_Y_MAX = 0;

function el(tag, style, text) {
  const node = document.createElement(tag);
  if (style) node.setAttribute("style", style);
  if (text !== undefined) node.textContent = text;
  return node;
}

const BTN = "height:32px;border-radius:8px;border:1px solid " + LINE + ";background:" + PANEL2
  + ";color:" + TEXT + ";font-family:inherit;font-size:13px;cursor:pointer;padding:0 10px;";
const FIELD = "height:32px;border-radius:8px;border:1px solid " + LINE + ";background:" + PANEL2
  + ";color:" + TEXT + ";padding:0 8px;font-family:inherit;font-size:13px;width:90px;text-align:center;";
const SECTION_LABEL = "font-size:11px;color:" + MUTED + ";margin:12px 0 4px;letter-spacing:.04em;";

// Deep equality against the frozen presets is how the active card is detected (§5.6.5):
// an imported Place with custom lighting simply matches none of them, which is fine.
function sameLighting(a, b) {
  return JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);
}

// createWorldPanel(container, opts) -> panel — §5.6.4.
// opts: { editor, audio, narrow }
export function createWorldPanel(container, opts = {}) {
  const ed = opts.editor;
  const audio = opts.audio;
  let narrow = !!opts.narrow;
  let open = false;
  let previewing = null; // track id currently auditioned by the 🔊 button

  const button = el("button", "position:absolute;left:8px;top:56px;width:44px;height:44px;"
    + "border-radius:12px;border:1px solid " + LINE + ";background:" + PANEL + ";color:" + TEXT
    + ";font-size:18px;cursor:pointer;pointer-events:auto;", "🌍");
  button.title = "World settings";
  button.id = "oof-studio-world-btn";
  container.appendChild(button);

  const root = el("div", "");
  root.id = "oof-studio-world";
  container.appendChild(root);

  function applyLayout() {
    root.setAttribute("style", (narrow
      ? "position:absolute;left:0;right:0;bottom:0;height:55vh;border-radius:12px 12px 0 0;"
      : "position:absolute;left:60px;top:56px;bottom:8px;width:280px;border-radius:12px;")
      + "background:" + PANEL + ";padding:10px;overflow-y:auto;pointer-events:auto;"
      + "display:" + (open ? "block" : "none") + ";");
  }

  // Music preview never survives the panel closing, entering playtest, or Studio
  // closing (§5.6.4) — edit mode is silent, and a track left running under the editor
  // would be a bug nobody could find the off switch for.
  function stopPreview() {
    if (previewing && audio) audio.playMusic(null);
    previewing = null;
  }

  function commitWorld(key, value) {
    ed.applyWorld(key, value);
    render();
  }

  // `grain` is what a TYPED number is rounded to before it is committed: §5.6.4's step
  // for both of these fields. Rounding goes through the editor's snapper — the same one
  // gizmo drags use — so the result can never sit off §3.4's quanta or carry float noise
  // (spawnYaw quantises to 1°, a divisor of its 15° step; killY is packed as-is).
  // The comparison is made AFTER rounding: typing 10 into a 15° facing rounds back to
  // the 15 that is already there, and committing that pushed an undo step which undid
  // nothing — the builder then had to press undo twice to lose one real edit.
  function numberRow(labelText, value, grain, min, max, onCommit) {
    const row = el("div", "display:flex;gap:6px;align-items:center;");
    row.appendChild(el("div", "flex:1;font-size:13px;color:" + TEXT + ";", labelText));
    const input = el("input", FIELD);
    input.type = "text";
    input.inputMode = "decimal";
    input.value = String(value);
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") input.blur();
    });
    input.addEventListener("blur", () => {
      const parsed = Number(input.value);
      if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
        input.value = String(value);
        if (typeof input.animate === "function") {
          input.animate([{ borderColor: "#e5484d" }, { borderColor: LINE }], { duration: 300 });
        }
        return;
      }
      const next = ed.snapToQuantum(parsed, grain);
      input.value = String(next); // §5.6.3: the field always shows the snapped value
      if (next !== value) onCommit(next);
    });
    row.appendChild(input);
    return row;
  }

  function lightingCard(key) {
    const preset = STUDIO_LIGHTING_PRESETS[key];
    const strip = preset ? [preset.skyTop, preset.skyBottom] : DAY_STRIP;
    const active = sameLighting(ed.doc.world.lighting, preset);
    const card = el("button", "width:120px;height:56px;border-radius:10px;cursor:pointer;padding:0;"
      + "border:2px solid " + (active ? ACCENT : LINE) + ";background:" + PANEL2 + ";overflow:hidden;"
      + "display:flex;flex-direction:column;");
    card.appendChild(el("div", "flex:1;background:linear-gradient(" + strip[0] + "," + strip[1] + ");"));
    card.appendChild(el("div", "font-size:11px;color:" + TEXT + ";height:18px;line-height:18px;",
      PRESET_NAMES[key]));
    card.addEventListener("click", () => {
      commitWorld("lighting", preset ? JSON.parse(JSON.stringify(preset)) : null);
    });
    return card;
  }

  function render() {
    applyLayout();
    if (!open) return;
    root.textContent = "";

    const header = el("div", "display:flex;align-items:center;gap:6px;");
    header.appendChild(el("div", "flex:1;font-size:15px;font-weight:700;color:" + TEXT + ";", "World"));
    const close = el("button", BTN + "width:32px;padding:0;", "✕");
    close.addEventListener("click", () => panel.setOpen(false));
    header.appendChild(close);
    root.appendChild(header);

    // ---- spawn --------------------------------------------------------------------
    root.appendChild(el("div", SECTION_LABEL, "SPAWN"));
    root.appendChild(el("div", "font-size:12px;color:" + MUTED + ";",
      "Move the green pad to set where players start."));
    const bring = el("button", BTN + "width:100%;margin-top:6px;", "Bring pad to camera");
    bring.addEventListener("click", () => {
      ed.bringSpawnToCamera();
      render();
    });
    root.appendChild(bring);
    root.appendChild(numberRow("Facing (°)", ed.doc.world.spawnYaw || 0, 15, -360, 360,
      (v) => commitWorld("spawnYaw", v)));

    // ---- fall limit ---------------------------------------------------------------
    root.appendChild(el("div", SECTION_LABEL, "FALL LIMIT"));
    root.appendChild(numberRow("Kill below Y", ed.doc.world.killY, 5, KILL_Y_MIN, KILL_Y_MAX,
      (v) => commitWorld("killY", v)));

    // ---- lighting -----------------------------------------------------------------
    root.appendChild(el("div", SECTION_LABEL, "LIGHTING"));
    const cards = el("div", "display:flex;flex-wrap:wrap;gap:6px;");
    for (const key of PRESET_ORDER) cards.appendChild(lightingCard(key));
    root.appendChild(cards);

    // ---- music --------------------------------------------------------------------
    root.appendChild(el("div", SECTION_LABEL, "MUSIC"));
    const musicRow = el("div", "display:flex;flex-wrap:wrap;gap:4px;");
    for (const track of TRACKS) {
      const active = (ed.doc.world.music || null) === track.id;
      const btn = el("button", BTN, track.label);
      btn.style.background = active ? ACCENT : PANEL2;
      btn.style.color = active ? ON_ACCENT : TEXT;
      btn.addEventListener("click", () => {
        stopPreview();
        commitWorld("music", track.id);
      });
      musicRow.appendChild(btn);
    }
    root.appendChild(musicRow);

    const preview = el("button", BTN + "margin-top:6px;", previewing ? "◼ stop" : "🔊 preview");
    preview.addEventListener("click", () => {
      const id = ed.doc.world.music || null;
      if (previewing || !id) {
        stopPreview();
      } else if (audio) {
        audio.playMusic(id);
        previewing = id;
      }
      render();
    });
    root.appendChild(preview);
  }

  button.addEventListener("click", () => panel.setOpen(!open));

  const panel = {
    el: root,
    isOpen: () => open,
    setOpen(value) {
      open = !!value;
      if (!open) stopPreview();
      render();
    },
    refresh: () => render(),
    setNarrow(value) {
      narrow = !!value;
      render();
    },
    stopPreview,
    dispose() {
      stopPreview();
      root.remove();
      button.remove();
    },
  };

  applyLayout();
  return panel;
}
