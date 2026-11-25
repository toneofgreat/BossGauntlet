// rater-worker.js - module Web Worker wrapper around rateLevel (RATER owns). Protocol: CONTRACT.md section 8.
//   in : { type: "rate", id, level, opts }
//   out: { type: "progress", id, p, msg } ... then { type: "result", id, result } or { type: "error", id, message }
import { rateLevel } from "./rater.js";

self.onmessage = (e) => {
  const m = e.data || {};
  if (m.type !== "rate") return;
  try {
    const opts = Object.assign({}, m.opts, { onProgress: (p, msg) => self.postMessage({ type: "progress", id: m.id, p, msg }) });
    const result = rateLevel(m.level, opts);
    self.postMessage({ type: "result", id: m.id, result });
  } catch (err) {
    self.postMessage({ type: "error", id: m.id, message: String((err && err.message) || err) });
  }
};
