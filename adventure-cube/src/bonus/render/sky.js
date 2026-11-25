// render/sky.js - time-of-day sky, sun, moon, stars, clouds and baked biome parallax (BONUS_RENDER). DOM.
// Everything is drawn in CSS px on the main context. Parallax strips are baked once per biome (day) and their night
// versions lazily; at most two biomes x two times are blended at once (alpha), so a frame is a handful of drawImages.
import { T } from "../core/const.js";
import { paintCloud } from "../../render/art.js";
import { makeCanvas, rng, fbm, hash, css, mix, mixRGB, rgb, clamp, smooth, lg, TAU } from "./kit.js";

const SURF_ROW = 46;
const SW = 1600;                                  // strip width (css px) - tiles horizontally
const BS = 0.75;                                  // bake scale (canvas px per css px)
const LAYERS = [ // f = parallax factor, h = strip height (css px), off = strip bottom below the projected ground
  { f: 0.1, h: 400, off: 120 },
  { f: 0.22, h: 300, off: 130 },
  { f: 0.42, h: 280, off: 150 },
];
export const PBIOMES = ["meadow", "forest", "pinewood", "hills"];

// sky keyframes over the day fraction f (dawn = 0): [f, zenith, mid, horizon]
const KEYS = [
  [0.0, "#2a2f5c", "#8a6a9a", "#f2a27a"],
  [0.035, "#4a78b8", "#b4b0c8", "#ffd0a0"],
  [0.09, "#3f8fd6", "#86c3ea", "#dff0ee"],
  [0.6, "#3f8fd6", "#86c3ea", "#e3f2ea"],
  [0.655, "#4a6fae", "#d6a27a", "#ffb664"],
  [0.69, "#2b3566", "#8a5a78", "#f07a4a"],
  [0.73, "#0c1430", "#1c2850", "#3a3a5c"],
  [0.78, "#050a1e", "#0c1634", "#1b2648"],
  [0.96, "#050a1e", "#0c1634", "#1b2648"],
  [1.0, "#2a2f5c", "#8a6a9a", "#f2a27a"],
];
function skyAt(f) {
  let i = 0; while (i < KEYS.length - 2 && f >= KEYS[i + 1][0]) i++;
  const a = KEYS[i], b = KEYS[i + 1], t = smooth(clamp((f - a[0]) / (b[0] - a[0]), 0, 1));
  return [mixRGB(a[1], b[1], t), mixRGB(a[2], b[2], t), mixRGB(a[3], b[3], t)];
}

export function createSky() {
  const strip = makeCanvas(1, 64), sg = strip.getContext("2d"), sImg = sg.createImageData(1, 64);
  const strips = {};       // biome -> [day canvases per layer]
  const nightStrips = {};
  let stars = null, sunSpr = null, moonSpr = null, glowSpr = null, clouds = null;

  function bakeStars() {
    stars = makeCanvas(1024, 600); const g = stars.getContext("2d"), r = rng(4242);
    for (let i = 0; i < 520; i++) {
      const x = r() * 1024, y = Math.pow(r(), 1.3) * 600, s = r() < 0.06 ? 1.6 : r() < 0.3 ? 1.0 : 0.6, a = 0.35 + r() * 0.65;
      g.fillStyle = `rgba(${220 + r() * 35 | 0},${225 + r() * 30 | 0},255,${a})`; g.beginPath(); g.arc(x, y, s, 0, TAU); g.fill();
      if (s > 1.2) { g.fillStyle = "rgba(200,220,255,0.15)"; for (const ox of [0, -1024, 1024]) { g.beginPath(); g.arc(x + ox, y, 4, 0, TAU); g.fill(); } }
    }
    // a faint milky band - periodic across the 1024 px tile (and every blob wrapped) so the tiles meet without the
    // hard vertical/top edge a sloped band left at each seam
    for (let i = 0; i < 300; i++) {
      const x = r() * 1024, y = 190 + Math.sin((x / 1024) * TAU) * 70 + (r() - 0.5) * 120, rad = 8 + r() * 18;
      g.fillStyle = "rgba(200,210,255,0.025)";
      for (const ox of [0, -1024, 1024]) { if (x + ox + rad < 0 || x + ox - rad > 1024) continue; g.beginPath(); g.arc(x + ox, y, rad, 0, TAU); g.fill(); }
    }
  }
  function bakeSunMoon() {
    sunSpr = makeCanvas(256, 256); let g = sunSpr.getContext("2d");
    let gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    gr.addColorStop(0, "rgba(255,252,235,1)"); gr.addColorStop(0.12, "rgba(255,248,215,1)"); gr.addColorStop(0.16, "rgba(255,236,180,0.55)"); gr.addColorStop(0.4, "rgba(255,226,160,0.16)"); gr.addColorStop(1, "rgba(255,220,150,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    glowSpr = makeCanvas(256, 256); g = glowSpr.getContext("2d");
    gr = g.createRadialGradient(128, 128, 0, 128, 128, 128); gr.addColorStop(0, "rgba(255,170,90,0.55)"); gr.addColorStop(0.35, "rgba(255,130,70,0.2)"); gr.addColorStop(1, "rgba(255,120,60,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    moonSpr = makeCanvas(160, 160); g = moonSpr.getContext("2d");
    gr = g.createRadialGradient(80, 80, 0, 80, 80, 80); gr.addColorStop(0, "rgba(200,215,255,0.35)"); gr.addColorStop(0.25, "rgba(170,190,255,0.12)"); gr.addColorStop(1, "rgba(160,180,255,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 160, 160);
    gr = g.createRadialGradient(74, 74, 2, 80, 80, 18); gr.addColorStop(0, "#fbfbf2"); gr.addColorStop(1, "#d9dccf");
    g.fillStyle = gr; g.beginPath(); g.arc(80, 80, 18, 0, TAU); g.fill();
    const r = rng(77); g.fillStyle = "rgba(150,155,150,0.35)";
    for (let i = 0; i < 9; i++) { const a = r() * TAU, d = r() * 13; g.beginPath(); g.arc(80 + Math.cos(a) * d, 80 + Math.sin(a) * d, 1.5 + r() * 3.5, 0, TAU); g.fill(); }
  }
  function bakeClouds() {
    clouds = [];
    for (let i = 0; i < 6; i++) {
      const r = rng(1000 + i * 17), w = 220 + r() * 220;
      const mk = (col, shadeCol, al) => { const c = makeCanvas(w * 1.7 * BS, w * 0.9 * BS), g = c.getContext("2d"); g.scale(BS, BS); paintCloud(g, w * 0.85, w * 0.5, w, col, shadeCol, al, rng(1000 + i * 17)); return c; };
      clouds.push({ w, day: mk("#ffffff", "#c9dcea", 0.9), dusk: mk("#ffd9b8", "#b07a90", 0.9), night: mk("#3a4466", "#141a30", 0.85), x: r() * 3000, y: 0.05 + r() * 0.22, sp: 4 + r() * 6, par: 0.03 + r() * 0.04 });
    }
  }

  // ------------------------------------------------------------------ parallax strip painters
  function paintStrip(biome, li) {
    const L = LAYERS[li], h = L.h;
    const c = makeCanvas(SW * BS, h * BS), g = c.getContext("2d"); g.scale(BS, BS);
    const seed = PBIOMES.indexOf(biome) * 100 + li * 10 + 7, r = rng(seed * 991 + 3);
    const P = 8; // periodic noise period across the strip
    const prof = (x, amp, base, s, oct = 5, sharp = false) => { let v = fbm((x / SW) * P, 0.5, P, s, oct); if (sharp) v = 1 - Math.abs(v * 2 - 1); return h - base - v * amp; };
    if (li === 0) {
      // far ranges: aerial blue, snowy peaks in the hills / pinewood
      const tall = biome === "hills" ? 1 : biome === "pinewood" ? 0.75 : biome === "forest" ? 0.45 : 0.32;
      const ranges = [["#b7cfdc", 0.75, 30], ["#9dbdd0", 1, 0]];
      for (let k = 0; k < 2; k++) {
        const [col, sc, lift] = ranges[k], amp = (90 + 230 * tall) * sc, base = 30 + lift;
        const ys = new Float32Array(SW + 1);
        for (let x = 0; x <= SW; x++) ys[x] = prof(x, amp, base, seed + k * 5, 5, tall > 0.6);
        g.fillStyle = lg(g, 0, h - base - amp, 0, h, [[0, mix(col, "#e8f2f6", 0.15)], [1, mix(col, "#dbe9ea", 0.55)]]);
        g.beginPath(); g.moveTo(0, h); for (let x = 0; x <= SW; x += 2) g.lineTo(x, ys[x]); g.lineTo(SW, h); g.closePath(); g.fill();
        // sunlit left faces + shadowed right faces
        for (let x = 2; x <= SW; x += 2) {
          const d = ys[x] - ys[x - 2];
          if (d > 0.4) { g.fillStyle = `rgba(40,70,100,${Math.min(0.22, d * 0.05)})`; g.fillRect(x - 2, ys[x], 2, (h - ys[x]) * 0.5); }
          else if (d < -0.4) { g.fillStyle = `rgba(255,250,235,${Math.min(0.2, -d * 0.04)})`; g.fillRect(x - 2, ys[x], 2, (h - ys[x]) * 0.35); }
        }
        if (tall > 0.6) { // snow
          const line = h - base - amp * 0.62;
          g.save(); g.beginPath(); g.moveTo(0, h); for (let x = 0; x <= SW; x += 2) g.lineTo(x, ys[x]); g.lineTo(SW, h); g.closePath(); g.clip();
          g.fillStyle = "rgba(250,252,255,0.9)"; g.beginPath(); g.moveTo(0, 0);
          for (let x = 0; x <= SW; x += 4) g.lineTo(x, line + Math.sin(x * 0.05) * 8 + fbm((x / SW) * P * 4, 2.5, P * 4, seed + 9, 2) * 24);
          g.lineTo(SW, 0); g.closePath(); g.fill(); g.restore();
        }
      }
      g.fillStyle = lg(g, 0, h - 120, 0, h, [[0, "rgba(225,238,238,0)"], [1, "rgba(225,238,238,0.75)"]]); g.fillRect(0, h - 120, SW, 120);
    } else if (li === 1) {
      const col = biome === "hills" ? "#87a08e" : biome === "pinewood" ? "#5f8a78" : "#73a07e", amp = biome === "hills" ? 150 : biome === "meadow" ? 50 : 80;
      const ys = new Float32Array(SW + 1);
      for (let x = 0; x <= SW; x++) ys[x] = prof(x, amp, 40, seed + 1, 4, biome === "hills");
      g.fillStyle = lg(g, 0, h - 40 - amp, 0, h, [[0, col], [1, mix(col, "#d6e8e0", 0.45)]]);
      g.beginPath(); g.moveTo(0, h); for (let x = 0; x <= SW; x += 2) g.lineTo(x, ys[x]); g.lineTo(SW, h); g.closePath(); g.fill();
      // tree clumps / rocks along the ridge
      const n = biome === "meadow" ? 26 : biome === "hills" ? 18 : 90;
      for (let i = 0; i < n; i++) {
        const x = r() * SW, y = ys[Math.floor(x) | 0] + 4 + r() * 30, s = 0.6 + r() * 0.7;
        for (const ox of [0, -SW, SW]) {
          if (biome === "pinewood" || (biome === "hills" && r() < 0.5)) farPine(g, x + ox, y, 10 * s, 46 * s, mix(col, "#2f5040", 0.55), mix(col, "#a8c8b0", 0.25));
          else if (biome === "hills") farRock(g, x + ox, y, 14 * s, mix(col, "#5a6a68", 0.5));
          else farTree(g, x + ox, y, 18 * s, mix(col, "#34583e", 0.5), mix(col, "#b0d0a0", 0.35));
        }
      }
      g.fillStyle = lg(g, 0, h - 90, 0, h, [[0, "rgba(220,236,230,0)"], [1, "rgba(220,236,230,0.6)"]]); g.fillRect(0, h - 90, SW, 90);
    } else {
      const col = biome === "hills" ? "#6f8a68" : biome === "pinewood" ? "#2f5242" : biome === "meadow" ? "#5c8a4a" : "#3d6b42";
      const amp = biome === "hills" ? 90 : biome === "meadow" ? 30 : 40;
      const ys = new Float32Array(SW + 1);
      for (let x = 0; x <= SW; x++) ys[x] = prof(x, amp, 50, seed + 2, 4);
      g.fillStyle = lg(g, 0, h - 50 - amp, 0, h, [[0, col], [1, mix(col, "#c8dccb", 0.35)]]);
      g.beginPath(); g.moveTo(0, h); for (let x = 0; x <= SW; x += 2) g.lineTo(x, ys[x]); g.lineTo(SW, h); g.closePath(); g.fill();
      const n = biome === "meadow" ? 14 : biome === "hills" ? 10 : 60;
      const items = [];
      for (let i = 0; i < n; i++) { const x = r() * SW; items.push([x, ys[Math.floor(x) | 0] + 6 + r() * 20, 0.7 + r() * 0.6, r()]); }
      items.sort((a, b) => a[1] - b[1]);
      for (const [x, y, s, q] of items) for (const ox of [0, -SW, SW]) {
        if (biome === "pinewood" || (biome === "hills" && q < 0.6)) farPine(g, x + ox, y, 16 * s, 90 * s, mix(col, "#173226", 0.45), mix(col, "#7fa888", 0.3));
        else if (biome === "hills") farRock(g, x + ox, y, 26 * s, mix(col, "#56605a", 0.5));
        else farTree(g, x + ox, y, 34 * s, mix(col, "#21412a", 0.45), mix(col, "#9cc480", 0.35), true);
      }
      if (biome === "meadow") { // hedgerow
        for (let x = 0; x < SW; x += 6) { g.fillStyle = mix(col, "#2a4a26", 0.35 + (hash(x, 1, 5) * 0.2)); g.beginPath(); g.arc(x, ys[x | 0] + 8, 7 + hash(x, 2, 5) * 6, 0, TAU); g.fill(); }
      }
      g.fillStyle = lg(g, 0, h - 70, 0, h, [[0, "rgba(210,228,214,0)"], [1, "rgba(210,228,214,0.45)"]]); g.fillRect(0, h - 70, SW, 70);
    }
    return c;
  }
  function farTree(g, x, y, s, dark, lit, trunk) {
    if (trunk) { g.fillStyle = mix(dark, "#2a2219", 0.5); g.fillRect(x - s * 0.06, y - s * 0.9, s * 0.12, s * 0.9); }
    g.fillStyle = dark;
    g.beginPath(); g.arc(x, y - s * 1.15, s * 0.62, 0, TAU); g.arc(x - s * 0.42, y - s * 0.8, s * 0.45, 0, TAU); g.arc(x + s * 0.45, y - s * 0.85, s * 0.48, 0, TAU); g.fill();
    g.fillStyle = lit;
    g.beginPath(); g.arc(x - s * 0.18, y - s * 1.32, s * 0.36, 0, TAU); g.arc(x - s * 0.5, y - s * 0.95, s * 0.22, 0, TAU); g.fill();
  }
  function farPine(g, x, y, w, h, dark, lit) {
    g.fillStyle = dark; g.beginPath(); g.moveTo(x, y - h);
    const tiers = 5;
    for (let i = 1; i <= tiers; i++) { const ty = y - h + (h * 0.92 * i) / tiers, tw = w * (0.35 + (0.65 * i) / tiers); g.lineTo(x + tw, ty); g.lineTo(x + tw * 0.45, ty - h * 0.04); }
    for (let i = tiers; i >= 1; i--) { const ty = y - h + (h * 0.92 * i) / tiers, tw = w * (0.35 + (0.65 * i) / tiers); g.lineTo(x - tw * 0.45, ty - h * 0.04); g.lineTo(x - tw, ty); }
    g.closePath(); g.fill();
    g.fillStyle = lit; g.beginPath(); g.moveTo(x, y - h); g.lineTo(x - w * 0.5, y - h * 0.45); g.lineTo(x - w * 0.1, y - h * 0.5); g.closePath(); g.fill();
    g.fillStyle = dark; g.fillRect(x - w * 0.06, y - h * 0.1, w * 0.12, h * 0.12);
  }
  function farRock(g, x, y, s, col) {
    g.fillStyle = col; g.beginPath(); g.moveTo(x - s, y); g.lineTo(x - s * 0.7, y - s * 0.7); g.lineTo(x - s * 0.1, y - s); g.lineTo(x + s * 0.6, y - s * 0.6); g.lineTo(x + s, y); g.closePath(); g.fill();
    g.fillStyle = "rgba(255,250,235,0.25)"; g.beginPath(); g.moveTo(x - s * 0.7, y - s * 0.7); g.lineTo(x - s * 0.1, y - s); g.lineTo(x - s * 0.3, y - s * 0.3); g.closePath(); g.fill();
  }
  function nightOf(c) {
    const n = makeCanvas(c.width, c.height), g = n.getContext("2d");
    g.drawImage(c, 0, 0); g.globalCompositeOperation = "source-atop";
    g.fillStyle = "rgba(10,18,44,0.8)"; g.fillRect(0, 0, n.width, n.height);
    return n;
  }
  function getStrip(b, li, night) {
    let s = strips[b]; if (!s) s = strips[b] = [];
    if (!s[li]) s[li] = paintStrip(b, li);
    if (!night) return s[li];
    let n = nightStrips[b]; if (!n) n = nightStrips[b] = [];
    if (!n[li]) n[li] = nightOf(s[li]);
    return n[li];
  }
  // pre-bake the strips of the biomes near x (spreads the cost)
  function warm(biomes) { for (const b of biomes) for (let li = 0; li < 3; li++) getStrip(b, li, false); }

  // ------------------------------------------------------------------ per frame
  // weights: { biome: w } (sum 1), f = day fraction, s = sun 0.1..1
  function draw(ctx, cssW, cssH, cam, f, s, weights, time) {
    if (!stars) { bakeStars(); bakeSunMoon(); bakeClouds(); }
    // sky gradient strip
    const [z, m, hz] = skyAt(f), d = sImg.data;
    for (let i = 0; i < 64; i++) {
      const t = i / 63, c = t < 0.55 ? mixRGB(z, m, smooth(t / 0.55)) : mixRGB(m, hz, smooth((t - 0.55) / 0.45));
      d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = 255;
    }
    sg.putImageData(sImg, 0, 0);
    const horizon = cssH / 2 + (SURF_ROW * T - cam.y) * cam.zoom * 0.1 + 40;
    const skyH = Math.max(cssH * 0.6, horizon + 40);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(strip, 0, 0, 1, 64, 0, 0, cssW, skyH);
    if (skyH < cssH) { ctx.fillStyle = css(hz); ctx.fillRect(0, skyH - 1, cssW, cssH - skyH + 1); }
    // stars
    const sa = clamp((0.62 - s) / 0.5, 0, 1);
    if (sa > 0.01) {
      ctx.globalAlpha = sa;
      const ox = -((cam.x * cam.zoom * 0.02 + time * 0.6) % 1024);
      for (let x = ox; x < cssW; x += 1024) ctx.drawImage(stars, x, 0);
      ctx.globalAlpha = 1;
    }
    // sun / moon
    const sunU = f / 0.7;
    if (sunU > -0.05 && sunU < 1.05) {
      const el = Math.sin(clamp(sunU, 0, 1) * Math.PI), sx = cssW * (0.06 + 0.88 * sunU), sy = horizon - el * (horizon - cssH * 0.1) + 20;
      const low = 1 - clamp(el * 2.2, 0, 1);
      if (low > 0.02) { ctx.globalAlpha = low; ctx.drawImage(glowSpr, sx - 300, sy - 300, 600, 600); ctx.globalAlpha = 1; }
      const sz = 170 + low * 80;
      ctx.drawImage(sunSpr, sx - sz / 2, sy - sz / 2, sz, sz);
    }
    const mU = (f - 0.68) / 0.34;
    if (mU > 0 && mU < 1) {
      const el = Math.sin(mU * Math.PI), mx = cssW * (0.1 + 0.8 * mU), my = horizon - el * (horizon - cssH * 0.12) + 10;
      ctx.globalAlpha = clamp((0.6 - s) * 2.5, 0, 1); ctx.drawImage(moonSpr, mx - 80, my - 80); ctx.globalAlpha = 1;
    }
    // clouds
    const tint = clamp(1 - s, 0, 1), dusk = (f > 0.6 && f < 0.72) || f < 0.06 ? 1 : 0;
    for (const cl of clouds) {
      // sprites carry room for every puff (1.7w x 0.9w, centre at 0.85w, 0.5w) so no edge is ever clipped
      const span = cssW + cl.w * 1.8;
      let x = (cl.x + time * cl.sp - cam.x * cam.zoom * cl.par) % span; if (x < 0) x += span; x -= cl.w * 1.55;
      x -= cl.w * 0.2;
      const y = cssH * cl.y + (horizon - cssH * 0.72) * 0.3 - cl.w * 0.08, w = cl.w * 1.7, hh = cl.w * 0.9;
      const base = dusk && tint > 0.1 ? cl.dusk : cl.day;
      ctx.globalAlpha = 1 - tint * 0.9; ctx.drawImage(base, x, y, w, hh);
      if (tint > 0.1) { ctx.globalAlpha = tint; ctx.drawImage(cl.night, x, y, w, hh); }
      ctx.globalAlpha = 1;
    }
    // parallax layers, blended by biome weight and day/night
    const nightA = clamp((1 - s) / 0.75, 0, 1);
    for (let li = 0; li < 3; li++) {
      const L = LAYERS[li];
      const bottom = cssH / 2 + (SURF_ROW * T - cam.y) * cam.zoom * L.f + L.off * (cam.zoom / 1.3);
      const sc = cam.zoom / 1.3 * (0.85 + L.f * 0.6), w = SW * sc, h = L.h * sc, top = bottom - h;
      if (top > cssH) continue;
      let ox = -((cam.x * cam.zoom * L.f) % w); if (ox > 0) ox -= w;
      let first = true;
      for (const b of PBIOMES) {
        const wt = weights[b] || 0; if (wt < 0.01) continue;
        const a = first ? 1 : wt; // first layer fully opaque; the others blend over it
        for (const night of [false, true]) {
          const na = night ? nightA : 1 - nightA; if (na < 0.01) continue;
          const spr = getStrip(b, li, night);
          ctx.globalAlpha = night && nightA < 0.99 && !(1 - nightA < 0.01) ? a * nightA : a;
          for (let x = ox; x < cssW; x += w) ctx.drawImage(spr, x, top, w + 0.5, h);
        }
        first = false;
      }
      ctx.globalAlpha = 1;
      // fill below the strip so nothing shows through
      if (bottom < cssH) {
        const col = li === 2 ? "#4e7656" : li === 1 ? "#a9c8bc" : "#c6dbe0";
        ctx.fillStyle = nightA > 0.5 ? mix(col, "#0a1230", 0.8) : col; ctx.fillRect(0, bottom - 1, cssW, cssH - bottom + 1);
      }
    }
  }
  return { draw, warm, skyAt };
}
