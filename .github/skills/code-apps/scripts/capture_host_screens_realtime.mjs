// ホスト再現（serve_host_emulation.mjs）で配信中のアプリを、ヘッドレス Edge で開いて実時間で待ち、画面を撮る（ローカル検証専用）。
// capture_host_screens.ps1 の仮想時間では、ネットワークのストリーム応答（生成 API の SSE など）が進まないため、その画面はこちらで撮る。
// DevTools プロトコル（WebSocket）で撮影し、終わったら同じユーザー データ フォルダーのプロセスをすべて止める。
// 使い方: node .github/skills/code-apps/scripts/capture_host_screens_realtime.mjs --url "http://localhost:4173/#/<route>" --wait 20,45 --name gen [--size 1920,1080] [--out .screens]
import { spawn, execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? process.argv[i + 1] : fallback
}
const url = arg("url", "http://localhost:4173/")
const waits = arg("wait", "20").split(",").map(Number)
const name = arg("name", "shot")
const [width, height] = arg("size", "1920,1080").split(",").map(Number)
const outDir = resolve(arg("out", ".screens"))
const port = 9300 + Math.floor(Math.random() * 500)

const edge = [`${process.env["ProgramFiles(x86)"]}\\Microsoft\\Edge\\Application\\msedge.exe`, `${process.env.ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe`].find((p) => existsSync(p))
if (!edge) throw new Error("Microsoft Edge が見つかりません")
mkdirSync(outDir, { recursive: true })
// 途中で止めた前回の撮影の Edge が残ると、アプリ（録音・生成・ポーリング）を動かし続けて端末が重くなり、次の撮影や E2E が遅れる。
// 起動前に同じ接頭辞の一時プロファイルの Edge を止め、Ctrl+C でも自分の Edge を止める
const killByProfile = (pattern) =>
  execFileSync("powershell", ["-NoProfile", "-Command", `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like '*${pattern}*' } | Sort-Object { $_.CommandLine -match '--type=' } | ForEach-Object { try { [Diagnostics.Process]::GetProcessById([int]$_.ProcessId).Kill() } catch {} }`], { stdio: "ignore" })
killByProfile("agm-cdp-")
const userData = mkdtempSync(join(tmpdir(), "agm-cdp-"))
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => {
  killByProfile(userData)
  process.exit(130)
})
const child = spawn(edge, ["--headless=new", `--user-data-dir=${userData}`, "--no-first-run", `--remote-debugging-port=${port}`, `--window-size=${width},${height}`, "about:blank"], { stdio: "ignore", detached: true })
child.unref()

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function target() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
      const page = list.find((t) => t.type === "page")
      if (page) return page.webSocketDebuggerUrl
    } catch {
      // 起動待ち
    }
    await sleep(200)
  }
  throw new Error("DevTools に接続できません")
}

function stopAll() {
  // 親（--type の無いブラウザー プロセス）から止め、残りも止める
  const ps = `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like '*${userData.replaceAll("'", "''")}*' } | Sort-Object { $_.CommandLine -match '--type=' } | ForEach-Object { try { [Diagnostics.Process]::GetProcessById([int]$_.ProcessId).Kill() } catch {} }`
  for (let i = 0; i < 3; i++) execFileSync("powershell", ["-NoProfile", "-Command", ps], { stdio: "ignore" })
  try {
    rmSync(userData, { recursive: true, force: true })
  } catch {
    // 終了直後はファイルがロックされていることがある（一時フォルダーなので残してよい）
  }
}

try {
  const ws = new WebSocket(await target())
  await new Promise((r, j) => {
    ws.onopen = r
    ws.onerror = j
  })
  let id = 0
  const pending = new Map()
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data)
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg)
      pending.delete(msg.id)
    }
  }
  const send = (method, params = {}) =>
    new Promise((r) => {
      const n = ++id
      pending.set(n, r)
      ws.send(JSON.stringify({ id: n, method, params }))
    })
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false })
  await send("Page.navigate", { url })
  let elapsed = 0
  for (const w of waits) {
    await sleep((w - elapsed) * 1000)
    elapsed = w
    const shot = await send("Page.captureScreenshot", { format: "png" })
    const file = join(outDir, `${name}-${w}s.png`)
    writeFileSync(file, Buffer.from(shot.result.data, "base64"))
    console.log(`${file}: OK`)
  }
  ws.close()
} finally {
  stopAll()
}
