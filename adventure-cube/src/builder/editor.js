// builder/editor.js - BUILD MODE: the level editor screen. BUILDER owns (CONTRACT.md section 10).
// Palette of every tile / entity / marker, paint-erase-rect-pick-select-pan tools, entity inspector with path
// editing, pan + zoom (mouse, wheel, keyboard, two-finger touch), undo/redo, level settings (name, theme, music with
// preview, size), local drafts with autosave, test play (from the start or from the cursor), publish flow
// (validate -> must clear -> AI rating in a Worker -> publish) and "watch the AI play" replays.
import { createSim, emptyLevel, normalizeLevel, validateLevel, packLevel, unpackLevel, LIMITS, T, PW, PH, STEP_MS, charToCode, isFullSolid } from "../sim/index.js";
import { THEMES } from "../sim/constants.js";
import { createCamera } from "../render/camera.js";
import { SONGS, songInfo } from "../audio/songs/index.js";
import {
  ensureCss, esc, el, toast, fmtMs, timeAgo, badge, playHash, loadDrafts, saveDrafts, newDraftId, draftLevel,
  drawMinimap, makeThumbCanvas, drawTheme, THEME_NAMES, reasonText,
} from "./common.js";
import { GROUPS, BRUSHES, brushById, brushForTile, brushForEntity, makeEntity, hitEntity, entityBox, FIELDS, ENTITY_NAMES, clampField, fixPulse } from "./palette.js";
import { openPublish } from "./publish.js";

const ICON = {
  back: '<path d="M15 5l-7 7 7 7"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/>',
  redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 000 12h3"/>',
  paint: '<path d="M4 20c2 0 4-1 4-4l9-9 3 3-9 9c-3 0-4 2-4 4"/><path d="M14 6l4 4"/>',
  erase: '<path d="M8 20h12"/><path d="M5 15l8-8 6 6-6 6H9z"/>',
  rect: '<rect x="4" y="6" width="16" height="12" rx="1"/><path d="M4 12h16M12 6v12" opacity=".5"/>',
  pick: '<path d="M14 4l6 6-2 2-6-6z"/><path d="M13 9l-8 8v3h3l8-8"/>',
  select: '<path d="M5 3l14 8-6 2-3 6z"/>',
  hand: '<path d="M8 13V6a1.5 1.5 0 013 0v5M11 11V4.5a1.5 1.5 0 013 0V11M14 11V6a1.5 1.5 0 013 0v7c0 4-3 7-6 7s-5-2-7-5l-1.5-2.5a1.5 1.5 0 012.5-1.5L8 13"/>',
  play: '<path d="M7 4l13 8-13 8z"/>',
  here: '<circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
  up: '<path d="M12 19V6M6 11l6-6 6 6"/>',
  menu: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  gear: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>',
  grid: '<path d="M4 4h16v16H4zM4 10h16M4 15h16M10 4v16M15 4v16" opacity=".9"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>', note: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="1"/>', fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  chev: '<path d="M6 9l6 6 6-6"/>', path: '<circle cx="5" cy="18" r="2"/><circle cx="19" cy="6" r="2"/><path d="M7 17c6-1 4-9 10-10" stroke-dasharray="3 3"/>',
};
const ico = (n) => `<svg class="acb-ico" viewBox="0 0 24 24" aria-hidden="true">${ICON[n] || ""}</svg>`;
const TOOLS = [
  { id: "paint", name: "Paint", key: "B" }, { id: "erase", name: "Erase", key: "E" }, { id: "rect", name: "Rectangle fill", key: "R" },
  { id: "pick", name: "Eyedropper", key: "I" }, { id: "select", name: "Select / move", key: "V" }, { id: "hand", name: "Pan", key: "H" },
];
const SIZES = [{ id: "s", name: "Small", w: 80, h: 24 }, { id: "m", name: "Medium", w: 160, h: 30 }, { id: "l", name: "Large", w: 260, h: 36 }, { id: "xl", name: "Huge", w: 400, h: 48 }];
const MUSIC_PREF = "adventurecube.builder.music";
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const isTyping = (t) => t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);

export function createBuilderScreen(app) {
  const canvas = app.canvas;
  const camera = createCamera();
  // ---- persistent editor state (survives exit/enter so test play can resume) ----
  let level = null, draft = null, drafts = null;
  let tool = "paint", brush = brushById("t#"), lastPaintBrush = brush, group = "terrain";
  let selected = -1, selMarker = null, pathEdit = false, grid = true, showPaths = true;
  let undo = [], redo = [], pre = null;
  let camKey = "";                 // the draft whose camera position we hold
  let ratingInputs = new Map();    // playHash -> Uint8Array (AI solution, memory only)
  let testCtx = null, replay = null;
  let musicOn = true, palOpen = true;
  // ---- per-visit state ----
  let root = null, dirtyT = 0, saveTimer = 0, hover = null, rect = null, listeners = [], spaceHeld = false;
  const keysHeld = new Set();
  const pointers = new Map();
  let gesture = null;          // { mode: "tool"|"pan"|"pinch"|"pending"|"rect"|"drag"|"none", ... }
  let frameN = 0, lastStatus = "";
  const view = { mode: "edit", level: null, sim: null, frame: 0, alpha: 1, prev: null, camera, time: 0, dt: 0, events: [], editor: null };
  const edView = { grid: true, hover: null, ghost: null, selected: -1, showPaths: true, tool: "paint", rect: null, marker: undefined };
  const NOEV = [];

  const on = (target, type, fn, opts) => { target.addEventListener(type, fn, opts); listeners.push([target, type, fn, opts]); };
  const $ = (s) => root && root.querySelector(s);

  // =============================================================================================================
  // drafts
  function snapshotDraft() {
    if (!draft || !level) return;
    draft.name = level.name; draft.t = Date.now(); draft.data = packLevel(level);
    if (!drafts.list.includes(draft)) drafts.list.unshift(draft);
    drafts.cur = draft.id;
    saveDrafts(app.storage, drafts);
    dirtyT = 0;
  }
  function scheduleSave() { dirtyT = Date.now(); clearTimeout(saveTimer); saveTimer = setTimeout(snapshotDraft, 700); }
  function saveNow() { clearTimeout(saveTimer); if (dirtyT || (draft && !draft.data)) snapshotDraft(); }
  function openDraft(d, lv) {
    saveNow();
    ver++; draft = d; level = normalizeLevel(lv || draftLevel(d) || emptyLevel({ w: 80, h: 24, name: "My level" }));
    undo = []; redo = []; pre = null; selected = -1; selMarker = null; pathEdit = false;
    app.renderer.setLevel(level);
    camKey = ""; frameCamera();
    snapshotDraft();
    refreshAll();
  }
  function newLevel(opts = {}) {
    const name = opts.name || nextName();
    const lv = emptyLevel({ w: opts.w || 80, h: opts.h || 24, theme: opts.theme || "forest", music: opts.music || "area1", name });
    addStarter(lv);
    openDraft({ id: newDraftId(), name, t: Date.now(), data: "", publishedId: null, cleared: null, clearMs: 0, rating: null }, lv);
  }
  function nextName() {
    const used = new Set(drafts.list.map((d) => d.name));
    for (let i = 1; ; i++) { const n = i === 1 ? "My level" : "My level " + i; if (!used.has(n)) return n; }
  }
  // a tiny friendly starter: a rock to hop and a sign
  function addStarter(lv) {
    const g = lv.h - 4;
    setRow(lv, g, 12, "RR"); setRow(lv, g - 1, 13, "R");
    lv.entities.push({ t: "sign", x: 6, y: g, text: "Build your level, then test it!" });
  }
  function setRow(lv, y, x, s) { const r = lv.tiles[y]; lv.tiles[y] = r.slice(0, x) + s + r.slice(x + s.length); }

  // =============================================================================================================
  // history (whole-level snapshots; rows are immutable strings so a tile snapshot is just an array copy)
  const snap = () => ({ tiles: level.tiles.slice(), entities: JSON.stringify(level.entities), start: { ...level.start }, goal: { ...level.goal },
    checkpoints: JSON.stringify(level.checkpoints), w: level.w, h: level.h, name: level.name, theme: level.theme, music: level.music });
  function same(a, b) {
    if (a.w !== b.w || a.h !== b.h || a.entities !== b.entities || a.checkpoints !== b.checkpoints || a.name !== b.name || a.theme !== b.theme || a.music !== b.music) return false;
    if (a.start.x !== b.start.x || a.start.y !== b.start.y || a.goal.x !== b.goal.x || a.goal.y !== b.goal.y) return false;
    for (let i = 0; i < a.tiles.length; i++) if (a.tiles[i] !== b.tiles[i]) return false;
    return true;
  }
  function begin() { if (!pre) pre = snap(); }
  function commit() {
    if (!pre) return;
    const now = snap();
    if (!same(pre, now)) { undo.push(pre); if (undo.length > 150) undo.shift(); redo = []; changed(); }
    pre = null;
  }
  function cancelEdit() { if (pre) { apply(pre); pre = null; } }
  function apply(s) {
    const old = { w: level.w, h: level.h, theme: level.theme, tiles: level.tiles };
    level.tiles = s.tiles.slice(); level.entities = JSON.parse(s.entities); level.checkpoints = JSON.parse(s.checkpoints);
    level.start = { ...s.start }; level.goal = { ...s.goal }; level.w = s.w; level.h = s.h; level.name = s.name; level.theme = s.theme; level.music = s.music;
    if (old.w !== level.w || old.h !== level.h || old.theme !== level.theme) app.renderer.setLevel(level);
    else {
      let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
      for (let y = 0; y < level.h; y++) {
        const a = old.tiles[y], b = level.tiles[y]; if (a === b) continue;
        let i = 0; while (i < a.length && a[i] === b[i]) i++;
        let j = a.length - 1; while (j > i && a[j] === b[j]) j--;
        x0 = Math.min(x0, i); x1 = Math.max(x1, j); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
      if (x1 >= 0) { if ((x1 - x0 + 1) * (y1 - y0 + 1) > 4000) app.renderer.setLevel(level); else app.renderer.updateTiles(level, x0, y0, x1, y1); }
    }
    if (selected >= level.entities.length) selected = -1;
    if (selMarker && selMarker.type === "cp" && selMarker.i >= level.checkpoints.length) selMarker = null;
  }
  function doUndo() { if (gesture && gesture.mode === "tool") return; commit(); const s = undo.pop(); if (!s) return; redo.push(snap()); apply(s); changed(); app.audio.sfx("click"); }
  function doRedo() { commit(); const s = redo.pop(); if (!s) return; undo.push(snap()); apply(s); changed(); app.audio.sfx("click"); }
  let ver = 0, hashVer = -1, hashVal = "";
  function curHash() { if (hashVer !== ver) { hashVal = playHash(level); hashVer = ver; } return hashVal; }
  function changed() { ver++; scheduleSave(); refreshInspector(); refreshStatus(true); refreshTop(); if (root) { const m = $(".acb-title"); if (m) m.textContent = level.name || "Untitled"; } }

  // =============================================================================================================
  // level edits
  const inB = (tx, ty) => tx >= 0 && ty >= 0 && tx < level.w && ty < level.h;
  const tileAt = (tx, ty) => (inB(tx, ty) ? level.tiles[ty][tx] : ".");
  function setTile(tx, ty, ch) {
    if (!inB(tx, ty)) return false;
    const r = level.tiles[ty]; if (r[tx] === ch) return false;
    level.tiles[ty] = r.slice(0, tx) + ch + r.slice(tx + 1);
    return true;
  }
  function paintCell(tx, ty, br) {
    if (br.kind === "tile") { if (setTile(tx, ty, br.tile)) app.renderer.updateTiles(level, tx, ty, tx, ty); }
    else if (br.kind === "pair") { const a = setTile(tx, ty, br.pair[0]), b = setTile(tx + 1, ty, br.pair[1]); if (a || b) app.renderer.updateTiles(level, tx, ty, Math.min(level.w - 1, tx + 1), ty); }
  }
  function eraseCell(tx, ty) {
    const i = hitEntity(level.entities, tx + 0.5, ty + 0.5);
    if (i >= 0) { removeEntity(i); return; }
    const ci = level.checkpoints.findIndex((c) => c.x === tx && (c.y === ty || c.y - 1 === ty));
    if (ci >= 0) { level.checkpoints.splice(ci, 1); selMarker = null; return; }
    if (setTile(tx, ty, ".")) app.renderer.updateTiles(level, tx, ty, tx, ty);
  }
  function removeEntity(i) {
    level.entities.splice(i, 1);
    if (selected === i) { selected = -1; pathEdit = false; } else if (selected > i) selected--;
  }
  function fillRect(r, ch) {
    const x0 = clamp(Math.min(r.x0, r.x1), 0, level.w - 1), x1 = clamp(Math.max(r.x0, r.x1), 0, level.w - 1);
    const y0 = clamp(Math.min(r.y0, r.y1), 0, level.h - 1), y1 = clamp(Math.max(r.y0, r.y1), 0, level.h - 1);
    for (let y = y0; y <= y1; y++) {
      const row = level.tiles[y];
      let seg = "";
      for (let x = x0; x <= x1; x++) seg += ch.length === 2 ? ch[(x - x0) & 1] : ch;
      level.tiles[y] = row.slice(0, x0) + seg + row.slice(x1 + 1);
    }
    if (ch === ".") level.entities = level.entities.filter((e, i) => {
      const b = entityBox(e), keep = !(b[0] >= x0 && b[2] <= x1 + 1 && b[1] >= y0 - 0.5 && b[3] <= y1 + 1);
      if (!keep && i === selected) selected = -1;
      return keep;
    });
    app.renderer.updateTiles(level, x0, y0, x1, y1);
  }
  function placeEntity(br, tx, ty) {
    if (level.entities.length >= LIMITS.communityMaxEntities) { toast(root, `Entity limit reached (${LIMITS.communityMaxEntities})`, "warn"); return; }
    const same = level.entities.findIndex((e) => e.t === br.entity && e.x === tx && e.y === ty);
    if (same >= 0) { select(same); return; }
    const e = makeEntity(br, tx, ty); if (!e) return;
    begin(); level.entities.push(e); commit();
    select(level.entities.length - 1, true);
    app.audio.sfx("place");
  }
  function placeMarker(m, tx, ty) {
    if (!inB(tx, ty)) return;
    const c = charToCode(tileAt(tx, ty));
    if (isFullSolid(c) || c >= 12) { toast(root, "Flags must go in an empty cell", "warn"); return; }
    begin();
    if (m === "start") level.start = { x: tx, y: ty };
    else if (m === "goal") level.goal = { x: tx, y: ty };
    else {
      const i = level.checkpoints.findIndex((p) => p.x === tx && p.y === ty);
      if (i >= 0) { level.checkpoints.splice(i, 1); commit(); app.audio.sfx("erase"); return; }
      if (level.checkpoints.length >= LIMITS.communityMaxCheckpoints) { pre = null; toast(root, `Max ${LIMITS.communityMaxCheckpoints} checkpoints`, "warn"); return; }
      level.checkpoints.push({ x: tx, y: ty }); level.checkpoints.sort((a, b) => a.x - b.x || a.y - b.y);
    }
    commit(); app.audio.sfx("place");
  }
  function markerAt(tx, ty) {
    if (level.start.x === tx && level.start.y === ty) return { type: "start" };
    if (level.goal.x === tx && ty <= level.goal.y && ty >= level.goal.y - 2) return { type: "goal" };
    const i = level.checkpoints.findIndex((c) => c.x === tx && (ty === c.y || ty === c.y - 1));
    return i >= 0 ? { type: "cp", i } : null;
  }
  function resizeLevel(nw, nh) {
    nw = clamp(nw | 0, LIMITS.minW, LIMITS.communityMaxW); nh = clamp(nh | 0, LIMITS.minH, LIMITS.communityMaxH);
    if (nw === level.w && nh === level.h) return;
    begin();
    const dy = nh - level.h;
    let rows = level.tiles.slice();
    if (dy > 0) for (let i = 0; i < dy; i++) rows.unshift(".".repeat(level.w)); else rows = rows.slice(-dy);
    rows = rows.map((r) => {
      if (nw <= r.length) return r.slice(0, nw);
      const last = r[r.length - 1], ext = last === "#" || last === "R" || last === "W" || last === "B" || last === "~" ? last : ".";
      return r + ext.repeat(nw - r.length);
    });
    level.tiles = rows; level.w = nw; level.h = nh;
    const fix = (p) => ({ x: clamp(p.x, 0, nw - 1), y: clamp(p.y + dy, 0, nh - 1) });
    level.start = fix(level.start); level.goal = fix(level.goal);
    level.checkpoints = level.checkpoints.map((c) => ({ x: c.x, y: c.y + dy })).filter((c) => c.x < nw && c.y >= 0 && c.y < nh);
    level.entities = level.entities.map((e) => Object.assign(e, { y: e.y + dy })).filter((e) => e.x >= 0 && e.x < nw && e.y >= 0 && e.y < nh);
    selected = -1; selMarker = null;
    app.renderer.setLevel(level);
    commit();
  }

  // =============================================================================================================
  // camera
  function frameCamera() {
    camera.setViewport(app.viewW, app.viewH);
    camera.zoom = camera.fitZoom() * (app.viewW < 760 ? 0.62 : 0.8);
    // level's bottom-left corner just inside the free area (tool column on the left, palette/status at the bottom)
    const narrow = app.viewW < 760, padL = narrow ? 56 : 62, padB = narrow ? 200 : 52;
    camera.x = (app.viewW / 2 - padL) / camera.zoom; camera.y = level.h * T - (app.viewH / 2 - padB) / camera.zoom;
    clampCam(); camKey = draft ? draft.id : "";
  }
  function clampCam() {
    const W = level.w * T, H = level.h * T, mx = camera.halfW * 0.7, my = camera.halfH * 0.7;
    camera.x = W < camera.halfW * 2 - mx * 2 ? W / 2 : clamp(camera.x, camera.halfW - mx, W - camera.halfW + mx);
    camera.y = H < camera.halfH * 2 - my * 2 ? H / 2 : clamp(camera.y, camera.halfH - my, H - camera.halfH + my);
  }
  function zoomBy(f, sx = app.viewW / 2, sy = app.viewH / 2) { camera.zoomAt(f, sx, sy); camera.zoom = clamp(camera.zoom, 0.25, 3); clampCam(); }
  function fitAll() {
    camera.setViewport(app.viewW, app.viewH);
    const pad = app.viewW < 760 ? 1.0 : 1.15;
    camera.zoom = clamp(Math.min(app.viewW / (level.w * T * pad), app.viewH / (level.h * T * pad * 1.25)), 0.25, 3);
    camera.x = level.w * T / 2; camera.y = level.h * T / 2; clampCam();
  }
  const cellOf = (sx, sy) => { const w = camera.screenToWorld(sx, sy); return { tx: Math.floor(w.x / T), ty: Math.floor(w.y / T), fx: w.x / T, fy: w.y / T }; };
  const localXY = (e) => { const b = canvas.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; };

  // =============================================================================================================
  // selection + tools
  function select(i, silent) {
    selected = i; selMarker = null; if (i < 0) pathEdit = false;
    refreshInspector();
    if (!silent && i >= 0) app.audio.sfx("click");
  }
  function setTool(t) {
    tool = t; if (t !== "select") pathEdit = false;
    refreshTools(); refreshStatus(true);
  }
  function setBrush(b) {
    brush = b; lastPaintBrush = b; group = b.group;
    if (tool !== "rect" || (b.kind !== "tile" && b.kind !== "pair")) tool = "paint";
    pathEdit = false;
    refreshPalette(); refreshTools(); refreshStatus(true);
    app.audio.sfx("click");
  }
  function pick(tx, ty, fx, fy) {
    const i = hitEntity(level.entities, fx, fy);
    let b = i >= 0 ? brushForEntity(level.entities[i]) : null;
    if (!b) { const m = markerAt(tx, ty); if (m) b = brushById(m.type === "cp" ? "kcheckpoint" : "k" + m.type); }
    if (!b) { const ch = tileAt(tx, ty); if (ch !== ".") b = brushForTile(ch); }
    if (b) setBrush(b); else toast(root, "Nothing to pick there");
  }

  function toolDown(sx, sy, e) {
    const c = cellOf(sx, sy);
    if (pathEdit && selected >= 0) { addPathPoint(c.tx, c.ty); return { mode: "none" }; }
    switch (tool) {
      case "paint":
        if (brush.kind === "entity") { if (inB(c.tx, c.ty)) placeEntity(brush, c.tx, c.ty); return { mode: "none" }; }
        if (brush.kind === "marker") { placeMarker(brush.marker, c.tx, c.ty); return { mode: "none" }; }
        begin(); paintCell(c.tx, c.ty, brush); app.audio.sfx("place", { vol: 0.5 });
        return { mode: "tool", lx: c.tx, ly: c.ty, sx0: c.tx, t0: performance.now(), erase: false };
      case "erase":
        begin(); eraseCell(c.tx, c.ty); app.audio.sfx("erase", { vol: 0.5 });
        return { mode: "tool", lx: c.tx, ly: c.ty, sx0: c.tx, t0: performance.now(), erase: true };
      case "rect": {
        const ch = e && (e.shiftKey || e.button === 2) ? "." : brush.kind === "tile" ? brush.tile : brush.kind === "pair" ? brush.pair : ".";
        rect = { x0: c.tx, y0: c.ty, x1: c.tx, y1: c.ty, ch };
        return { mode: "rect", t0: performance.now() };
      }
      case "pick": pick(c.tx, c.ty, c.fx, c.fy); return { mode: "none" };
      case "select": {
        const i = hitEntity(level.entities, c.fx, c.fy);
        if (i >= 0) { select(i); begin(); const en = level.entities[i]; return { mode: "drag", what: "e", i, ox: c.tx - Math.floor(en.x), oy: c.ty - Math.floor(en.y), t0: performance.now() }; }
        const m = markerAt(c.tx, c.ty);
        if (m) { selected = -1; selMarker = m; refreshInspector(); begin(); return { mode: "drag", what: m.type, i: m.i, oy: m.type === "goal" ? c.ty - level.goal.y : m.type === "cp" ? c.ty - level.checkpoints[m.i].y : 0, t0: performance.now() }; }
        if (selected >= 0 || selMarker) { selected = -1; selMarker = null; pathEdit = false; refreshInspector(); }
        return { mode: "pan", px: sx, py: sy };
      }
      case "hand": return { mode: "pan", px: sx, py: sy };
    }
    return { mode: "none" };
  }
  function toolMove(sx, sy) {
    const g = gesture, c = cellOf(sx, sy);
    if (g.mode === "tool") {
      if (c.tx === g.lx && c.ty === g.ly) return;
      // walk the line between the last and this cell so fast strokes leave no holes
      let x = g.lx, y = g.ly; const dx = Math.abs(c.tx - x), dy = -Math.abs(c.ty - y), sxn = x < c.tx ? 1 : -1, syn = y < c.ty ? 1 : -1;
      let err = dx + dy, n = 0;
      while (n++ < 2000) {
        if (x === c.tx && y === c.ty) break;
        const e2 = 2 * err; if (e2 >= dy) { err += dy; x += sxn; } if (e2 <= dx) { err += dx; y += syn; }
        if (g.erase) eraseCell(x, y);
        else if (brush.kind === "pair") { if (((x - g.sx0) & 1) === 0) paintCell(x, y, brush); }
        else paintCell(x, y, brush);
      }
      g.lx = c.tx; g.ly = c.ty;
    } else if (g.mode === "rect") { rect.x1 = c.tx; rect.y1 = c.ty; }
    else if (g.mode === "drag") {
      if (g.what === "e") {
        const en = level.entities[g.i]; if (!en) return;
        const nx = clamp(c.tx - g.ox, 0, level.w - 1), ny = clamp(c.ty - g.oy, 0, level.h - 1);
        const fx = en.x - Math.floor(en.x), fy = en.y - Math.floor(en.y);
        en.x = nx + fx; en.y = ny + fy;
      } else if (g.what === "start") { if (inB(c.tx, c.ty)) level.start = { x: c.tx, y: c.ty }; }
      else if (g.what === "goal") { const y = clamp(c.ty - g.oy, 0, level.h - 1); if (inB(c.tx, y)) level.goal = { x: c.tx, y }; }
      else if (g.what === "cp") { const p = level.checkpoints[g.i]; if (p) { p.x = clamp(c.tx, 0, level.w - 1); p.y = clamp(c.ty - g.oy, 0, level.h - 1); } }
    }
  }
  function toolUp() {
    const g = gesture; if (!g) return;
    if (g.mode === "tool") commit();
    else if (g.mode === "rect") {
      if (rect) { begin(); fillRect(rect, rect.ch); commit(); app.audio.sfx(rect.ch === "." ? "erase" : "place"); }
      rect = null;
    } else if (g.mode === "drag") {
      if (g.what === "cp") level.checkpoints.sort((a, b) => a.x - b.x || a.y - b.y);
      commit();
    }
  }
  function abortGesture() {
    const g = gesture; if (!g) return;
    if (g.timer) clearTimeout(g.timer);
    // a second finger right after the first: the first touch was the start of a pinch, not a stroke
    if (g.mode === "tool" || g.mode === "drag") { if (performance.now() - g.t0 < 400) cancelEdit(); else commit(); }
    if (g.mode === "rect") rect = null;
    gesture = null;
  }
  function addPathPoint(tx, ty) {
    const e = level.entities[selected]; if (!e || !Array.isArray(e.path)) return;
    const dx = tx - Math.floor(e.x), dy = ty - Math.floor(e.y);
    if (dx === 0 && dy === 0) return;
    if (Math.abs(dx) > LIMITS.maxPathOffset || Math.abs(dy) > LIMITS.maxPathOffset) { toast(root, "Too far from the anchor", "warn"); return; }
    if (e.path.length >= LIMITS.maxPathPoints) { toast(root, `Max ${LIMITS.maxPathPoints} path points`, "warn"); return; }
    begin(); e.path.push([dx, dy]); if (!e.speed) e.speed = 2; commit(); app.audio.sfx("place");
  }

  // =============================================================================================================
  // pointer input on the canvas
  function onPointerDown(e) {
    if (replay) return;
    const p = localXY(e);
    try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* fine */ }
    pointers.set(e.pointerId, { x: p.x, y: p.y, type: e.pointerType });
    app.audio.unlock();
    if (e.pointerType === "touch" || e.pointerType === "pen") {
      if (pointers.size >= 2) { abortGesture(); startPinch(); return; }
      if (tool === "hand") { gesture = { mode: "pan", px: p.x, py: p.y }; return; }
      // wait a moment: if a second finger lands soon it is a pinch, not a stroke
      gesture = { mode: "pending", x: p.x, y: p.y, id: e.pointerId, ev: { shiftKey: false, button: 0 }, timer: setTimeout(() => { if (gesture && gesture.mode === "pending") gesture = toolDown(gesture.x, gesture.y, gesture.ev); }, 90) };
      return;
    }
    e.preventDefault();
    if (e.button === 1 || e.button === 2 || spaceHeld) { gesture = { mode: "pan", px: p.x, py: p.y }; return; }
    if (e.button !== 0) return;
    gesture = toolDown(p.x, p.y, e);
  }
  function startPinch() {
    if (gesture && gesture.timer) clearTimeout(gesture.timer);
    const pts = [...pointers.values()].slice(0, 2);
    gesture = { mode: "pinch", cx: (pts[0].x + pts[1].x) / 2, cy: (pts[0].y + pts[1].y) / 2, d: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1 };
  }
  function onPointerMove(e) {
    const p = localXY(e);
    const pt = pointers.get(e.pointerId);
    if (e.pointerType === "mouse" || !pt) { const c = cellOf(p.x, p.y); hover = inB(c.tx, c.ty) ? c : null; }
    if (!pt) return;
    pt.x = p.x; pt.y = p.y;
    if (e.pointerType !== "mouse") { const c = cellOf(p.x, p.y); hover = inB(c.tx, c.ty) ? c : null; }
    const g = gesture; if (!g) return;
    if (g.mode === "pending") {
      if (Math.hypot(p.x - g.x, p.y - g.y) > 8) { clearTimeout(g.timer); const ev = g.ev; gesture = toolDown(g.x, g.y, ev); if (gesture.mode !== "none" && gesture.mode !== "pan") toolMove(p.x, p.y); }
      return;
    }
    if (g.mode === "pan") { camera.pan(p.x - g.px, p.y - g.py); g.px = p.x; g.py = p.y; clampCam(); }
    else if (g.mode === "pinch") {
      const pts = [...pointers.values()].slice(0, 2); if (pts.length < 2) return;
      const cx = (pts[0].x + pts[1].x) / 2, cy = (pts[0].y + pts[1].y) / 2, d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
      camera.pan(cx - g.cx, cy - g.cy); zoomBy(d / g.d, cx, cy);
      g.cx = cx; g.cy = cy; g.d = d;
    } else if (g.mode !== "none") toolMove(p.x, p.y);
  }
  function onPointerUp(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    const g = gesture;
    if (g && g.mode === "pending") { clearTimeout(g.timer); gesture = toolDown(g.x, g.y, g.ev); toolUp(); gesture = null; }
    else if (g && g.mode === "pinch") { if (pointers.size === 0) gesture = null; else gesture = { mode: "none" }; }
    else if (g) { toolUp(); gesture = null; }
    if (e.pointerType !== "mouse") hover = null;
    refreshStatus();
  }
  function onWheel(e) {
    if (replay) return;
    e.preventDefault();
    const p = localXY(e);
    if (e.shiftKey && !e.ctrlKey) { camera.pan(-(e.deltaY || e.deltaX), 0); clampCam(); return; }
    const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    zoomBy(Math.exp(-clamp(d, -120, 120) * (e.ctrlKey ? 0.01 : 0.0022)), p.x, p.y);
  }
  function onKeyDown(e) {
    if (isTyping(e.target)) return;
    if (replay) { if (e.code === "Escape") stopReplay(); return; }
    if (root && root.querySelector(".acb-modal")) { if (e.code === "Escape") closeModal(); return; }
    const k = e.code, ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && k === "KeyZ") { e.preventDefault(); if (e.shiftKey) doRedo(); else doUndo(); return; }
    if (ctrl && k === "KeyY") { e.preventDefault(); doRedo(); return; }
    if (ctrl && k === "KeyS") { e.preventDefault(); saveNow(); toast(root, "Draft saved"); return; }
    if (ctrl && k === "KeyD" && selected >= 0) { e.preventDefault(); duplicateSelected(); return; }
    if (ctrl) return;
    if (k === "Space") { e.preventDefault(); spaceHeld = true; return; }
    if (k === "Escape") { if (pathEdit) { pathEdit = false; refreshInspector(); } else if (selected >= 0 || selMarker) { select(-1); } return; }
    if ((k === "Delete" || k === "Backspace") && selected >= 0) { e.preventDefault(); deleteSelected(); return; }
    const t = TOOLS.find((x) => "Key" + x.key === k); if (t) { setTool(t.id); return; }
    if (k === "KeyG") { grid = !grid; refreshTools(); return; }
    if (k === "KeyT") { testPlay(true); return; }
    if (k === "Enter") { testPlay(false); return; }
    if (k === "KeyF") { fitAll(); return; }
    if (k === "Equal" || k === "NumpadAdd") { zoomBy(1.25); return; }
    if (k === "Minus" || k === "NumpadSubtract") { zoomBy(0.8); return; }
    if (k.startsWith("Arrow") || k === "KeyW" || k === "KeyA" || k === "KeyS" || k === "KeyD") { keysHeld.add(k); e.preventDefault(); return; }
    if (k.startsWith("Digit")) { const n = +k.slice(5) - 1; const g = GROUPS.find((x) => x.id === group); if (g && g.items[n]) setBrush(g.items[n]); }
  }
  function onKeyUp(e) { if (e.code === "Space") spaceHeld = false; keysHeld.delete(e.code); }
  function onBlur() { spaceHeld = false; keysHeld.clear(); }

  // =============================================================================================================
  // test play / replays
  function spotFrom(tx, ty) {
    tx = clamp(tx, 0, level.w - 1); ty = clamp(ty, 1, level.h - 2);
    const bad = (x, y) => { const c = charToCode(tileAt(x, y)); return isFullSolid(c) || c >= 12; };
    let y = ty; while (y > 0 && bad(tx, y)) y--;
    return bad(tx, y) ? null : { x: tx, y };
  }
  function testPlay(fromHere) {
    commit();
    const v = validateLevel(level);
    if (!v.ok) { toast(root, "Can't test yet: " + v.errors[0], "err"); return; }
    const L = normalizeLevel(level);
    let fromStart = true;
    if (fromHere) {
      const c = hover || cellOf(app.viewW / 2, app.viewH / 2);
      const s = spotFrom(c.tx, c.ty);
      if (!s) { toast(root, "No room to start there", "warn"); return; }
      L.start = s; fromStart = false;
    }
    const hash = playHash(level);
    testCtx = { hash, fromStart };
    saveNow();
    app.playLevel(L, {
      key: null,
      onWin: (r) => {
        if (testCtx && testCtx.fromStart && draft && testCtx.hash === playHash(level)) {
          draft.cleared = testCtx.hash; if (!draft.clearMs || r.ms < draft.clearMs || draft.clearHash !== testCtx.hash) draft.clearMs = r.ms;
          draft.clearHash = testCtx.hash; snapshotDraft();
        }
      },
      onExit: (r) => app.show("builder", { resume: true, cleared: !!(r && r.won) }),
    });
  }
  // watch the AI play: replay its inputs in a real sim inside the editor
  function startReplay(inputs, onDone) {
    if (!inputs || !inputs.length) return;
    closeModal();
    app.renderer.setLevel(level);
    const sim = createSim(level, { events: true });
    const cam = createCamera(); cam.setViewport(app.viewW, app.viewH);
    cam.snap(sim.level, sim.state.x + PW / 2, sim.state.y + PH / 2);
    replay = { sim, inputs, i: 0, acc: 0, speed: 1, prev: { x: sim.state.x, y: sim.state.y }, cam, events: [], onDone, done: false };
    root.classList.add("replaying");
    const bar = el(`<div class="acb-replay"><span class="acb-replay-t">AI run</span><span class="acb-replay-time">0.00</span>
      <button data-rs="1" class="on">1x</button><button data-rs="2">2x</button><button data-rs="4">4x</button>
      <button data-a="replay-stop" class="primary">${ico("stop")} Stop</button></div>`, "acb-replay-wrap");
    root.appendChild(bar);
  }
  function stopReplay() {
    if (!replay) return;
    const cb = replay.onDone; replay = null;
    if (root) { root.classList.remove("replaying"); const b = $(".acb-replay-wrap"); if (b) b.remove(); }
    app.renderer.setLevel(level);
    if (cb) cb();
  }
  function replayFrame(dt, now) {
    const R = replay, s = R.sim.state;
    R.events.length = 0;
    if (!R.done) {
      R.acc += Math.min(dt, 0.1) * 1000 * R.speed;
      while (R.acc >= STEP_MS) {
        R.prev.x = s.x; R.prev.y = s.y;
        const b = R.i < R.inputs.length ? R.inputs[R.i] : 0; R.i++;
        R.sim.step(b);
        for (const ev of R.sim.events) { R.events.push(ev); if (R.speed <= 2 && ev.type !== "land") app.audio.sfx(ev.type, { impact: ev.a, vol: 0.6 }); }
        R.acc -= STEP_MS;
        if (s.won || R.i > R.inputs.length + 240) { R.done = true; const t = $(".acb-replay-t"); if (t) t.textContent = s.won ? "AI finished!" : "AI run ended"; break; }
      }
    }
    const a = R.done ? 1 : R.acc / STEP_MS;
    const px = R.prev.x + (s.x - R.prev.x) * a + PW / 2, py = R.prev.y + (s.y - R.prev.y) * a + PH / 2;
    R.cam.follow(R.sim.level, px, py, s.vx, dt);
    view.mode = "play"; view.level = R.sim.level; view.sim = R.sim; view.frame = s.frame; view.alpha = a; view.prev = R.prev;
    view.camera = R.cam; view.time = now / 1000; view.dt = dt; view.events = R.events; view.editor = null;
    app.renderer.frame(view);
    const tt = $(".acb-replay-time"); if (tt) tt.textContent = fmtMs((s.won ? s.winFrame : s.frame) * STEP_MS);
  }

  // =============================================================================================================
  // publish
  function publishCtx() {
    return {
      app, root, get level() { return level; }, get draft() { return draft; }, ratingInputs,
      save: () => { snapshotDraft(); },
      commit, testPlay: () => { closeModal(); testPlay(false); },
      watch: (inputs, back) => startReplay(inputs, back),
      close: closeModal, setName: (n) => { begin(); level.name = n; commit(); },
    };
  }
  function doPublish() { commit(); saveNow(); openPublish(publishCtx()); }

  // =============================================================================================================
  // DOM
  function buildDom() {
    root = el("", "overlay acb-root" + (palOpen ? "" : " pal-closed"));
    root.innerHTML = `
      <div class="acb-top">
        <button class="acb-ib" data-a="back" title="Back to the title">${ico("back")}</button>
        <button class="acb-name" data-a="settings" title="Level settings"><span class="acb-title"></span><small class="acb-sub"></small></button>
        <span class="acb-sp"></span>
        <button class="acb-ib" data-a="undo" title="Undo (Ctrl+Z)">${ico("undo")}</button>
        <button class="acb-ib" data-a="redo" title="Redo (Ctrl+Y)">${ico("redo")}</button>
        <button class="acb-ib acb-hide-s" data-a="here" title="Test from the cursor (T)">${ico("here")}</button>
        <button class="acb-btn" data-a="test" title="Test play from the start (Enter)">${ico("play")}<span>Test</span></button>
        <button class="acb-btn primary" data-a="publish" title="Publish to the community">${ico("up")}<span>Publish</span></button>
        <button class="acb-ib" data-a="menu" title="More">${ico("menu")}</button>
      </div>
      <div class="acb-tools">
        ${TOOLS.map((t) => `<button class="acb-ib" data-tool="${t.id}" title="${t.name} (${t.key})">${ico(t.id)}</button>`).join("")}
        <i class="acb-sep"></i>
        <button class="acb-ib" data-a="zin" title="Zoom in (+)">${ico("plus")}</button>
        <button class="acb-ib" data-a="zout" title="Zoom out (-)">${ico("minus")}</button>
        <button class="acb-ib" data-a="fit" title="Show the whole level (F)">${ico("fit")}</button>
        <button class="acb-ib" data-a="grid" title="Grid (G)">${ico("grid")}</button>
        <button class="acb-ib acb-show-s" data-a="here" title="Test from the middle of the screen">${ico("here")}</button>
      </div>
      <div class="acb-pal">
        <div class="acb-pal-head"><div class="acb-tabs">${GROUPS.map((g) => `<button data-g="${g.id}">${g.name}</button>`).join("")}</div>
          <button class="acb-ib acb-pal-tog" data-a="paltog" title="Show / hide the palette">${ico("chev")}</button></div>
        <div class="acb-pal-body"><div class="acb-items"></div><div class="acb-tip"></div></div>
      </div>
      <div class="acb-insp" hidden></div>
      <div class="acb-status"></div>`;
    on(root, "click", onUiClick);
    on(root, "input", onUiInput);
    on(root, "change", onUiChange);
    on(root, "pointerdown", (e) => { if (e.target.closest("button,input,select,textarea")) app.audio.unlock(); });
    app.ui.appendChild(root);
    buildPalette();
    refreshAll();
  }
  function refreshAll() { if (!root) return; refreshTop(); refreshTools(); refreshPalette(); refreshInspector(); refreshStatus(true); }
  function refreshTop() {
    if (!root || !level) return;
    $(".acb-title").textContent = level.name || "Untitled";
    const si = songInfo(level.music);
    $(".acb-sub").textContent = (THEME_NAMES[level.theme] || level.theme) + " · " + (si ? si.title : level.music) + " · " + level.w + "x" + level.h;
    root.querySelector("[data-a=undo]").disabled = !undo.length;
    root.querySelector("[data-a=redo]").disabled = !redo.length;
  }
  function refreshTools() {
    if (!root) return;
    for (const b of root.querySelectorAll("[data-tool]")) b.classList.toggle("on", b.dataset.tool === tool);
    root.querySelector("[data-a=grid]").classList.toggle("on", grid);
  }
  let thumbTheme = "";
  function buildPalette() {
    const box = $(".acb-items"); if (!box) return;
    const g = GROUPS.find((x) => x.id === group) || GROUPS[0];
    box.innerHTML = "";
    g.items.forEach((b, i) => {
      const btn = document.createElement("button");
      btn.className = "acb-item"; btn.dataset.b = b.id; btn.title = b.name + (i < 9 ? ` (${i + 1})` : "") + " - " + b.tip;
      btn.appendChild(makeThumbCanvas(40, 40, (c, w) => drawBrushThumb(c, b, w)));
      const s = document.createElement("span"); s.textContent = b.name; btn.appendChild(s);
      box.appendChild(btn);
    });
    thumbTheme = level ? level.theme : "";
  }
  function drawBrushThumb(c, b, size) {
    const th = level ? level.theme : "forest", r = app.renderer;
    try {
      if (b.kind === "pair") { r.drawThumb(c, { tile: b.pair[0] }, 0, size * 0.25, size / 2, th); r.drawThumb(c, { tile: b.pair[1] }, size / 2, size * 0.25, size / 2, th); }
      else r.drawThumb(c, b.thumb, 0, 0, size, th);
    } catch (e) { c.fillStyle = "#777"; c.fillRect(4, 4, size - 8, size - 8); }
  }
  function refreshPalette() {
    if (!root) return;
    if (level && thumbTheme !== level.theme) buildPalette();
    for (const t of root.querySelectorAll("[data-g]")) t.classList.toggle("on", t.dataset.g === group);
    let shown = false;
    for (const b of root.querySelectorAll(".acb-item")) { const onb = b.dataset.b === brush.id; b.classList.toggle("on", onb); shown = shown || onb; }
    const tip = $(".acb-tip"); if (tip) tip.innerHTML = `<b>${esc(brush.name)}</b> ${esc(brush.tip)}`;
  }
  // measured: a running full jump clears 1 floor thorn with a 22-frame takeoff window, 2 with 12, 3 with only 3 (50 ms),
  // 4 never. Warn the builder about long floor thorn rows (a raised platform or a spring makes them fair).
  function thornWarn() {
    let worst = 0;
    for (let y = 0; y < level.tiles.length; y++) { const m = level.tiles[y].match(/[\^]{3,}/g); if (m) for (const r of m) worst = Math.max(worst, r.length); }
    return worst >= 4 ? "Heads up: 4+ thorns in a row can't be jumped from flat ground" : worst === 3 ? "Heads up: 3 thorns in a row need a near frame-perfect jump" : "";
  }
  function refreshStatus(force) {
    if (!root || !level) return;
    const cell = hover ? `${hover.tx},${hover.ty}` : "";
    const cleared = draft && draft.cleared === curHash();
    const saved = dirtyT ? "Saving..." : "Saved";
    let hint = "";
    if (pathEdit) hint = "Tap the map to add path points";
    else if (tool === "paint" && brush.kind === "marker") hint = brush.tip;
    else { const w = thornWarn(); if (w) hint = w; }
    const s = `${cell ? `<span>${cell}</span>` : ""}<span>${level.entities.length}/${LIMITS.communityMaxEntities} objects</span><span>${level.checkpoints.length}/${LIMITS.communityMaxCheckpoints} flags</span>` +
      `<span class="${cleared ? "ok" : "no"}">${cleared ? "Cleared" + (draft.clearMs ? " " + fmtMs(draft.clearMs) : "") : "Not cleared yet"}</span><span>${saved}</span>${hint ? `<span class="hint">${esc(hint)}</span>` : ""}`;
    if (force || s !== lastStatus) { lastStatus = s; $(".acb-status").innerHTML = s; }
  }
  function refreshInspector() {
    const box = $(".acb-insp"); if (!box || !level) return;
    if (selMarker) {
      const name = selMarker.type === "start" ? "Start" : selMarker.type === "goal" ? "Goal" : "Checkpoint " + (selMarker.i + 1);
      box.hidden = false;
      box.innerHTML = `<div class="acb-insp-h"><b>${name}</b><button class="acb-ib" data-a="desel" title="Close">${ico("x")}</button></div>
        <p class="acb-muted">Drag it to move it.${selMarker.type === "cp" ? " Checkpoints activate left to right." : ""}</p>
        ${selMarker.type === "cp" ? `<button class="acb-btn danger" data-a="delcp">${ico("trash")}<span>Remove</span></button>` : ""}`;
      root.classList.add("has-insp");
      return;
    }
    const e = selected >= 0 ? level.entities[selected] : null;
    if (!e) { box.hidden = true; box.innerHTML = ""; root.classList.remove("has-insp"); return; }
    root.classList.add("has-insp");
    box.hidden = false;
    const f = FIELDS[e.t] || [];
    let h = `<div class="acb-insp-h"><b>${ENTITY_NAMES[e.t] || e.t}</b><small>at ${Math.floor(e.x)},${Math.floor(e.y)}</small>
      <button class="acb-ib" data-a="dup" title="Duplicate (Ctrl+D)">${ico("copy")}</button><button class="acb-ib" data-a="del" title="Delete (Del)">${ico("trash")}</button>
      <button class="acb-ib" data-a="desel" title="Close (Esc)">${ico("x")}</button></div><div class="acb-fields">`;
    for (const spec of f) {
      if (spec === "path") {
        const pts = e.path || [];
        h += `<div class="acb-path"><div class="acb-path-h"><span>Path</span><small>${pts.length}/${LIMITS.maxPathPoints} points</small></div>
          <div class="acb-chips"><span class="acb-chip anchor">anchor</span>${pts.map((p, i) => `<span class="acb-chip">${p[0] > 0 ? "+" : ""}${p[0]}, ${p[1] > 0 ? "+" : ""}${p[1]}<button data-a="pdel" data-i="${i}" title="Remove">${ico("x")}</button></span>`).join("")}</div>
          <div class="acb-row"><button class="acb-btn ${pathEdit ? "on" : ""}" data-a="pedit">${ico("path")}<span>${pathEdit ? "Done adding" : "Add points"}</span></button>
          <button class="acb-btn" data-a="pclear" ${pts.length ? "" : "disabled"}>Clear</button></div>
          ${pathEdit ? `<p class="acb-muted">Tap the map where it should travel. Points are relative to the anchor.</p>` : ""}</div>`;
        continue;
      }
      const [key, label, type, a, b, step] = spec;
      const v = e[key];
      if (type === "sel") h += `<label class="acb-f"><span>${label}</span><select data-f="${key}">${a.map((o) => `<option value="${o}" ${o === v ? "selected" : ""}>${o}</option>`).join("")}</select></label>`;
      else if (type === "text") h += `<label class="acb-f wide"><span>${label}</span><input data-f="${key}" type="text" maxlength="${a}" value="${esc(v)}"></label>`;
      else {
        const hi = e.t === "pulse" && (key === "on" || key === "offset") ? Math.min(b, e.period - 1) : b;
        h += `<label class="acb-f"><span>${label} <output>${fieldText(e, key, v)}</output></span><input data-f="${key}" type="range" min="${a}" max="${hi}" step="${step}" value="${v}"></label>`;
      }
    }
    h += `</div>`;
    box.innerHTML = h;
  }
  function fieldText(e, key, v) {
    if (e.t === "spring" && key === "p") return v.toFixed(2) + " (~" + (6.6 * v * v).toFixed(1) + " tiles)";
    if (e.t === "pulse" && (key === "period" || key === "on" || key === "offset")) return v + " (" + (v / 60).toFixed(2) + " s)";
    if (key === "phase" || key === "r" || key === "speed" || key === "s") return (+v).toFixed(2);
    return String(v);
  }
  function deleteSelected() { if (selected < 0) return; begin(); removeEntity(selected); commit(); refreshInspector(); app.audio.sfx("erase"); }
  function duplicateSelected() {
    const e = level.entities[selected]; if (!e) return;
    if (level.entities.length >= LIMITS.communityMaxEntities) { toast(root, "Entity limit reached", "warn"); return; }
    const c = JSON.parse(JSON.stringify(e)); c.x = Math.min(level.w - 1, c.x + (e.w || 1) + 1);
    begin(); level.entities.push(c); commit(); select(level.entities.length - 1); app.audio.sfx("place");
  }

  function onUiInput(e) {
    const t = e.target;
    if (t.dataset.f && selected >= 0) {
      const en = level.entities[selected]; if (!en) return;
      begin();
      const spec = (FIELDS[en.t] || []).find((s) => Array.isArray(s) && s[0] === t.dataset.f);
      let v = t.value; if (spec && (spec[2] === "int" || spec[2] === "num")) v = +v;
      en[t.dataset.f] = clampField(en, t.dataset.f, v); fixPulse(en);
      const o = t.parentElement.querySelector("output"); if (o) o.textContent = fieldText(en, t.dataset.f, en[t.dataset.f]);
      if (spec && spec[2] === "sel") { commit(); refreshInspector(); }
    }
  }
  function onUiChange(e) {
    const t = e.target;
    if (t.dataset.f && selected >= 0) { commit(); if (t.dataset.f === "period") refreshInspector(); }
  }
  function onUiClick(e) {
    const b = e.target.closest("button"); if (!b || b.disabled) return;
    if (b.dataset.tool) { setTool(b.dataset.tool); app.audio.sfx("click"); return; }
    if (b.dataset.g) { group = b.dataset.g; buildPalette(); refreshPalette(); if (!palOpen) togglePal(true); return; }
    if (b.dataset.b) { setBrush(brushById(b.dataset.b)); if (selected >= 0 || selMarker) select(-1); return; }
    if (b.dataset.rs && replay) { replay.speed = +b.dataset.rs; for (const x of root.querySelectorAll("[data-rs]")) x.classList.toggle("on", x === b); return; }
    const a = b.dataset.a; if (!a) return;
    switch (a) {
      case "back": app.audio.sfx("click"); app.show("title"); break;
      case "undo": doUndo(); break;
      case "redo": doRedo(); break;
      case "test": app.audio.sfx("click"); testPlay(false); break;
      case "here": app.audio.sfx("click"); testPlay(true); break;
      case "publish": app.audio.sfx("click"); doPublish(); break;
      case "menu": app.audio.sfx("click"); openMenu(); break;
      case "settings": app.audio.sfx("click"); openSettings(); break;
      case "zin": zoomBy(1.25); break;
      case "zout": zoomBy(0.8); break;
      case "fit": fitAll(); break;
      case "grid": grid = !grid; refreshTools(); break;
      case "paltog": togglePal(); break;
      case "desel": select(-1); break;
      case "del": deleteSelected(); break;
      case "dup": duplicateSelected(); break;
      case "delcp": if (selMarker && selMarker.type === "cp") { begin(); level.checkpoints.splice(selMarker.i, 1); selMarker = null; commit(); refreshInspector(); } break;
      case "pedit": pathEdit = !pathEdit; if (pathEdit) tool = "select"; refreshTools(); refreshInspector(); refreshStatus(true); break;
      case "pclear": { const en = level.entities[selected]; if (en) { begin(); en.path = []; commit(); } break; }
      case "pdel": { const en = level.entities[selected]; if (en) { begin(); en.path.splice(+b.dataset.i, 1); commit(); } break; }
      case "replay-stop": stopReplay(); break;
      case "close": closeModal(); break;
    }
  }
  function togglePal(force) {
    palOpen = force === undefined ? !palOpen : force;
    if (root) root.classList.toggle("pal-closed", !palOpen);
  }

  // =============================================================================================================
  // modals: menu, settings, open/new, import/export, help
  function closeModal() {
    const m = root && root.querySelector(".acb-modal");
    if (m) { m.remove(); if (m._onClose) m._onClose(); }
  }
  function modal(html, cls = "") {
    closeModal();
    const m = el(`<div class="acb-dialog ${cls}" role="dialog">${html}</div>`, "acb-modal");
    m.addEventListener("pointerdown", (e) => { if (e.target === m) closeModal(); });
    root.appendChild(m);
    return m;
  }
  function openMenu() {
    const m = modal(`<div class="acb-dh"><h2>Builder</h2><button class="acb-ib" data-a="close">${ico("x")}</button></div>
      <div class="acb-menu">
        <button data-m="settings">${ico("gear")}<span>Level settings<small>name, theme, music, size</small></span></button>
        <button data-m="open">${ico("copy")}<span>My levels<small>open a draft, start a new level</small></span></button>
        <button data-m="browse">${ico("play")}<span>Community levels<small>play what others built</small></span></button>
        <button data-m="export">${ico("up")}<span>Share code<small>copy / paste a level as text</small></span></button>
        <button data-m="music">${ico("note")}<span>Builder music: ${musicOn ? "on" : "off"}<small>play the level's song while building</small></span></button>
        <button data-m="help">${ico("menu")}<span>Controls &amp; tips<small>shortcuts, touch gestures</small></span></button>
      </div>`, "narrow");
    m.addEventListener("click", (e) => {
      const b = e.target.closest("[data-m]"); if (!b) return;
      app.audio.sfx("click");
      const k = b.dataset.m;
      if (k === "settings") openSettings();
      if (k === "open") openLevels();
      if (k === "browse") { closeModal(); app.show("browse", {}); }
      if (k === "export") openExport();
      if (k === "help") openHelp();
      if (k === "music") { musicOn = !musicOn; app.storage.set(MUSIC_PREF, musicOn); if (musicOn) app.audio.playSong(level.music); else app.audio.stopSong({ fadeOut: 0.5 }); openMenu(); }
    });
  }
  function openSettings() {
    let previewing = null;
    const songRow = (s) => `<div class="acb-song ${s.id === level.music ? "on" : ""}" data-song="${s.id}">
        <button class="acb-ib acb-prev" data-prev="${s.id}" title="Preview">${ico("play")}</button>
        <button class="acb-song-pick" data-pick="${s.id}"><b>${esc(s.title)}</b><small>${esc(s.main ? s.mood.replace(/^Area \d - /, "Area " + s.id.slice(4) + " · ") : s.mood)}</small></button></div>`;
    const m = modal(`<div class="acb-dh"><h2>Level settings</h2><button class="acb-ib" data-a="close">${ico("x")}</button></div>
      <label class="acb-f wide"><span>Level name</span><input class="acb-in-name" type="text" maxlength="${LIMITS.nameLen}" value="${esc(level.name)}"></label>
      <h3>Theme</h3><div class="acb-themes">${THEMES.map((t) => `<button class="acb-theme ${t === level.theme ? "on" : ""}" data-theme="${t}"><canvas width="160" height="90"></canvas><span>${THEME_NAMES[t]}</span></button>`).join("")}</div>
      <h3>Music <small>all 8 songs: the 3 area themes + 5 extra</small></h3>
      <div class="acb-songs">${SONGS.map(songRow).join("")}</div>
      <h3>Size <small>tiles; max ${LIMITS.communityMaxW} x ${LIMITS.communityMaxH}. Rows are added/removed at the top.</small></h3>
      <div class="acb-row acb-size"><label>W <input class="acb-in-w" type="number" min="${LIMITS.minW}" max="${LIMITS.communityMaxW}" value="${level.w}"></label>
        <label>H <input class="acb-in-h" type="number" min="${LIMITS.minH}" max="${LIMITS.communityMaxH}" value="${level.h}"></label>
        <button class="acb-btn" data-s="resize">Apply size</button></div>
      <div class="acb-row acb-presets">${SIZES.map((s) => `<button class="acb-chipbtn" data-size="${s.id}">${s.name} ${s.w}x${s.h}</button>`).join("")}</div>`);
    for (const b of m.querySelectorAll(".acb-theme")) { const c = b.querySelector("canvas").getContext("2d"); drawTheme(c, b.dataset.theme, 0, 0, 160, 90); }
    const nameIn = m.querySelector(".acb-in-name");
    nameIn.addEventListener("change", () => { const n = nameIn.value.trim().slice(0, LIMITS.nameLen) || "Untitled"; if (n !== level.name) { begin(); level.name = n; commit(); } });
    const stopPrev = () => { if (previewing) { previewing = null; for (const x of m.querySelectorAll("[data-prev]")) x.innerHTML = ico("play"); if (musicOn) app.audio.playSong(level.music); else app.audio.stopSong({ fadeOut: 0.4 }); } };
    m._onClose = () => { if (nameIn.value.trim() && nameIn.value.trim() !== level.name) { begin(); level.name = nameIn.value.trim().slice(0, LIMITS.nameLen); commit(); } stopPrev(); };
    m.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.theme) {
        if (b.dataset.theme !== level.theme) { begin(); level.theme = b.dataset.theme; app.renderer.setLevel(level); commit(); refreshPalette(); }
        for (const x of m.querySelectorAll(".acb-theme")) x.classList.toggle("on", x === b);
        app.audio.sfx("click");
      } else if (b.dataset.prev) {
        app.audio.unlock();
        if (previewing === b.dataset.prev) { stopPrev(); return; }
        previewing = b.dataset.prev;
        for (const x of m.querySelectorAll("[data-prev]")) x.innerHTML = ico(x === b ? "stop" : "play");
        app.audio.playSong(previewing, { fadeIn: 0.3, fadeOut: 0.4, restart: true });
      } else if (b.dataset.pick) {
        app.audio.unlock();
        if (b.dataset.pick !== level.music) { begin(); level.music = b.dataset.pick; commit(); }
        for (const x of m.querySelectorAll(".acb-song")) x.classList.toggle("on", x.dataset.song === level.music);
        previewing = null; for (const x of m.querySelectorAll("[data-prev]")) x.innerHTML = ico("play");
        app.audio.playSong(level.music, { fadeIn: 0.3 });
        app.audio.sfx("click");
      } else if (b.dataset.s === "resize") {
        resizeLevel(+m.querySelector(".acb-in-w").value, +m.querySelector(".acb-in-h").value);
        m.querySelector(".acb-in-w").value = level.w; m.querySelector(".acb-in-h").value = level.h; app.audio.sfx("click");
      } else if (b.dataset.size) {
        const s = SIZES.find((x) => x.id === b.dataset.size);
        m.querySelector(".acb-in-w").value = s.w; m.querySelector(".acb-in-h").value = s.h;
      }
    });
  }
  function openLevels() {
    saveNow();
    const m = modal(`<div class="acb-dh"><h2>My levels</h2><button class="acb-ib" data-a="close">${ico("x")}</button></div>
      <h3>New level</h3>
      <div class="acb-newrow">${SIZES.map((s) => `<button class="acb-chipbtn" data-new="${s.id}"><b>${s.name}</b> ${s.w}x${s.h}</button>`).join("")}
        <select class="acb-new-theme">${THEMES.map((t) => `<option value="${t}" ${t === level.theme ? "selected" : ""}>${THEME_NAMES[t]}</option>`).join("")}</select></div>
      <h3>Drafts on this device</h3><div class="acb-drafts"></div>
      <h3>Published by me</h3><div class="acb-pub acb-muted">Loading...</div>`);
    const list = m.querySelector(".acb-drafts");
    const fill = () => {
      list.innerHTML = "";
      if (!drafts.list.length) { list.innerHTML = `<p class="acb-muted">No drafts yet.</p>`; return; }
      for (const d of drafts.list) {
        const lv = draftLevel(d); if (!lv) continue;
        const row = el(`<div class="acb-dinfo"><b>${esc(d.name || lv.name)}</b><small>${lv.w}x${lv.h} · ${esc(THEME_NAMES[lv.theme])} · ${timeAgo(d.t)}${d.publishedId ? " · published" : ""}${d.rating ? " · " : ""}</small>${d.rating ? badge(d.rating.difficulty, { label: false }) : ""}</div>
          <div class="acb-dbtns">${d === draft ? `<span class="acb-tag">editing</span>` : `<button class="acb-btn" data-open="${d.id}">Open</button>`}
          <button class="acb-ib" data-dup="${d.id}" title="Duplicate">${ico("copy")}</button>
          <button class="acb-ib" data-del="${d.id}" title="Delete">${ico("trash")}</button></div>`, "acb-draft" + (d === draft ? " cur" : ""));
        row.prepend(makeThumbCanvas(120, 46, (c, w, h) => drawMinimap(c, lv, 0, 0, w, h)));
        list.appendChild(row);
      }
    };
    fill();
    app.online.listLevels().then((r) => {
      const box = m.querySelector(".acb-pub"); if (!box || !box.isConnected) return;
      const mine = (r.levels || []).filter((x) => x.mine);
      if (!r.ok && !mine.length) { box.textContent = r.reason === "offline" || r.reason === "network" ? "Community server unreachable - your drafts still work offline." : reasonText(r); return; }
      if (!mine.length) { box.textContent = "Nothing published yet. Beat your level, then press Publish!"; return; }
      box.classList.remove("acb-muted");
      box.innerHTML = mine.map((x) => `<div class="acb-draft"><div class="acb-dinfo"><b>${esc(x.name)}</b><small>${esc(THEME_NAMES[x.theme] || x.theme)} · ${timeAgo(x.u || x.t)}</small>${badge(x.difficulty, { label: false })}</div>
        <div class="acb-dbtns"><button class="acb-btn" data-pub="${esc(x.id)}">Edit</button></div></div>`).join("");
    });
    m.addEventListener("click", async (e) => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.new) { const s = SIZES.find((x) => x.id === b.dataset.new); newLevel({ w: s.w, h: s.h, theme: m.querySelector(".acb-new-theme").value }); closeModal(); toast(root, "New level started"); }
      else if (b.dataset.open) { const d = drafts.list.find((x) => x.id === b.dataset.open); if (d) { openDraft(d); closeModal(); toast(root, "Opened " + d.name); } }
      else if (b.dataset.dup) {
        const d = drafts.list.find((x) => x.id === b.dataset.dup); if (!d) return;
        const lv = draftLevel(d); lv.name = (lv.name + " copy").slice(0, LIMITS.nameLen);
        drafts.list.unshift({ id: newDraftId(), name: lv.name, t: Date.now(), data: packLevel(lv), publishedId: null, cleared: d.cleared, clearMs: d.clearMs, rating: d.rating });
        saveDrafts(app.storage, drafts); fill();
      } else if (b.dataset.del) {
        const d = drafts.list.find((x) => x.id === b.dataset.del); if (!d) return;
        if (!confirm(`Delete the draft "${d.name}"? This can't be undone.` + (d.publishedId ? " (The published copy stays online.)" : ""))) return;
        drafts.list = drafts.list.filter((x) => x !== d);
        if (d === draft) { if (drafts.list.length) openDraft(drafts.list[0]); else newLevel(); }
        saveDrafts(app.storage, drafts); fill();
      } else if (b.dataset.pub) {
        b.disabled = true; b.textContent = "Loading...";
        const r = await app.online.getLevel(b.dataset.pub);
        if (!r.ok) { b.disabled = false; b.textContent = "Edit"; toast(root, reasonText(r), "err"); return; }
        openPublished(r.level, b.dataset.pub, r.meta); closeModal();
      }
    });
  }
  // open one of my published levels for editing (re-publishing updates it in place)
  function openPublished(lv, id, meta) {
    let d = drafts.list.find((x) => x.publishedId === id);
    const L = normalizeLevel(lv), h = playHash(L);
    if (d && d.data && playHash(draftLevel(d) || L) !== h && !confirm("You have local edits to this level. Open the online version instead? (No = keep your local draft)")) { openDraft(d); return; }
    if (!d) d = { id: newDraftId(), name: L.name, t: Date.now(), data: "", publishedId: id, cleared: null, clearMs: 0, rating: null };
    // the published version was cleared and rated before it went up
    d.cleared = h; d.clearHash = h; d.rating = meta && meta.difficulty ? { hash: h, difficulty: meta.difficulty, beatable: meta.difficulty < 10, frames: 0 } : null;
    openDraft(d, L);
    toast(root, "Editing your published level - Publish updates it in place");
  }
  function openExport() {
    const code = packLevel(level);
    const m = modal(`<div class="acb-dh"><h2>Share code</h2><button class="acb-ib" data-a="close">${ico("x")}</button></div>
      <p class="acb-muted">Copy this text to share your level without the server, or paste someone's code below to open it as a new draft.</p>
      <textarea class="acb-code" readonly spellcheck="false">${esc(code)}</textarea>
      <div class="acb-row"><button class="acb-btn primary" data-x="copy">${ico("copy")}<span>Copy code</span></button><small class="acb-muted">${(code.length / 1024).toFixed(1)} KB</small></div>
      <h3>Import</h3><textarea class="acb-import" spellcheck="false" placeholder="Paste a level code here"></textarea>
      <div class="acb-row"><button class="acb-btn" data-x="import">Open as new draft</button></div>`);
    m.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-x]"); if (!b) return;
      if (b.dataset.x === "copy") {
        const ta = m.querySelector(".acb-code"); ta.select();
        try { await navigator.clipboard.writeText(code); toast(root, "Copied!"); } catch (_) { try { document.execCommand("copy"); toast(root, "Copied!"); } catch (e2) { toast(root, "Select the text and copy it", "warn"); } }
      } else {
        const txt = m.querySelector(".acb-import").value.trim(); if (!txt) return;
        let lv = null;
        try { lv = unpackLevel(txt); } catch (_) { lv = null; }
        const v = lv ? validateLevel(lv, { community: true }) : { ok: false, errors: ["not a level code"] };
        if (!v.ok) { toast(root, "Can't import: " + v.errors[0], "err"); return; }
        openDraft({ id: newDraftId(), name: lv.name, t: Date.now(), data: "", publishedId: null, cleared: null, clearMs: 0, rating: null }, lv);
        closeModal(); toast(root, "Imported " + lv.name);
      }
    });
  }
  function openHelp() {
    modal(`<div class="acb-dh"><h2>Controls &amp; tips</h2><button class="acb-ib" data-a="close">${ico("x")}</button></div>
      <div class="acb-help">
        <div><h3>Mouse &amp; keys</h3><ul>
          <li><b>Left drag</b> use the tool · <b>Right / middle drag</b> or <b>Space + drag</b> pan · <b>Wheel</b> zoom</li>
          <li><b>B</b> paint · <b>E</b> erase · <b>R</b> rectangle (Shift = erase) · <b>I</b> eyedropper · <b>V</b> select · <b>H</b> pan</li>
          <li><b>1-9</b> pick from the open palette tab · <b>Arrows / WASD</b> pan · <b>+ / -</b> zoom · <b>F</b> fit · <b>G</b> grid</li>
          <li><b>Ctrl+Z / Ctrl+Y</b> undo / redo · <b>Del</b> delete selected · <b>Ctrl+D</b> duplicate · <b>Esc</b> deselect</li>
          <li><b>Enter</b> test from the start · <b>T</b> test from the cursor</li></ul></div>
        <div><h3>Touch</h3><ul><li><b>Tap / drag</b> use the tool · <b>Two fingers</b> pan and pinch-zoom</li>
          <li>Hide the palette with the arrow to see more of the level.</li></ul></div>
        <div><h3>Physics</h3><ul><li>A full jump clears a <b>2-tile</b> wall, never 3. Tap jump: about 1 tile.</li>
          <li>Running jumps cross <b>4 tiles</b> comfortably, 5 at the very edge.</li>
          <li>A mushroom at power 1 launches about 6.6 tiles high.</li>
          <li>Put solid ground under slopes. Water, thorns and pits kill.</li></ul></div>
        <div><h3>Publishing</h3><ul><li>You must beat your level from the start first.</li>
          <li>Then an AI plays it and rates it <b>1</b> (easy) to <b>5</b> (hard) to <b>10</b> (impossible: the AI couldn't beat it).</li>
          <li>Drafts save automatically on this device.</li></ul></div>
      </div>`, "wide");
  }

  // =============================================================================================================
  // screen protocol
  return {
    // params: { level?: level to edit (opens as a new draft), publishedId?: its community id (mine; edits update it),
    //   meta?: its listLevels meta, draftId?: open that local draft, resume?: true when coming back from test play }
    enter(p = {}) {
      ensureCss();
      document.body.classList.add("acb-building");
      drafts = drafts || loadDrafts(app.storage);
      musicOn = app.storage.get(MUSIC_PREF, true) !== false;
      app.input.setActive(false);
      const pd = p.draftId ? drafts.list.find((x) => x.id === p.draftId) : null;
      if (pd && draftLevel(pd)) { buildDom(); if (pd !== draft) openDraft(pd); else { app.renderer.setLevel(level); frameCamera(); refreshAll(); } }
      else if (p.level) {
        if (p.publishedId) { buildDom(); openPublished(p.level, p.publishedId, p.meta); }
        else { const L = normalizeLevel(p.level); buildDom(); openDraft({ id: newDraftId(), name: L.name, t: Date.now(), data: "", publishedId: null, cleared: null, clearMs: 0, rating: null }, L); }
      } else {
        if (!level) {
          const d = drafts.list.find((x) => x.id === drafts.cur) || drafts.list[0];
          const lv = d && draftLevel(d);
          if (d && lv && validateLevel(lv, { community: true }).errors.length === 0) { draft = d; level = lv; }
          else { level = null; draft = null; }
        }
        if (!level) {
          const lv = emptyLevel({ w: 80, h: 24, name: nextName() }); addStarter(lv);
          level = normalizeLevel(lv); draft = { id: newDraftId(), name: level.name, t: Date.now(), data: "", publishedId: null, cleared: null, clearMs: 0, rating: null };
        }
        app.renderer.setLevel(level);
        if (!p.resume || camKey !== draft.id) frameCamera(); else { camera.setViewport(app.viewW, app.viewH); clampCam(); }
        buildDom();
        snapshotDraft();
        if (p.resume && testCtx) {
          const cleared = draft.cleared === playHash(level);
          if (testCtx.fromStart && cleared && p.cleared) toast(root, "Level cleared! You can publish it now.", "ok");
          else if (testCtx.fromStart && !p.cleared) toast(root, "Beat it from the start to unlock publishing");
          testCtx = null;
        }
      }
      if (musicOn) app.audio.playSong(level.music); else app.audio.stopSong({ fadeOut: 0.5 });
      on(canvas, "pointerdown", onPointerDown);
      on(canvas, "pointermove", onPointerMove);
      on(window, "pointerup", onPointerUp);
      on(window, "pointercancel", onPointerUp);
      on(canvas, "pointerleave", (e) => { if (e.pointerType === "mouse" && !pointers.size) hover = null; });
      on(canvas, "wheel", onWheel, { passive: false });
      on(canvas, "contextmenu", (e) => e.preventDefault());
      on(window, "keydown", onKeyDown);
      on(window, "keyup", onKeyUp);
      on(window, "blur", onBlur);
      on(window, "beforeunload", () => saveNow());
    },
    exit() {
      if (replay) { replay.onDone = null; stopReplay(); }
      if (gesture) { toolUp(); gesture = null; }
      commit(); saveNow();
      for (const [t, ty, fn, o] of listeners) t.removeEventListener(ty, fn, o);
      listeners = []; pointers.clear(); keysHeld.clear(); hover = null; rect = null; spaceHeld = false;
      if (root) root.remove(); root = null;
      document.body.classList.remove("acb-building");
    },
    resize() { camera.setViewport(app.viewW, app.viewH); if (level) clampCam(); if (replay) replay.cam.setViewport(app.viewW, app.viewH); },
    frame(dt, now) {
      if (!level) return;
      frameN++;
      if (replay) { replayFrame(dt, now); return; }
      if (keysHeld.size) {
        const sp = 900 * dt;
        let dx = 0, dy = 0;
        for (const k of keysHeld) { if (k === "ArrowLeft" || k === "KeyA") dx += sp; if (k === "ArrowRight" || k === "KeyD") dx -= sp; if (k === "ArrowUp" || k === "KeyW") dy += sp; if (k === "ArrowDown" || k === "KeyS") dy -= sp; }
        camera.pan(dx, dy); clampCam();
      }
      // editor overlay description for the renderer
      const ed = edView;
      ed.grid = grid; ed.showPaths = showPaths; ed.tool = pathEdit ? "path" : tool; ed.selected = selected; ed.rect = rect;
      ed.marker = tool === "paint" && brush.kind === "marker" ? brush.marker : undefined;
      if (hover && !gesture) {
        ed.hover = hover;
        hover.w = tool === "paint" && brush.kind === "pair" ? 2 : tool === "paint" && brush.kind === "entity" && (brush.entity === "crumble" || brush.entity === "mover") ? (brush.entity === "mover" ? 3 : 2) : 1;
        hover.h = tool === "paint" && brush.entity === "pulse" ? (brush.sub === "lightning" ? 6 : 3) : 1;
        ed.ghost = tool === "paint" ? (brush.kind === "tile" ? { tile: brush.tile } : brush.kind === "pair" ? { tile: brush.pair[0], pair: brush.pair } : brush.kind === "entity" ? { entity: makeEntity(brush, hover.tx, hover.ty) } : null) : tool === "rect" && brush.kind === "tile" ? { tile: brush.tile } : null;
      } else if (gesture && (gesture.mode === "tool") && hover) { ed.hover = hover; ed.ghost = null; }
      else { ed.hover = null; ed.ghost = null; }
      view.mode = "edit"; view.level = level; view.sim = null; view.frame = Math.floor(now / STEP_MS); view.alpha = 1; view.prev = null;
      view.camera = camera; view.time = now / 1000; view.dt = dt; view.events = NOEV; view.editor = ed;
      app.renderer.frame(view);
      if ((frameN & 15) === 0) { refreshStatus(); refreshTop(); }
    },
    get level() { return level; },
    get draft() { return draft; },
    // test seam for tools / playtests
    get debug() { return { tool, brush: brush.id, selected, undo: undo.length, redo: redo.length, camera, setBrush: (id) => setBrush(brushById(id)), setTool, select, testPlay, doUndo, doRedo, resizeLevel, publish: doPublish, startReplay, get replay() { return replay; } }; },
  };
}
