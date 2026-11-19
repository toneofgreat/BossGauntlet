#!/usr/bin/env node
// Local stand-in for GitHub Pages, for testing the time machine on http://localhost.
//   node timetravel/dev-server.mjs [port]      (default 8787)
// - serves static files from the repo root with proper MIME types
// - "/dir" -> 301 "/dir/" when the directory has an index.html; "/dir/" -> index.html
// - anything missing -> 404.html with status 404 (exactly what Pages does)
// - Cache-Control: max-age=600 like Pages; supports Range for media
import { createServer } from "node:http";
import { stat, readFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { dirname, join, resolve, sep, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.argv[2] || process.env.PORT || 8787);
const MIME = {
  ".html": "text/html; charset=utf-8", ".htm": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8", ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".ico": "image/x-icon",
  ".wav": "audio/wav", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".m4a": "audio/mp4", ".mp4": "video/mp4",
  ".webm": "video/webm", ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8", ".md": "text/markdown; charset=utf-8", ".xml": "application/xml",
};
const BLOCKED = /^(?:\.git|node_modules)(?:\/|$)/; // not in the Pages artifact

async function isFile(p) { try { return (await stat(p)).isFile(); } catch { return false; } }
async function isDir(p) { try { return (await stat(p)).isDirectory(); } catch { return false; } }

const server = createServer(async (req, res) => {
  const log = (s) => process.env.QUIET || console.log(`${s} ${req.method} ${req.url}`);
  try {
    const u = new URL(req.url, "http://x");
    let rel = decodeURIComponent(u.pathname).replace(/^\/+/, "");
    let abs = resolve(ROOT, rel);
    if (abs !== ROOT && !abs.startsWith(ROOT + sep)) throw new Error("traversal");
    if (BLOCKED.test(rel)) abs = join(ROOT, "__nope__");

    if (await isDir(abs)) {
      if (!u.pathname.endsWith("/")) {
        if (await isFile(join(abs, "index.html"))) {
          res.writeHead(301, { Location: u.pathname + "/" + u.search }); res.end(); log(301); return;
        }
      } else abs = join(abs, "index.html");
    }
    let status = 200;
    if (!(await isFile(abs))) { abs = join(ROOT, "404.html"); status = 404; }
    if (!(await isFile(abs))) { res.writeHead(404, { "Content-Type": "text/plain" }); res.end("404"); log(404); return; }

    const type = MIME[extname(abs).toLowerCase()] || "application/octet-stream";
    const size = (await stat(abs)).size;
    const headers = { "Content-Type": type, "Cache-Control": "max-age=600", "Accept-Ranges": "bytes" };
    const range = status === 200 && /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
    if (range) {
      let start = range[1] ? +range[1] : 0, end = range[2] ? +range[2] : size - 1;
      if (!range[1] && range[2]) { start = size - +range[2]; end = size - 1; }
      end = Math.min(end, size - 1);
      res.writeHead(206, { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": end - start + 1 });
      if (req.method === "HEAD") return res.end();
      createReadStream(abs, { start, end }).pipe(res); log(206); return;
    }
    res.writeHead(status, { ...headers, "Content-Length": size });
    if (req.method === "HEAD") { res.end(); log(status); return; }
    res.end(await readFile(abs)); log(status);
  } catch (e) {
    res.writeHead(400, { "Content-Type": "text/plain" }); res.end("bad request"); log(400);
  }
});
server.listen(PORT, () => console.log(`platyfy dev server: http://localhost:${PORT}/  (root ${ROOT})`));
