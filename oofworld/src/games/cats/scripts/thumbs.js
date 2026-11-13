// src/games/cats/scripts/thumbs.js - cat pictures for the Index, the found popup and the detail
// panel (spec 28 §7.2). A small software renderer: it projects a finished catkit Group's merged
// meshes with the THREE maths classes and paints the triangles back to front into a 2D canvas
// (flat, two-light shading), with each text label drawn as an affine-mapped image. No second
// WebGL context is ever made: a second context costs seconds to create on a software rasteriser,
// every picture read back from it stalls the GPU process, and phones cap how many a page may hold.
// A ~3000-triangle cat costs a few milliseconds at card size.
//
// A thumbnail is painted once, copied into a data URL and cached, so the 100-card Index costs at
// most THUMBS_PER_TICK pictures per sim step while it fills in and nothing afterwards. Unfound
// cats are the same projection filled pure black: exactly the original's "UNOBTAINED" silhouette.
//
//   createThumbs(THREE, K, getLook) -> {
//     url(n, mode)            "found" | "shadow" -> data URL, or null while queued (re-asks are free)
//     invalidate(n)           forget both pictures of cat n
//     pump(maxRenders)        paints queued thumbnails; returns how many it did
//     pending()               queued count
//     draw(canvas2d, n, mode, angleRad)   paints one large frame into a visible 2D canvas
//     releaseBig()            frees the groups kept for big views
//     ok()                    false only when no 2D canvas can be made (cards fall back to emoji)
//     dispose()
//   }
//   getLook(n) -> a fresh THREE.Group from catkit (the caller's look or the fallback); thumbs
//   frees it with K.disposeGroup after painting.

const THUMB_PX = 128;
const FOV_DEG = 30;
// light: a sky/ground hemisphere plus one sun from the upper left front, as the zones light cats
const SUN = [-0.42, 0.78, -0.47];
const SUN_LEN = Math.hypot(SUN[0], SUN[1], SUN[2]);
const SUN_N = [SUN[0] / SUN_LEN, SUN[1] / SUN_LEN, SUN[2] / SUN_LEN];

function toSrgb(c) {
  const x = c <= 0 ? 0 : c >= 1 ? 1 : c;
  return x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
}

export function createThumbs(THREE, K, getLook) {
  let failed = false;
  let work = null; // the card-size scratch canvas
  const cache = new Map();
  const queue = [];
  const queued = new Set();
  const bigCache = new Map(); // n -> Group kept while a big view is open
  const camera = new THREE.PerspectiveCamera(FOV_DEG, 1, 0.1, 500);
  const vp = new THREE.Matrix4();
  const v = new THREE.Vector3();
  const nrm = new THREE.Vector3();
  const nmat = new THREE.Matrix3();
  // per-vertex scratch, grown on demand
  let sx = new Float32Array(0), sy = new Float32Array(0), sz = new Float32Array(0), sw = new Float32Array(0);
  const tris = []; // reusable draw list entries

  function ensure() {
    if (work || failed) return !!work;
    try {
      work = document.createElement("canvas");
      work.width = THUMB_PX;
      work.height = THUMB_PX;
      if (!work.getContext("2d", { willReadFrequently: true })) throw new Error("no 2D context");
      return true;
    } catch (err) {
      console.warn("[cats] no 2D canvas for cat pictures; the Index shows emoji instead", err);
      failed = true;
      work = null;
      return false;
    }
  }

  function frame(group, angle) {
    const s = group.userData.size || new THREE.Vector3(4, 4, 4);
    const r = Math.max(0.5, Math.hypot(s.x, s.y, s.z) / 2);
    const dist = (r / Math.sin((FOV_DEG * Math.PI) / 360)) * 1.02;
    // the cat faces -Z: look at it from the front, a little to the side and above
    const a = angle + Math.PI + 0.5;
    camera.position.set(Math.sin(a) * dist, dist * 0.28, Math.cos(a) * dist);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();
    vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  }

  function grow(n) {
    if (sx.length >= n) return;
    const m = Math.max(n, sx.length * 2);
    sx = new Float32Array(m); sy = new Float32Array(m); sz = new Float32Array(m); sw = new Float32Array(m);
  }

  function entry(i) {
    if (!tris[i]) tris[i] = { z: 0, x0: 0, y0: 0, x1: 0, y1: 0, x2: 0, y2: 0, style: "", alpha: 1, img: null, quad: false, x3: 0, y3: 0 };
    return tris[i];
  }

  // project every triangle of every mesh in the group into the draw list; returns its length
  function collect(group, px, shadow) {
    group.updateMatrixWorld(true);
    let count = 0;
    const half = px / 2;
    group.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      const geo = o.geometry;
      const pos = geo.attributes.position;
      if (!pos) return;
      const nv = pos.count;
      grow(nv);
      const P = pos.array;
      for (let i = 0; i < nv; i++) {
        v.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]).applyMatrix4(o.matrixWorld);
        const e = vp.elements;
        const x = v.x, y = v.y, z = v.z;
        const w = e[3] * x + e[7] * y + e[11] * z + e[15];
        const iw = w > 1e-4 ? 1 / w : 1e4;
        sx[i] = (1 + (e[0] * x + e[4] * y + e[8] * z + e[12]) * iw) * half;
        sy[i] = (1 - (e[1] * x + e[5] * y + e[9] * z + e[13]) * iw) * half;
        sw[i] = w;
        sz[i] = w; // view depth: larger is farther
      }
      const map = o.material && o.material.map;
      if (map && map.image) {
        // a text label: one textured quad (PlaneGeometry order: TL, TR, BL, BR)
        if (nv < 4) return;
        const area = (sx[1] - sx[0]) * (sy[2] - sy[0]) - (sx[2] - sx[0]) * (sy[1] - sy[0]);
        if (area <= 0) return; // seen from behind (the plane winds TL, TR, BL)
        const t = entry(count++);
        t.z = (sz[0] + sz[1] + sz[2] + sz[3]) / 4 - 0.01;
        t.x0 = sx[0]; t.y0 = sy[0]; t.x1 = sx[1]; t.y1 = sy[1]; t.x2 = sx[2]; t.y2 = sy[2]; t.x3 = sx[3]; t.y3 = sy[3];
        t.quad = true;
        t.img = shadow ? null : map.image;
        // its own run in a silhouette: the quad winds opposite to the triangles, so sharing a
        // nonzero-filled path with them would cut a hole where they overlap
        t.style = shadow ? "#000001" : "";
        t.alpha = 1;
        return;
      }
      const bucket = o.userData.bucket || "solid";
      const neon = bucket === "neon" || bucket === "seeNeon";
      const col = geo.attributes.color;
      const cs = col ? col.itemSize : 0;
      const C = col ? col.array : null;
      const N = geo.attributes.normal ? geo.attributes.normal.array : null;
      nmat.getNormalMatrix(o.matrixWorld);
      const idx = geo.index ? geo.index.array : null;
      const nt = idx ? idx.length / 3 : nv / 3;
      for (let f = 0; f < nt; f++) {
        const a = idx ? idx[f * 3] : f * 3, b = idx ? idx[f * 3 + 1] : f * 3 + 1, c = idx ? idx[f * 3 + 2] : f * 3 + 2;
        if (sw[a] <= 1e-4 || sw[b] <= 1e-4 || sw[c] <= 1e-4) continue;
        const area = (sx[b] - sx[a]) * (sy[c] - sy[a]) - (sx[c] - sx[a]) * (sy[b] - sy[a]);
        if (area >= 0) continue; // back face (or degenerate)
        const t = entry(count++);
        t.img = null;
        t.quad = false;
        t.z = (sz[a] + sz[b] + sz[c]) / 3;
        t.x0 = sx[a]; t.y0 = sy[a]; t.x1 = sx[b]; t.y1 = sy[b]; t.x2 = sx[c]; t.y2 = sy[c];
        t.alpha = cs === 4 ? (C[a * 4 + 3] + C[b * 4 + 3] + C[c * 4 + 3]) / 3 : 1;
        if (shadow) { t.style = "#000000"; continue; }
        let r = 0.8, g = 0.8, bl = 0.8;
        if (C) {
          r = (C[a * cs] + C[b * cs] + C[c * cs]) / 3;
          g = (C[a * cs + 1] + C[b * cs + 1] + C[c * cs + 1]) / 3;
          bl = (C[a * cs + 2] + C[b * cs + 2] + C[c * cs + 2]) / 3;
        }
        let k = 1;
        if (!neon && N) {
          nrm.set(N[a * 3] + N[b * 3] + N[c * 3], N[a * 3 + 1] + N[b * 3 + 1] + N[c * 3 + 1], N[a * 3 + 2] + N[b * 3 + 2] + N[c * 3 + 2])
            .applyMatrix3(nmat).normalize();
          const sun = Math.max(0, nrm.x * SUN_N[0] + nrm.y * SUN_N[1] + nrm.z * SUN_N[2]);
          // quantised, so neighbouring facets share a colour and paint as one path
          k = Math.round((0.42 + 0.22 * (0.5 + 0.5 * nrm.y) + 0.62 * sun) * 24) / 24;
        }
        const R8 = Math.round(toSrgb(r * k) * 255), G8 = Math.round(toSrgb(g * k) * 255), B8 = Math.round(toSrgb(bl * k) * 255);
        t.style = `rgb(${R8},${G8},${B8})`;
      }
    });
    return count;
  }

  // paint the group into a 2D canvas of side px (the canvas may be larger; it is scaled to fit)
  function paint(c2d, group, mode, angle) {
    const px = Math.min(c2d.width, c2d.height) || THUMB_PX;
    frame(group, angle);
    const shadow = mode === "shadow";
    const n = collect(group, px, shadow);
    const list = tris.length === n ? tris : tris.slice(0, n);
    list.sort((p, q) => q.z - p.z);
    // a CPU-backed canvas: thousands of tiny paths are cheaper in software than through a GPU
    // command buffer (and a software-rasterised browser has no GPU at all)
    const c = c2d.getContext("2d", { willReadFrequently: true });
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, c2d.width, c2d.height);
    c.lineJoin = "round";
    c.lineWidth = Math.max(0.6, px / 260);
    // Runs of back-to-front triangles that share a colour and opacity become ONE path: one fill
    // and one seam-covering stroke per run instead of per triangle (a silhouette is one run).
    let style = null, alpha = -1, open = false;
    const flush = () => {
      if (!open) return;
      c.fillStyle = style;
      c.fill();
      if (alpha >= 0.999) {
        // cover the hairline seams anti-aliasing leaves between neighbouring runs
        c.strokeStyle = style;
        c.stroke();
      }
      open = false;
    };
    for (let i = 0; i < n; i++) {
      const t = list[i];
      if (t.img) {
        flush();
        const iw = t.img.width || 1, ih = t.img.height || 1;
        c.save();
        c.globalAlpha = 1;
        c.setTransform((t.x1 - t.x0) / iw, (t.y1 - t.y0) / iw, (t.x2 - t.x0) / ih, (t.y2 - t.y0) / ih, t.x0, t.y0);
        c.drawImage(t.img, 0, 0);
        c.restore();
        continue;
      }
      if (!open || t.style !== style || t.alpha !== alpha) {
        flush();
        style = t.style;
        alpha = t.alpha;
        c.globalAlpha = alpha;
        c.beginPath();
        open = true;
      }
      c.moveTo(t.x0, t.y0);
      c.lineTo(t.x1, t.y1);
      if (t.quad) c.lineTo(t.x3, t.y3); // a label in silhouette: TL, TR, BR, then BL
      c.lineTo(t.x2, t.y2);
      c.closePath();
    }
    flush();
    c.restore();
    for (let i = 0; i < n; i++) tris[i].img = null; // hold no canvases between pictures
  }

  function makeGroup(n) {
    try {
      const g = getLook(n);
      if (g) return g;
    } catch (err) {
      console.warn(`[cats] look ${n} failed; using the fallback cat`, err);
    }
    return K.fallback(n);
  }

  return {
    ok: () => (ensure() ? true : false),
    url(n, mode) {
      const key = n + ":" + mode;
      const hit = cache.get(key);
      if (hit) return hit;
      if (!queued.has(key)) { queued.add(key); queue.push({ n, mode, key }); }
      return null;
    },
    // forget pictures of one cat (its zone's looks just arrived, or it was just found)
    invalidate(n) {
      for (const mode of ["found", "shadow"]) cache.delete(n + ":" + mode);
    },
    pump(max) {
      if (!queue.length || !ensure()) return 0;
      let done = 0;
      while (queue.length && done < max) {
        const job = queue.shift();
        queued.delete(job.key);
        if (cache.has(job.key)) continue;
        const g = makeGroup(job.n);
        try {
          paint(work, g, job.mode, 0.35);
          cache.set(job.key, work.toDataURL("image/png"));
        } catch (err) {
          console.warn("[cats] thumbnail paint failed", err);
        }
        K.disposeGroup(g);
        done++;
      }
      return done;
    },
    pending: () => queue.length,
    draw(canvas2d, n, mode, angle) {
      if (!canvas2d || !ensure()) return false;
      let g = bigCache.get(n);
      if (!g) {
        g = makeGroup(n);
        bigCache.set(n, g);
      }
      try {
        paint(canvas2d, g, mode, angle);
      } catch (err) {
        console.warn("[cats] picture paint failed", err);
        return false;
      }
      return true;
    },
    // free the big-view groups (call when the popup / detail panel closes)
    releaseBig() {
      for (const g of bigCache.values()) K.disposeGroup(g);
      bigCache.clear();
    },
    dispose() {
      for (const g of bigCache.values()) K.disposeGroup(g);
      bigCache.clear();
      cache.clear();
      queue.length = 0;
      queued.clear();
      tris.length = 0;
      work = null;
    },
  };
}
