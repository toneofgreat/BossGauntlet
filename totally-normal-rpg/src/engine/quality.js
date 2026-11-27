// quality.js - auto quality scaling (CONTRACT 5.7).
// level 0 low, 1 medium, 2 high, 3 ultra. Auto: rolling 3 s average frame time; > 22 ms -> down, < 13 ms for 10 s -> up
// (max 2 on auto, 3 only by setting).

export const QUALITY_TABLE = [
  { pixelRatio: 0.75, prCap: 1, shadow: 512, shadowRadius: 1, grass: 0.08, flowers: 0.25, lodNear: 35, lodMid: 90, lodFar: 200, bloom: false, samples: 0, particles: 200 },
  { pixelRatio: 1, prCap: 1, shadow: 1024, shadowRadius: 2.5, grass: 0.3, flowers: 0.5, lodNear: 45, lodMid: 120, lodFar: 260, bloom: true, samples: 0, particles: 600 },
  { pixelRatio: 1.25, prCap: 1.25, shadow: 2048, shadowRadius: 3, grass: 0.5, flowers: 0.7, lodNear: 60, lodMid: 160, lodFar: 320, bloom: true, samples: 0, particles: 1200 },
  { pixelRatio: 2, prCap: 2, shadow: 2048, shadowRadius: 3.5, grass: 1, flowers: 1, lodNear: 75, lodMid: 190, lodFar: 400, bloom: true, samples: 4, particles: 2000 }
];

export function createQuality(ctx) {
  const listeners = [];
  const hist = new Float32Array(240); // frame ms ring
  let hi = 0, hn = 0;
  let goodTime = 0, sinceChange = 0;
  // vsync caps the frame time at ~16.7 ms, so "< 13 ms" alone never fires on a 60 Hz screen: a steady 60 fps (no
  // frame over 24 ms in the window) also counts as headroom. A level we had to drop from needs longer to come back
  // (30 s, doubling each time) so auto never oscillates.
  const holdUp = [0, 0, 0, 0];
  const q = {
    level: 2,
    auto: true,
    table: QUALITY_TABLE,
    get params() { return QUALITY_TABLE[q.level]; },
    onChange(fn) { listeners.push(fn); return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); }; },
    set(level, fromAuto = false) {
      level = Math.max(0, Math.min(3, level | 0));
      if (level === q.level) return;
      q.level = level;
      sinceChange = 0; goodTime = 0; hn = 0;
      for (let i = 0; i < listeners.length; i++) { try { listeners[i](level); } catch (e) { console.warn("[quality]", e); } }
      if (!fromAuto) { /* explicit set */ }
    },
    applySetting(v) {
      if (v === "auto" || v == null) { q.auto = true; return; }
      q.auto = false;
      const map = { low: 0, medium: 1, high: 2, ultra: 3 };
      const l = typeof v === "number" ? v : (map[v] != null ? map[v] : 2);
      q.set(l);
    },
    // called once per rendered frame with the real frame time in ms
    sample(ms, dtReal) {
      sinceChange += dtReal;
      if (!q.auto) return;
      if (ms > 250) return; // tab switch / hitch: ignore
      hist[hi] = ms; hi = (hi + 1) % hist.length; if (hn < hist.length) hn++;
      if (sinceChange < 3) return;
      // average over ~3 s of frames
      let sum = 0, cnt = 0, t = 0, worst = 0;
      for (let i = 0; i < hn && t < 3000; i++) {
        const v = hist[(hi - 1 - i + hist.length) % hist.length];
        sum += v; t += v; cnt++; if (v > worst) worst = v;
      }
      const avg = cnt ? sum / cnt : 16;
      if (avg > 22 && q.level > 0) {
        const from = q.level;
        holdUp[from] = holdUp[from] ? Math.min(600, holdUp[from] * 2) : 30;
        q.set(q.level - 1, true); return;
      }
      if (avg < 13 || (avg < 17.6 && worst < 24)) {
        goodTime += dtReal;
        if (q.level < 2 && goodTime > Math.max(10, holdUp[q.level + 1])) q.set(q.level + 1, true);
      } else goodTime = 0;
    }
  };
  // initial guess: start at medium everywhere (integrated laptop GPUs cannot hold high at 1080p); auto raises it
  try {
    const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
    const lowMem = typeof navigator !== "undefined" && navigator.deviceMemory && navigator.deviceMemory <= 4;
    q.level = (coarse || lowMem) ? 1 : 1;
  } catch (e) { /* ignore */ }
  return q;
}
