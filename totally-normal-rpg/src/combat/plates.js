// plates.js - enemy name plates ("Rec. Lv 50", coloured by your level) and small HP bars. Sprites, textures cached.
import { recClass, fmtInt } from "./stats.js";

const COLORS = { green: "#7fe08a", white: "#f2f2f2", red: "#ff5a5a" };

export function createPlates(ctx) {
  const THREE = ctx.THREE;
  const texCache = new Map();
  const hasDom = typeof document !== "undefined";

  function plateTexture(name, rec, cls) {
    const key = name + "|" + rec + "|" + cls;
    let t = texCache.get(key);
    if (t) return t;
    if (!hasDom) return null;
    const c = document.createElement("canvas");
    c.width = 256; c.height = 64;
    const g = c.getContext("2d");
    g.clearRect(0, 0, 256, 64);
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.shadowColor = "rgba(0,0,0,0.85)"; g.shadowBlur = 4;
    g.font = "500 22px Georgia, 'Times New Roman', serif";
    g.fillStyle = "rgba(240,236,228,0.95)";
    g.fillText(name, 128, 20);
    g.font = "600 20px system-ui, Segoe UI, Arial, sans-serif";
    g.fillStyle = COLORS[cls] || COLORS.white;
    g.fillText("Rec. Lv " + fmtInt(rec), 128, 46);
    t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.minFilter = THREE.LinearFilter;
    t.generateMipmaps = false;
    texCache.set(key, t);
    return t;
  }

  const barBgMat = new THREE.SpriteMaterial({ color: 0x101010, transparent: true, opacity: 0.7, depthWrite: false, depthTest: true });
  const barFgMat = new THREE.SpriteMaterial({ color: 0xc0141c, transparent: true, opacity: 0.95, depthWrite: false, depthTest: true });

  // plate object attached to an entity root at height y
  function create(name, rec, y, opts = {}) {
    const g = new THREE.Group();
    g.position.y = y;
    const mat = new THREE.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: true });
    const label = new THREE.Sprite(mat);
    label.scale.set(1.6, 0.4, 1);
    label.position.y = 0.25;
    label.renderOrder = 10;
    g.add(label);
    let bg = null, fg = null;
    if (opts.bar !== false) {
      bg = new THREE.Sprite(barBgMat); bg.scale.set(1.0, 0.085, 1); bg.center.set(0.5, 0.5); bg.renderOrder = 10;
      fg = new THREE.Sprite(barFgMat); fg.scale.set(0.98, 0.06, 1); fg.center.set(0, 0.5); fg.position.x = -0.49; fg.renderOrder = 11;
      g.add(bg, fg);
    }
    g.visible = false;
    const p = { group: g, label, bg, fg, name, rec, cls: "", frac: 1, fixedScale: opts.scale || 1 };
    return p;
  }

  function refresh(p, level) {
    const cls = recClass(level, p.rec);
    if (cls === p.cls && p.label.material.map) return;
    p.cls = cls;
    const t = plateTexture(p.name, p.rec, cls);
    p.label.material.map = t;
    p.label.material.needsUpdate = true;
  }

  function setRec(p, rec, level) { if (p.rec !== rec) { p.rec = rec; p.cls = ""; refresh(p, level); } }

  function setHp(p, frac) {
    if (!p.fg) return;
    const f = Math.max(0, Math.min(1, frac));
    if (Math.abs(f - p.frac) < 0.002) return;
    p.frac = f;
    p.fg.scale.x = Math.max(0.0001, 0.98 * f);
  }

  // keep a constant-ish screen size: scale with distance (sprites already face the camera)
  function size(p, dist) {
    const k = p.fixedScale * Math.min(2.2, Math.max(0.8, dist / 9));
    p.group.scale.set(k, k, k);
  }

  return { create, refresh, setRec, setHp, size };
}
