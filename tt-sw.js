/* platyfy TIME MACHINE service worker  (scope "/")
 *
 * !!! ROLLBACK: NEVER DELETE THIS FILE. If /tt-sw.js answers 404, browsers keep the old
 * !!! worker installed and in control of every platyfy page forever. To switch the time
 * !!! machine off, copy timetravel/tt-sw.killswitch.js over this file and push; every
 * !!! visitor's worker then deletes its caches and unregisters itself on the next visit.
 * !!! (See timetravel/README.md, "Rollback".)
 *
 * It only ever answers:
 *   1. /tt/<40-hex-sha>/<path>  -> that file as it was at commit <sha>, fetched from
 *      raw.githubusercontent.com (jsDelivr as a hedge/fallback), re-typed by extension,
 *      cached immutably in Cache Storage (LRU, size-capped). HTML documents get the
 *      time-travel shim + /timemachine.js injected first thing in <head>.
 *   2. root-absolute same-origin requests made FROM a snapshot (referrer or known client
 *      inside /tt/<sha>/) -> rewritten into that snapshot (navigations are redirected so
 *      the address bar stays in time; subresources are served from the snapshot).
 *   3. non-GET requests to live backends (play counter, relay, firebase) from known
 *      snapshot clients -> faked (belt and braces; the injected page shim is primary).
 * Everything else returns WITHOUT respondWith: the present-day site goes to the network
 * exactly as if this worker did not exist. Present pages are never cached or altered.
 */
"use strict";

const SW_VERSION = "tt-sw-2";
const REPO = "toneofgreat/BossGauntlet";
const TZ = "America/New_York";
const FILE_CACHE = "tt-files-v1";
const META_CACHE = "tt-meta-v1";
const CACHE_PREFIX = "tt-";
const KEY_BASE = self.location.origin + "/__tt_cache__/";
const IDX_KEY = self.location.origin + "/__tt_meta__/index.json";
const MAX_CACHE_BYTES = 150 * 1024 * 1024; // whole-cache cap
const MAX_ITEM_BYTES = 5 * 1024 * 1024;    // never cache files bigger than this
const JSD_MAX_BYTES = 20 * 1024 * 1024;    // jsDelivr refuses files over 20 MB
const HEDGE_MS = 1500;                     // start jsDelivr if raw has no headers by then
const MAX_CONCURRENT = 12;

const TT_RE = /^\/tt\/([0-9a-f]{40})(\/.*)?$/;
// Present-only paths: never rewritten into a snapshot, even when a snapshot asks for them.
const PRESENT_ONLY_RE = /^\/(?:tt\/|timemachine\.js|tt-sw\.js|404\.html|timetravel\/|__tt_)/;
const BACKEND_RE = /(^|\.)(plays\.platyfy\.com|relay\.platyfy\.com|firebaseio\.com|firebasedatabase\.app)$/i;

const MIME = {
  html: "text/html; charset=utf-8", htm: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8", mjs: "text/javascript; charset=utf-8", cjs: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8", json: "application/json; charset=utf-8", map: "application/json; charset=utf-8",
  webmanifest: "application/manifest+json", wasm: "application/wasm", xml: "application/xml; charset=utf-8",
  svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
  webp: "image/webp", avif: "image/avif", ico: "image/x-icon", bmp: "image/bmp",
  wav: "audio/wav", mp3: "audio/mpeg", ogg: "audio/ogg", oga: "audio/ogg", m4a: "audio/mp4", aac: "audio/aac",
  flac: "audio/flac", opus: "audio/ogg", mp4: "video/mp4", webm: "video/webm", ogv: "video/ogg", mov: "video/quicktime",
  woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf", eot: "application/vnd.ms-fontobject",
  txt: "text/plain; charset=utf-8", md: "text/plain; charset=utf-8", lua: "text/plain; charset=utf-8",
  luau: "text/plain; charset=utf-8", toml: "text/plain; charset=utf-8", yml: "text/plain; charset=utf-8",
  yaml: "text/plain; charset=utf-8", csv: "text/plain; charset=utf-8", rbxlx: "text/plain; charset=utf-8",
  glsl: "text/plain; charset=utf-8", frag: "text/plain; charset=utf-8", vert: "text/plain; charset=utf-8",
  pdf: "application/pdf", zip: "application/zip", glb: "model/gltf-binary", gltf: "model/gltf+json",
  obj: "text/plain; charset=utf-8", bin: "application/octet-stream",
};
const MEDIA_EXT = new Set(["wav", "mp3", "ogg", "oga", "m4a", "aac", "flac", "opus", "mp4", "webm", "ogv", "mov"]);

/* ------------------------------------------------------------------ lifecycle */
self.addEventListener("install", () => { self.skipWaiting(); });
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keep = new Set([FILE_CACHE, META_CACHE]);
    for (const k of await caches.keys()) if (k.startsWith(CACHE_PREFIX) && !keep.has(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener("message", (event) => {
  const d = event.data || {};
  if (d.type === "tt:ping" && event.source) event.source.postMessage({ type: "tt:pong", version: SW_VERSION });
  if (d.type === "tt:clear-cache") event.waitUntil(Promise.all([caches.delete(FILE_CACHE), caches.delete(META_CACHE)]).then(() => { idx = null; }));
});

/* ------------------------------------------------------------------ routing */
// clientId -> sha for pages we served from a snapshot (lost when the worker sleeps;
// referrers + the in-page shim cover that).
const ttClients = new Map();

function shaFromUrl(u) {
  if (!u) return null;
  try {
    const x = new URL(u);
    if (x.origin !== self.location.origin) return null;
    const m = TT_RE.exec(x.pathname);
    return m ? m[1] : null;
  } catch (e) { return null; }
}
function isDocRequest(req) {
  return req.mode === "navigate" || req.destination === "document" || req.destination === "iframe" || req.destination === "frame";
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  let url;
  try { url = new URL(req.url); } catch (e) { return; }

  if (url.origin === self.location.origin) {
    const m = TT_RE.exec(url.pathname);
    if (m) {
      const sha = m[1];
      if (event.resultingClientId && isDocRequest(req)) ttClients.set(event.resultingClientId, sha);
      if (event.clientId && shaFromUrl(req.referrer)) ttClients.set(event.clientId, shaFromUrl(req.referrer));
      event.respondWith(serveSnapshot(req, sha, m[2] || "", url));
      return;
    }
    if (url.pathname === "/__tt_blocked__") { // XHR to a live backend from a snapshot (see shim)
      event.respondWith(fakeBackendResponse());
      return;
    }
    if (PRESENT_ONLY_RE.test(url.pathname)) return;

    // Root-absolute request coming from inside a snapshot?
    // Navigations: referrer only (event.clientId of a navigation is the INITIATING page, and
    // the time machine leaves a snapshot with a no-referrer link, so it must not be sticky).
    const isDoc = isDocRequest(req);
    const sha = shaFromUrl(req.referrer) || (!isDoc && event.clientId && ttClients.get(event.clientId)) || null;
    if (!sha) return; // present day: untouched
    if (isDoc) {
      event.respondWith(Response.redirect(self.location.origin + "/tt/" + sha + url.pathname + url.search, 302));
    } else {
      event.respondWith(serveSnapshot(req, sha, url.pathname, url));
    }
    return;
  }

  // Cross-origin: only fake writes to live backends from known snapshot clients.
  if (req.method !== "GET" && req.method !== "HEAD" && BACKEND_RE.test(url.hostname)) {
    const sha = (event.clientId && ttClients.get(event.clientId)) || shaFromUrl(req.referrer);
    if (sha) event.respondWith(fakeBackendResponse());
  }
});

function fakeBackendResponse() {
  return new Response('{"ok":true,"timeTravel":true}', {
    status: 200,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" },
  });
}

/* ------------------------------------------------------------------ snapshot serving */
function extOf(path) {
  const last = path.slice(path.lastIndexOf("/") + 1);
  const dot = last.lastIndexOf(".");
  return dot > 0 ? last.slice(dot + 1).toLowerCase() : "";
}
function mimeOf(path) { return MIME[extOf(path)] || "application/octet-stream"; }
function normalizePath(rest) {
  // rest is "" or "/..."; strip leading "/", decode + re-encode each segment.
  let p = rest.replace(/^\/+/, "");
  p = p.split("/").map((s) => { try { return encodeURIComponent(decodeURIComponent(s)); } catch (e) { return encodeURIComponent(s); } }).join("/");
  if (p === "" || p.endsWith("/")) p += "index.html";
  return p;
}
function baseHeaders(path, sha, extra) {
  const h = new Headers(extra || {});
  h.set("Content-Type", mimeOf(path));
  h.set("Cache-Control", "no-store");
  h.set("X-TT-Sha", sha);
  if (MEDIA_EXT.has(extOf(path))) h.set("Accept-Ranges", "bytes");
  return h;
}

async function serveSnapshot(req, sha, rest, url) {
  try {
    if (req.method !== "GET" && req.method !== "HEAD") {
      return new Response("Time travelers can look but not post.", { status: 405, headers: { "Content-Type": "text/plain" } });
    }
    if (rest === "") return Response.redirect(self.location.origin + "/tt/" + sha + "/" + url.search, 301);
    const path = normalizePath(rest);
    const isDoc = isDocRequest(req);
    const ext = extOf(path);
    touchSha(sha);

    // Media range requests (Safari needs real 206s)
    const range = req.headers.get("range");
    if (range && MEDIA_EXT.has(ext)) return await serveRange(req, sha, path, range);

    if (isDoc) commitInfo(sha); // warm banner info in parallel
    const file = await getFile(sha, path, { media: MEDIA_EXT.has(ext) });

    if (file.status === 404) {
      const last = path.split("/").pop();
      const wasDirGuess = !rest.endsWith("/") && rest !== "/" && !last.includes(".");
      if (wasDirGuess) {
        const probe = await getFile(sha, path + "/index.html", {});
        if (probe.status === 200) {
          return Response.redirect(self.location.origin + "/tt/" + sha + "/" + path + "/" + url.search, 301);
        }
      }
      if (isDoc) return htmlResponse(await missingPage(sha, path), 404);
      return new Response("404: not in this snapshot", { status: 404, headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" } });
    }
    if (file.status !== 200) {
      if (isDoc) return htmlResponse(await errorPage(sha, path, file.status), 504);
      return new Response("time travel fetch failed", { status: 504, headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" } });
    }

    const headBody = req.method === "HEAD";
    if (isDoc && (ext === "html" || ext === "htm")) {
      const html = new TextDecoder("utf-8").decode(file.buf);
      const out = injectHtml(html, await injectSnippet(sha, path, false));
      return htmlResponse(headBody ? null : out, 200, sha);
    }
    const h = baseHeaders(path, sha);
    if (file.buf) h.set("Content-Length", String(file.buf.byteLength));
    else if (file.length) h.set("Content-Length", String(file.length));
    return new Response(headBody ? null : (file.buf || file.stream), { status: 200, headers: h });
  } catch (err) {
    if (isDocRequest(req)) return htmlResponse(await errorPage(sha, rest, String(err && err.message || err)), 504);
    return new Response("time travel error", { status: 504 });
  }
}

function htmlResponse(body, status, sha) {
  const h = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" };
  if (sha) h["X-TT-Sha"] = sha;
  return new Response(body, { status, headers: h });
}

async function serveRange(req, sha, path, range) {
  // Cached? slice locally.
  const cache = await caches.open(FILE_CACHE);
  const hit = await cache.match(KEY_BASE + sha + "/" + path);
  if (hit) {
    const buf = await hit.arrayBuffer();
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    const size = buf.byteLength;
    let start = m && m[1] !== "" ? parseInt(m[1], 10) : 0;
    let end = m && m[2] !== "" ? parseInt(m[2], 10) : size - 1;
    if (m && m[1] === "" && m[2] !== "") { start = Math.max(0, size - parseInt(m[2], 10)); end = size - 1; }
    end = Math.min(end, size - 1);
    if (start > end || start >= size) return new Response(null, { status: 416, headers: { "Content-Range": "bytes */" + size } });
    const h = baseHeaders(path, sha, { "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) });
    return new Response(buf.slice(start, end + 1), { status: 206, headers: h });
  }
  // Otherwise forward the range to raw (it answers 206 itself). Never cached.
  // raw does not expose Content-Range to CORS, so learn the total size once (headers of a
  // plain GET, then abort) and rebuild Content-Range ourselves (Safari insists on it).
  const [res, total] = await Promise.all([
    limited(() => fetchT(rawUrl(sha, path), 30000, { headers: { Range: range } })),
    remoteSize(sha, path),
  ]);
  if (res.status === 404) return new Response("404", { status: 404 });
  const h = baseHeaders(path, sha);
  const cl = res.headers.get("content-length"); if (cl) h.set("Content-Length", cl);
  if (res.status !== 206) return new Response(res.body, { status: res.status, headers: h });
  let cr = res.headers.get("content-range");
  const m = /bytes=(\d*)-(\d*)/.exec(range);
  if (!cr && m && cl && total) {
    const len = parseInt(cl, 10);
    const start = m[1] !== "" ? parseInt(m[1], 10) : Math.max(0, total - len);
    cr = `bytes ${start}-${start + len - 1}/${total}`;
  }
  if (!cr) return new Response(res.body, { status: 206, headers: h }); // best effort (Chrome is fine)
  h.set("Content-Range", cr);
  return new Response(res.body, { status: 206, headers: h });
}
const sizeMemo = new Map();
function remoteSize(sha, path) {
  const key = sha + "/" + path;
  if (!sizeMemo.has(key)) {
    sizeMemo.set(key, (async () => {
      try {
        const p = fetchT(rawUrl(sha, path), 30000);
        const r = await p;
        const n = parseInt(r.headers.get("content-length") || "", 10);
        p.abort();
        if (Number.isFinite(n) && r.ok) return n;
      } catch (e) {}
      sizeMemo.delete(key);
      return 0;
    })());
  }
  return sizeMemo.get(key);
}

/* ------------------------------------------------------------------ upstream + cache */
const rawUrl = (sha, path) => `https://raw.githubusercontent.com/${REPO}/${sha}/${path}`;
const jsdUrl = (sha, path) => `https://cdn.jsdelivr.net/gh/${REPO}@${sha}/${path}`;
const inflight = new Map();
const missing = new Set(); // in-memory negative cache (sha/path)

// Resolves to { status, buf?: ArrayBuffer, stream?: ReadableStream, length?: number }.
function getFile(sha, path, opts) {
  const key = sha + "/" + path;
  if (missing.has(key)) return Promise.resolve({ status: 404 });
  if (inflight.has(key)) return inflight.get(key).then((r) => (r.stream ? getFile(sha, path, opts) : r));
  const p = (async () => {
    const cache = await caches.open(FILE_CACHE);
    const hit = await cache.match(KEY_BASE + key);
    if (hit) return { status: 200, buf: await hit.arrayBuffer() };

    let res;
    try {
      res = await limited(() => hedgedFetch(sha, path, opts));
    } catch (e) {
      return { status: 0, error: String(e) };
    }
    if (res.status === 404 || res.status === 403 && /jsdelivr/.test(res.url || "")) {
      if (missing.size > 2000) missing.clear();
      missing.add(key); // a 404 at a fixed sha never changes
      return { status: 404 };
    }
    if (!res.ok) return { status: res.status || 0 };

    const len = parseInt(res.headers.get("content-length") || "", 10);
    const tooBig = (Number.isFinite(len) && len > MAX_ITEM_BYTES) || (!Number.isFinite(len) && opts && opts.media);
    if (tooBig) return { status: 200, stream: res.body, length: Number.isFinite(len) ? len : 0 };

    const buf = await res.arrayBuffer();
    if (buf.byteLength <= MAX_ITEM_BYTES) {
      try {
        await cache.put(KEY_BASE + key, new Response(buf.slice(0), { headers: { "Content-Type": "application/octet-stream", "X-TT-Size": String(buf.byteLength) } }));
        noteCached(sha, buf.byteLength);
      } catch (e) { /* quota: ignore, still serve */ }
    }
    return { status: 200, buf };
  })();
  inflight.set(key, p);
  p.finally(() => inflight.delete(key));
  return p;
}

function fetchT(u, ms, init) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  const p = fetch(u, Object.assign({ mode: "cors", credentials: "omit", redirect: "follow", signal: ac.signal }, init || {}));
  p.then(() => clearTimeout(timer), () => clearTimeout(timer));
  p.abort = () => ac.abort();
  return p;
}

// raw.githubusercontent first; if it has not answered within HEDGE_MS (or fails with
// 5xx/429/network) race jsDelivr too. A raw 404 at a fixed sha is definitive.
function hedgedFetch(sha, path, opts) {
  const isHtml = /\.html?$/i.test(path);
  const timeout = isHtml ? 40000 : 25000; // time to response headers
  const allowJsd = !(opts && opts.media); // media can be huge (jsDelivr caps at 20 MB)
  return new Promise((resolve, reject) => {
    let done = false, pending = 0, jsdStarted = false, lastRes = null, lastErr = null, rawRetried = false;
    const live = [];
    const finish = (res) => {
      if (done) return; done = true; clearTimeout(hedgeTimer);
      for (const f of live) if (f.p !== res._p) try { f.p.abort(); } catch (e) {}
      resolve(res);
    };
    const settleFail = () => {
      if (done) return;
      if (allowJsd && !jsdStarted) { startJsd(); return; }
      if (pending === 0) { done = true; clearTimeout(hedgeTimer); lastRes ? resolve(lastRes) : reject(lastErr || new Error("fetch failed")); }
    };
    const start = (u, src) => {
      pending++;
      const p = fetchT(u, timeout);
      live.push({ p, src });
      p.then((res) => {
        pending--;
        res._p = p;
        if (res.ok) return finish(res);
        if (res.status === 404 && src === "raw") return finish(res);
        lastRes = res;
        if (src === "raw" && (res.status === 429 || res.status >= 500)) retryRaw(600);
        settleFail();
      }, (err) => {
        pending--;
        lastErr = err;
        if (src === "raw") retryRaw(400);
        settleFail();
      });
    };
    const retryRaw = (ms) => {
      if (rawRetried || done) return;
      rawRetried = true; pending++;
      setTimeout(() => { pending--; if (!done) start(rawUrl(sha, path), "raw"); else settleFail(); }, ms);
    };
    const startJsd = () => { if (jsdStarted || done || !allowJsd) return; jsdStarted = true; start(jsdUrl(sha, path), "jsd"); };
    start(rawUrl(sha, path), "raw");
    const hedgeTimer = allowJsd ? setTimeout(startJsd, HEDGE_MS) : 0;
  });
}

// Simple concurrency limiter for upstream fetches (protects raw's rate limits).
let active = 0;
const queue = [];
function limited(fn) {
  return new Promise((resolve, reject) => {
    const run = () => {
      active++;
      Promise.resolve().then(fn).then(resolve, reject).finally(() => { active--; if (queue.length) queue.shift()(); });
    };
    active < MAX_CONCURRENT ? run() : queue.push(run);
  });
}

/* ------------------------------------------------------------------ LRU index */
// idx = { shas: { <sha>: { bytes, last } } }   (approximate; rebuilt lazily)
let idx = null, idxSaveTimer = 0, currentSha = null;
async function loadIdx() {
  if (idx) return idx;
  try {
    const r = await (await caches.open(META_CACHE)).match(IDX_KEY);
    idx = r ? await r.json() : { shas: {} };
  } catch (e) { idx = { shas: {} }; }
  if (!idx.shas) idx.shas = {};
  return idx;
}
function saveIdxSoon() {
  clearTimeout(idxSaveTimer);
  idxSaveTimer = setTimeout(async () => {
    try { await (await caches.open(META_CACHE)).put(IDX_KEY, new Response(JSON.stringify(idx), { headers: { "Content-Type": "application/json" } })); } catch (e) {}
  }, 800);
}
async function touchSha(sha) {
  currentSha = sha;
  const i = await loadIdx();
  const e = i.shas[sha] || (i.shas[sha] = { bytes: 0, last: 0 });
  if (Date.now() - e.last > 5000) { e.last = Date.now(); saveIdxSoon(); }
}
let evicting = false;
async function noteCached(sha, bytes) {
  const i = await loadIdx();
  const e = i.shas[sha] || (i.shas[sha] = { bytes: 0, last: Date.now() });
  e.bytes += bytes; e.last = Date.now();
  saveIdxSoon();
  let total = 0; for (const k in i.shas) total += i.shas[k].bytes;
  if (total <= MAX_CACHE_BYTES || evicting) return;
  evicting = true;
  try {
    const order = Object.keys(i.shas).filter((k) => k !== sha && k !== currentSha).sort((a, b) => i.shas[a].last - i.shas[b].last);
    const cache = await caches.open(FILE_CACHE);
    const keys = await cache.keys();
    for (const victim of order) {
      if (total <= MAX_CACHE_BYTES * 0.8) break;
      const prefix = KEY_BASE + victim + "/";
      await Promise.all(keys.filter((r) => r.url.startsWith(prefix)).map((r) => cache.delete(r)));
      total -= i.shas[victim].bytes;
      delete i.shas[victim];
    }
    saveIdxSoon();
  } finally { evicting = false; }
}

/* ------------------------------------------------------------------ commit info */
let histPromise = null, histAt = 0;
function historyMap() {
  if (!histPromise || Date.now() - histAt > 10 * 60 * 1000) {
    histAt = Date.now();
    histPromise = fetch("/timetravel/history.json", { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => new Map(((j && j.commits) || []).map((c) => [c.sha, c])))
      .catch(() => new Map());
  }
  return histPromise;
}
const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
async function commitInfo(sha) {
  const m = await historyMap();
  if (m.has(sha)) return m.get(sha);
  // Newer than history.json: ask GitHub once (rate limited: 60/h/IP), remember in Cache Storage.
  const key = self.location.origin + "/__tt_meta__/commit/" + sha;
  try {
    const meta = await caches.open(META_CACHE);
    const hit = await meta.match(key);
    if (hit) return await hit.json();
    const r = await fetchT(`https://api.github.com/repos/${REPO}/commits/${sha}`, 6000, { headers: { Accept: "application/vnd.github+json" } });
    if (!r.ok) return null;
    const j = await r.json();
    const t = j.commit && j.commit.author && j.commit.author.date;
    const info = { sha, t, msg: String((j.commit && j.commit.message) || "").split("\n")[0].trim(), day: t ? dayFmt.format(new Date(t)) : null };
    await meta.put(key, new Response(JSON.stringify(info), { headers: { "Content-Type": "application/json" } }));
    return info;
  } catch (e) { return null; }
}

/* ------------------------------------------------------------------ HTML injection */
function escHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
// JSON safe to drop inside <script>.
function jsonForScript(o) { return JSON.stringify(o).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029"); }

function injectHtml(html, snippet) {
  const head = /<head(?:\s[^>]*)?>/i.exec(html);
  if (head) return html.slice(0, head.index + head[0].length) + snippet + html.slice(head.index + head[0].length);
  const htmlTag = /<html(?:\s[^>]*)?>/i.exec(html);
  if (htmlTag) return html.slice(0, htmlTag.index + htmlTag[0].length) + "<head>" + snippet + "</head>" + html.slice(htmlTag.index + htmlTag[0].length);
  const doctype = /^\s*<!doctype[^>]*>/i.exec(html);
  if (doctype) return doctype[0] + snippet + html.slice(doctype[0].length);
  return snippet + html;
}

async function injectSnippet(sha, path, missing) {
  const info = (await commitInfo(sha)) || { sha, t: null, msg: "", day: null };
  const tt = {
    sha,
    date: info.day || null,
    msg: info.msg || "",
    t: info.t || null,
    path,
    hub: "/tt/" + sha + "/",
    missing: !!missing,
    sw: SW_VERSION,
  };
  return "<script data-tt-shim>" + SHIM_SRC.replace("__TT_DATA__", () => jsonForScript(tt)) + "</script>" +
    '<script src="/timemachine.js" data-tt-sha="' + sha + '" defer></script>';
}

// Runs synchronously as the very first script of every snapshot document.
// Kept ES5-ish so it runs on very old browsers too.
const SHIM_SRC = String.raw`(function(){
"use strict";
var TT=__TT_DATA__;var W=window;
var TZ="America/New_York";
var realSS=null;try{realSS=W.sessionStorage;}catch(e){}
var realLS=null;try{realLS=W.localStorage;}catch(e){}
try{realSS&&realSS.removeItem("tt:coldstart:"+location.href);}catch(e){}
// ---- which day is being visited: per history entry (history.state.ttDay) so reloads and
// Back/Forward keep the right label; tt:day:<sha> in the real sessionStorage is the hand-off
// from the page that sent us here (and the fallback for other pages of the same snapshot).
var DAYRE=/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/,HS=W.history;
function stDay(){try{var s=HS&&HS.state;return s&&typeof s==="object"&&DAYRE.test(s.ttDay||"")?s.ttDay:null;}catch(e){return null;}}
var ssDay=null,goDay=null;try{ssDay=realSS&&realSS.getItem("tt:day:"+TT.sha);
// one-shot "tt:go:<sha>" = "YYYY-MM-DD|ms", written by whoever just sent us here; it outranks
// history.state because a same-URL navigation keeps the old entry's state.
var g=realSS&&realSS.getItem("tt:go:"+TT.sha);if(g){realSS.removeItem("tt:go:"+TT.sha);var gp=g.split("|");if(DAYRE.test(gp[0])&&Date.now()-(+gp[1]||0)<6e5)goDay=gp[0];}}catch(e){}
TT.day=goDay||stDay()||(DAYRE.test(ssDay||"")?ssDay:null)||TT.date;
function withDay(st){if(!TT.day)return st;if(st==null)st={};if(typeof st!=="object"||Array.isArray(st))return st;try{var o={};for(var k in st)if(Object.prototype.hasOwnProperty.call(st,k))o[k]=st[k];o.ttDay=TT.day;return o;}catch(e){return st;}}
try{if(HS&&HS.replaceState){var oRS=HS.replaceState,oPS=HS.pushState;oRS.call(HS,withDay(HS.state),"");
HS.replaceState=function(){if(arguments.length)arguments[0]=withDay(arguments[0]);return oRS.apply(HS,arguments);};
HS.pushState=function(){if(arguments.length)arguments[0]=withDay(arguments[0]);return oPS.apply(HS,arguments);};}}catch(e){}
TT.label=(function(){try{var ds=TT.day||TT.date;if(!ds)return"an unknown day";var p=ds.split("-");var dt=new Date(Date.UTC(+p[0],+p[1]-1,+p[2],12));return dt.toLocaleDateString("en-US",{timeZone:"UTC",weekday:"long",month:"long",day:"numeric",year:"numeric"});}catch(e){return TT.day||TT.date||"";}})();
TT.url=function(sha,path){return "/tt/"+sha+"/"+String(path||"").replace(/^\/+/,"");};
function nav(href,replace){var a=document.createElement("a");a.href=href;a.rel="noreferrer";a.referrerPolicy="no-referrer";if(replace){location.replace(href);return;}(document.body||document.documentElement).appendChild(a);a.click();a.remove();}
TT.go=function(sha,path,opts){opts=opts||{};try{if(opts.day&&realSS){realSS.setItem("tt:day:"+sha,opts.day);realSS.setItem("tt:go:"+sha,opts.day+"|"+Date.now());}else if(realSS){realSS.removeItem("tt:day:"+sha);realSS.removeItem("tt:go:"+sha);}}catch(e){}nav(TT.url(sha,path),opts.replace);};
TT.banner=null;
TT.present=function(path){nav("/"+String(path||"").replace(/^\/+/,""));};
TT.realStorage={local:realLS,session:realSS};
// ---- per-snapshot storage sandbox: old builds must never touch present-day saves.
function makeStore(prefix){
  var mem=Object.create(null);
  try{if(realSS){for(var i=0;i<realSS.length;i++){var k=realSS.key(i);if(k&&k.indexOf(prefix)===0)mem[k.slice(prefix.length)]=realSS.getItem(k);}}}catch(e){}
  function persist(k,v){try{if(!realSS)return;if(v===null)realSS.removeItem(prefix+k);else realSS.setItem(prefix+k,v);}catch(e){}}
  var api={
    getItem:function(k){k=String(k);return Object.prototype.hasOwnProperty.call(mem,k)?mem[k]:null;},
    setItem:function(k,v){k=String(k);v=String(v);mem[k]=v;persist(k,v);},
    removeItem:function(k){k=String(k);delete mem[k];persist(k,null);},
    clear:function(){Object.keys(mem).forEach(function(k){api.removeItem(k);});},
    key:function(i){var ks=Object.keys(mem);return i>=0&&i<ks.length?ks[i]:null;}
  };
  Object.defineProperty(api,"length",{get:function(){return Object.keys(mem).length;},enumerable:false,configurable:true});
  if(typeof Proxy!=="function")return api;
  return new Proxy(api,{
    get:function(t,p){if(typeof p==="symbol")return t[p];if(p in api)return api[p];return Object.prototype.hasOwnProperty.call(mem,p)?mem[p]:undefined;},
    set:function(t,p,v){if(typeof p==="symbol"||p in api)return true;api.setItem(p,v);return true;},
    has:function(t,p){return (typeof p==="string"&&Object.prototype.hasOwnProperty.call(mem,p))||p in api;},
    deleteProperty:function(t,p){api.removeItem(p);return true;},
    ownKeys:function(){return Object.keys(mem);},
    getOwnPropertyDescriptor:function(t,p){if(typeof p==="string"&&Object.prototype.hasOwnProperty.call(mem,p))return{value:mem[p],writable:true,enumerable:true,configurable:true};return undefined;}
  });
}
var LS=makeStore("tt:"+TT.sha+":L:"),SS=makeStore("tt:"+TT.sha+":S:");
try{Object.defineProperty(W,"localStorage",{configurable:true,enumerable:true,get:function(){return LS;}});}catch(e){}
try{Object.defineProperty(W,"sessionStorage",{configurable:true,enumerable:true,get:function(){return SS;}});}catch(e){}
// ---- live backends: snapshots may read, never write (play counts, leaderboards, rooms).
var BK=/(^|\.)(plays\.platyfy\.com|relay\.platyfy\.com|firebaseio\.com|firebasedatabase\.app)$/i;
function host(u){try{return new URL(String(u),location.href).hostname;}catch(e){return"";}}
function isWrite(m){return !/^(GET|HEAD|OPTIONS)$/i.test(m||"GET");}
var ofetch=W.fetch;
if(ofetch){W.fetch=function(input,init){try{var u=typeof input==="string"?input:(input&&input.url)||String(input);var m=(init&&init.method)||(input&&input.method)||"GET";if(BK.test(host(u))&&isWrite(m))return Promise.resolve(new Response('{"ok":true,"timeTravel":true}',{status:200,headers:{"Content-Type":"application/json"}}));}catch(e){}return ofetch.apply(this,arguments);};}
if(W.XMLHttpRequest){var XO=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){if(BK.test(host(u))&&isWrite(m)){arguments[0]="GET";arguments[1]="/__tt_blocked__";}return XO.apply(this,arguments);};}
if(navigator.sendBeacon){var SB=navigator.sendBeacon.bind(navigator);navigator.sendBeacon=function(u){if(BK.test(host(u)))return true;return SB.apply(null,arguments);};}
if(W.WebSocket){var OWS=W.WebSocket;var WS=function(u,p){if(/(^|\.)(relay\.platyfy\.com|firebaseio\.com|firebasedatabase\.app)$/i.test(host(u)))u="wss://time-travel-offline.invalid/";return p===undefined?new OWS(u):new OWS(u,p);};WS.prototype=OWS.prototype;WS.CONNECTING=0;WS.OPEN=1;WS.CLOSING=2;WS.CLOSED=3;W.WebSocket=WS;}
// ---- old pages must not install their own service workers.
try{var swc=navigator.serviceWorker;if(swc){TT._register=swc.register.bind(swc);swc.register=function(){return swc.ready;};}}catch(e){}
W.__TT__=TT;
// (No banner here: /timemachine.js shows a self-hiding "You are viewing platyfy on …" toast
// plus a date chip, so nothing permanently covers the page's own top HUD.)
try{W.dispatchEvent(new CustomEvent("tt:ready",{detail:TT}));}catch(e){}
})();`;

/* ------------------------------------------------------------------ generated pages */
function pageShell(title, inner) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escHtml(title)}</title>
<style>
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px 16px;background:radial-gradient(ellipse at 50% 30%,#1a1240 0%,#0a0a12 60%);color:#fff;font-family:'Courier New',monospace;text-align:center}
.card{max-width:520px;width:100%;background:linear-gradient(145deg,#151520,#1a1a2e);border:2px solid #2a2a3e;border-radius:16px;padding:32px 22px;box-shadow:0 10px 40px rgba(0,0,0,.5)}
.big{font-size:64px;line-height:1;margin-bottom:12px;animation:spin 6s linear infinite;display:inline-block}
@keyframes spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.big{animation:none}}
h1{font-size:clamp(20px,5vw,28px);letter-spacing:3px;margin:0 0 10px;background:linear-gradient(90deg,#ff6644,#ffcc22,#44ccff,#aa66ff);-webkit-background-clip:text;background-clip:text;color:transparent}
p{color:#9a9ab0;font-size:14px;line-height:1.6;margin:0 0 12px}
code{color:#ffcc22;word-break:break-all}
.row{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;margin-top:18px}
a.btn,button.btn{font:inherit;font-weight:bold;letter-spacing:1px;padding:10px 16px;border-radius:10px;border:2px solid #333;background:#1d1d30;color:#fff;text-decoration:none;cursor:pointer}
a.btn:hover,button.btn:hover,a.btn:focus-visible,button.btn:focus-visible{border-color:#ffcc22;outline:none}
.pri{background:linear-gradient(90deg,#aa66ff,#44ccff)!important;border-color:transparent!important;color:#0a0a12!important}
</style></head><body><main class="card">${inner}</main></body></html>`;
}
async function missingPage(sha, path) {
  const info = await commitInfo(sha);
  const when = info && info.day ? longDay(info.day) : "that day";
  const inner = `<div class="big" aria-hidden="true">🕰️</div>
<h1>NOT IN THIS TIMELINE</h1>
<p><code>/${escHtml(decodeSafe(path))}</code> didn't exist on <b style="color:#fff">${escHtml(when)}</b>.</p>
<p>Either it hadn't been made yet, or it had already moved or been removed by then.</p>
<div class="row"><a class="btn pri" href="/tt/${sha}/">Platyfy on that day</a><a class="btn" href="/" rel="noreferrer" referrerpolicy="no-referrer">Return to the present</a></div>`;
  return injectHtml(pageShell("Not in this timeline", inner), await injectSnippet(sha, path, true));
}
async function errorPage(sha, path, why) {
  const inner = `<div class="big" aria-hidden="true">🌀</div>
<h1>TIME STREAM TURBULENCE</h1>
<p>We couldn't fetch <code>/${escHtml(decodeSafe(path))}</code> from the past just now${why ? ` <span style="opacity:.6">(${escHtml(why)})</span>` : ""}.</p>
<p>The archive might be busy. Give it another go.</p>
<div class="row"><button class="btn pri" onclick="location.reload()">Try again</button><a class="btn" href="/" rel="noreferrer" referrerpolicy="no-referrer">Return to the present</a></div>`;
  return injectHtml(pageShell("Time stream turbulence", inner), await injectSnippet(sha, path, true));
}
function decodeSafe(s) { try { return decodeURIComponent(s); } catch (e) { return s; } }
function longDay(day) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric", year: "numeric" });
}
