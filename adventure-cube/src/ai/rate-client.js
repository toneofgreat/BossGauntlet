// rate-client.js - page-side helper: rate a level in a module Web Worker (RATER owns). CONTRACT.md section 8.
// rateAsync(level, { onProgress(p, msg), budgetMs }) -> Promise<result>   never rejects; errors become
//   { difficulty: 10, beatable: false, stats: { error }, inputs: null }
// If module workers are unavailable (or the worker fails to start) it rates on the main thread instead
// (the page freezes for the duration, but the result is identical: the rater is deterministic).
let seq = 0;

function failResult(err) {
  return { difficulty: 10, beatable: false, stats: { error: String((err && err.message) || err || "rating failed") }, inputs: null };
}

function rateOnMainThread(level, opts, onProgress, resolve) {
  import("./rater.js").then(({ rateLevel }) => {
    setTimeout(() => {
      try { resolve(rateLevel(level, Object.assign({}, opts, { onProgress }))); }
      catch (e) { resolve(failResult(e)); }
    }, 0);
  }, (e) => resolve(failResult(e)));
}

export function rateAsync(level, opts = {}) {
  const onProgress = typeof opts.onProgress === "function" ? opts.onProgress : () => {};
  const plainOpts = {};
  for (const k of Object.keys(opts)) if (typeof opts[k] !== "function") plainOpts[k] = opts[k];
  return new Promise((resolve) => {
    let w = null;
    try { w = typeof Worker === "function" ? new Worker(new URL("./rater-worker.js", import.meta.url), { type: "module" }) : null; }
    catch (e) { w = null; }
    if (!w) { rateOnMainThread(level, plainOpts, onProgress, resolve); return; }
    const id = ++seq;
    let heard = false, done = false;
    const finish = (r) => { if (done) return; done = true; try { w.terminate(); } catch (e) { /* ignore */ } resolve(r); };
    w.onmessage = (e) => {
      const m = e.data || {};
      if (m.id !== id) return;
      heard = true;
      if (m.type === "progress") { try { onProgress(m.p, m.msg); } catch (err) { /* ignore */ } }
      else if (m.type === "result") finish(m.result);
      else if (m.type === "error") finish(failResult(m.message));
    };
    w.onerror = (e) => {
      if (e && e.preventDefault) e.preventDefault();
      if (!heard && !done) { // the worker never started (no module-worker support, blocked script): main thread
        done = true; try { w.terminate(); } catch (err) { /* ignore */ }
        rateOnMainThread(level, plainOpts, onProgress, resolve);
        return;
      }
      finish(failResult((e && e.message) || "worker error"));
    };
    try { w.postMessage({ type: "rate", id, level, opts: plainOpts }); }
    catch (e) { finish(failResult(e)); }
  });
}
