// Power Apps ホストの条件をローカルで再現する（ローカル検証専用。本番には使わない）
//   ホスト: http://127.0.0.1:<hostPort>/  … プレイヤーと同じ allow 属性の about:blank フレーム内に、別オリジンのアプリを埋め込む
//   アプリ: http://localhost:<appPort>/    … Code Apps の既定 CSP（connect-src は環境に追加した値で置換）を付けて配信する
//
// 使い方:
//   node serve_host_emulation.mjs --dist <build-dir> [--connect-src wss://<region>.stt.speech.microsoft.com ...]
//        [--app-port 4173] [--host-port 4174] [--route "#/"] [--no-allow]
import http from "node:http"
import fs from "node:fs"
import path from "node:path"

function parseArgs(argv) {
  const args = { dist: "dist", connectSrc: [], appPort: 4173, hostPort: 4174, route: "#/", allow: true }
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i]
    const next = () => argv[++i]
    if (key === "--dist") args.dist = next()
    else if (key === "--connect-src") args.connectSrc.push(next())
    else if (key === "--app-port") args.appPort = Number(next())
    else if (key === "--host-port") args.hostPort = Number(next())
    else if (key === "--route") args.route = next()
    else if (key === "--no-allow") args.allow = false
    else throw new Error(`不明な引数: ${key}`)
  }
  return args
}

const args = parseArgs(process.argv.slice(2))
const distDir = path.resolve(args.dist)
if (!fs.existsSync(path.join(distDir, "index.html"))) {
  console.error(`ビルド出力が見つかりません: ${distDir}`)
  process.exit(1)
}

const hostOrigin = `http://127.0.0.1:${args.hostPort}`
const appOrigin = `http://localhost:${args.appPort}`
const allowList = args.allow ? "geolocation; microphone; camera; fullscreen; clipboard-write" : ""

// Code Apps の既定 CSP（references/csp.md）。connect-src は既定 'none' を環境の追加値で置換する
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "media-src 'self' data:",
  `connect-src ${args.connectSrc.length ? args.connectSrc.join(" ") : "'none'"}`,
  "frame-src 'self'",
  `frame-ancestors ${hostOrigin}`,
].join("; ")

const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json", ".png": "image/png" }

http
  .createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url ?? "/").split("?")[0])
    const file = path.join(distDir, urlPath === "/" ? "index.html" : urlPath)
    if (!file.startsWith(distDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end()
      return
    }
    res.writeHead(200, { "Content-Type": types[path.extname(file)] ?? "application/octet-stream", "Content-Security-Policy": CSP })
    fs.createReadStream(file).pipe(res)
  })
  .listen(args.appPort, "localhost", () => console.log(`app  : ${appOrigin}/  CSP: ${CSP}`))

http
  .createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
    res.end(`<!doctype html><html><body style="margin:0">
<iframe id="host" ${allowList ? `allow="${allowList}"` : ""} style="width:100vw;height:100vh;border:0"></iframe>
<script>
  const doc = document.getElementById("host").contentDocument;
  const inner = doc.createElement("iframe");
  inner.src = ${JSON.stringify(`${appOrigin}/${args.route}`)};
  ${allowList ? `inner.allow = ${JSON.stringify(allowList)};` : ""}
  inner.style.cssText = "width:100%;height:100vh;border:0";
  doc.body.style.margin = "0";
  doc.body.appendChild(inner);
</script></body></html>`)
  })
  .listen(args.hostPort, "127.0.0.1", () => console.log(`host : ${hostOrigin}/  (${allowList || "allow なし"})`))
