// serve.cjs - tiny static server rooted at the BossGauntlet folder (CONTRACT 14).
//   node totally-normal-rpg/tools/serve.cjs [port]      -> http://127.0.0.1:<port>/totally-normal-rpg/
//   const { start } = require("./serve.cjs"); const s = await start(); ... s.close();
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");
const MIME = {
  ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".cjs": "text/javascript; charset=utf-8",
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm", ".webp": "image/webp", ".md": "text/plain; charset=utf-8"
};

function start(port) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        let p = decodeURIComponent((req.url || "/").split("?")[0]);
        let file = path.normalize(path.join(ROOT, p));
        if (!file.startsWith(ROOT)) { res.writeHead(403); res.end("forbidden"); return; }
        fs.stat(file, (err, st) => {
          if (!err && st.isDirectory()) {
            if (!p.endsWith("/")) { res.writeHead(301, { Location: p + "/" }); res.end(); return; }
            file = path.join(file, "index.html");
          }
          fs.readFile(file, (err2, data) => {
            if (err2) { res.writeHead(404, { "Content-Type": "text/plain" }); res.end("not found"); return; }
            res.writeHead(200, { "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
            res.end(data);
          });
        });
      } catch (e) { res.writeHead(500); res.end(String(e)); }
    });
    server.on("error", reject);
    server.listen(port || 0, "127.0.0.1", () => {
      const url = "http://127.0.0.1:" + server.address().port;
      resolve({ url, server, close: () => new Promise((r) => server.close(() => r())) });
    });
  });
}

module.exports = { start, ROOT };

if (require.main === module) {
  start(+process.argv[2] || 8080).then((s) => console.log("serving " + ROOT + " at " + s.url + "/totally-normal-rpg/"));
}
