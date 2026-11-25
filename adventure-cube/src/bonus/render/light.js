// render/light.js - cheap day/night + cave lighting (BONUS_RENDER). DOM.
// A DARKNESS map at 2 px per tile covering the view: per-tile ambient (sky light falling off below the open-sky top
// of each column, spread sideways into cave mouths) written with putImageData, light holes punched with one pre-baked
// radial sprite (destination-out), then composited ONCE over the world layer ("source-atop", smoothed upscale), so the
// sky behind is untouched. Warm additive glows for flames are small sprites drawn by the caller.
import { T } from "../core/const.js";
import { makeCanvas, clamp } from "./kit.js";

const R = 2; // canvas px per tile

export function createLight() {
  let cv = makeCanvas(8, 8), g = cv.getContext("2d"), img = null, cols = 0, rows = 0;
  let br = new Float32Array(0), sk = new Float32Array(0);
  const hole = makeCanvas(64, 64);
  {
    const hg = hole.getContext("2d"), gr = hg.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(0,0,0,1)"); gr.addColorStop(0.35, "rgba(0,0,0,0.85)"); gr.addColorStop(0.7, "rgba(0,0,0,0.38)"); gr.addColorStop(1, "rgba(0,0,0,0)");
    hg.fillStyle = gr; hg.fillRect(0, 0, 64, 64);
  }
  let gx0 = 0, gy0 = 0;

  // build the map for tiles [tx0, tx0+cols) x [ty0, ty0+rows). openTop[x] = first solid row; solidAt(x,y) -> bool.
  // s = sun 0.1..1, f = day fraction. Returns the map (call punch() then composite()).
  function build(tx0, ty0, nc, nr, openTop, W, H, solidAt, s, f, surf) {
    gx0 = tx0; gy0 = ty0;
    if (nc !== cols || nr !== rows) {
      cols = nc; rows = nr; cv = makeCanvas(cols * R, rows * R); g = cv.getContext("2d");
      img = g.createImageData(cols * R, rows * R); br = new Float32Array(cols * rows); sk = new Float32Array(cols * rows);
    }
    // sky brightness: full day 1, moonlit night 0.3
    const sky = 0.3 + 0.7 * clamp((s - 0.1) / 0.9, 0, 1);
    for (let j = 0; j < rows; j++) {
      const ty = ty0 + j;
      for (let i = 0; i < cols; i++) {
        const tx = tx0 + i, k = j * cols + i;
        let v;
        if (tx < 0 || tx >= W) v = 0;
        else {
          const top = openTop[tx], d = ty - top;
          v = d < 1 ? 1 : d < 3 ? 1 - (d - 1) * 0.12 : Math.max(0, 0.76 - (d - 3) * 0.11);
          // the generated surface keeps the topsoil readable even under a placed roof
          const sd = ty - surf[tx];
          if (sd < 4 && v < 0.7) v = Math.max(v, 0.7 - Math.max(0, sd) * 0.15);
        }
        sk[k] = v;
      }
    }
    // spread sideways (cave mouths, overhangs) and downward a little
    for (let j = 0; j < rows; j++) {
      const o = j * cols;
      for (let i = 1; i < cols; i++) { const v = sk[o + i - 1] - 0.16; if (v > sk[o + i]) sk[o + i] = v; }
      for (let i = cols - 2; i >= 0; i--) { const v = sk[o + i + 1] - 0.16; if (v > sk[o + i]) sk[o + i] = v; }
    }
    for (let j = 1; j < rows; j++) for (let i = 0; i < cols; i++) { const k = j * cols + i, v = sk[k - cols] - 0.2; if (v > sk[k]) sk[k] = v; }
    // dusk/dawn warmth (0..1), night blue
    const warm = f > 0.58 && f < 0.74 ? Math.sin(clamp((f - 0.6) / 0.12, 0, 1) * Math.PI) : f < 0.07 ? Math.sin(clamp(f / 0.07, 0, 1) * Math.PI) * 0.8 : 0;
    const nr0 = 6 + warm * 70, ng0 = 12 + warm * 18, nb0 = 38 - warm * 22;
    const d = img.data, w = cols * R;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const k = j * cols + i, so = sk[k];
      const b = Math.max(so * sky, 0.1);
      br[k] = b;
      let a = (1 - b) * 0.94;
      // outdoor grading: warm at dusk even while still bright
      if (so > 0.5 && warm > 0) a = Math.max(a, warm * 0.22 * so);
      const cr = so > 0.3 ? nr0 : 3, cg = so > 0.3 ? ng0 : 3, cb = so > 0.3 ? nb0 : 6;
      const A = Math.round(clamp(a, 0, 1) * 255);
      for (let yy = 0; yy < R; yy++) {
        let p = ((j * R + yy) * w + i * R) * 4;
        for (let xx = 0; xx < R; xx++, p += 4) { d[p] = cr; d[p + 1] = cg; d[p + 2] = cb; d[p + 3] = A; }
      }
    }
    g.globalCompositeOperation = "source-over";
    g.putImageData(img, 0, 0);
    g.globalCompositeOperation = "destination-out";
    return br;
  }
  // punch a light hole: world px center, radius in tiles, strength 0..1
  function punch(wx, wy, rTiles, k = 1) {
    const cx = (wx / T - gx0) * R, cy = (wy / T - gy0) * R, r = rTiles * R;
    if (cx + r < 0 || cy + r < 0 || cx - r > cols * R || cy - r > rows * R) return;
    g.globalAlpha = clamp(k, 0, 1);
    g.drawImage(hole, cx - r, cy - r, r * 2, r * 2);
    g.globalAlpha = 1;
  }
  // brightness at a world point (0..1, before lights) - for sprites that want to know
  function ambientAt(wx, wy) {
    const i = Math.floor(wx / T) - gx0, j = Math.floor(wy / T) - gy0;
    if (i < 0 || j < 0 || i >= cols || j >= rows) return 1;
    return br[j * cols + i];
  }
  // composite onto ctx (world layer). The ctx transform must be world px -> device px: (a, e, f) uniform scale.
  function composite(ctx, a, e, f) {
    g.globalCompositeOperation = "source-over";
    ctx.save();
    ctx.globalCompositeOperation = "source-atop";
    ctx.imageSmoothingEnabled = true;
    ctx.setTransform(a * T / R, 0, 0, a * T / R, a * gx0 * T + e, a * gy0 * T + f);
    ctx.drawImage(cv, 0, 0);
    ctx.restore();
  }
  return { build, punch, composite, ambientAt, get canvas() { return cv; } };
}
