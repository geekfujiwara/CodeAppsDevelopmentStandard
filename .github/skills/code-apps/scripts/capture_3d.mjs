// ヘッドレス Edge で 3D 画面を開き、指定した JS の結果とスクリーンショットを取る（ローカル検証専用・追加インストール不要）
//
//   node scripts/capture_3d.mjs --url "http://127.0.0.1:5181/#/projects/seed-sample-house?tab=viewer" \
//     --wait 15000 --eval "window.__viewer?.materialSource" --out .tools/shots/viewer.png [--setup "<JS>"] [--viewport 1400x900]
//   --pause-raf: requestAnimationFrame を止めた状態で動かす（画面に見えていないタブ・自動操作のブラウザの再現）。
//     処理の待ちを requestAnimationFrame だけで作っていると、ここで止まる（スクリーンショットの 3D は描かれない）
//   長いスクリプト（バイナリを base64 で渡すなど）は --eval-file <path>（コマンドラインの長さ制限を避ける）
//   描画完了まで待つ: --ready "<真になる JS の式>" [--ready-timeout 180]。条件が満たされないか、--fail-on-error でページのエラーがあれば終了コード 1
//
// - Edge を --remote-debugging-port で起動し、Node 組み込みの WebSocket で CDP を直接話す（Playwright 不要）
// - WebGL は既定でソフトウェア描画（SwiftShader）になる。--gpu を付けると GPU を使う
// - 終了時は同じユーザー データ フォルダーの Edge プロセスをすべて止める
import { spawn, execSync } from "node:child_process"
import { mkdtempSync, writeFileSync, rmSync, existsSync, mkdirSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, dirname } from "node:path"

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, v, i, a) => (v.startsWith("--") ? [...acc, [v.slice(2), a[i + 1]?.startsWith("--") || a[i + 1] === undefined ? true : a[i + 1]]] : acc), []),
)
const url = args.url ?? "http://127.0.0.1:5173/"
const waitMs = Number(args.wait ?? 15000)
const [vw, vh] = String(args.viewport ?? "1400x900").split("x").map(Number)
const out = args.out ?? ".tools/shots/capture.png"

const edge = [`${process.env["ProgramFiles(x86)"]}\\Microsoft\\Edge\\Application\\msedge.exe`, `${process.env.ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe`].find(p => existsSync(p))
if (!edge) throw new Error("Microsoft Edge が見つかりません")
const userData = mkdtempSync(join(tmpdir(), "capture3d-"))
const port = 9300 + Math.floor(Math.random() * 500)
const launch = (gpu) => spawn(edge, [
  "--headless=new", `--user-data-dir=${userData}`, "--no-first-run", `--remote-debugging-port=${port}`,
  `--window-size=${vw},${vh}`, ...(gpu === "gpu" ? ["--enable-gpu", "--ignore-gpu-blocklist"] : gpu === "swiftshader" ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] : []), "about:blank",
], { stdio: "ignore", detached: false })
let proc = launch(args.gpu ? "gpu" : "swiftshader")

const sleep = ms => new Promise(r => setTimeout(r, ms))
let ws
let id = 0
const pending = new Map()
const events = []
function send(method, params = {}, sessionId) {
  const msg = { id: ++id, method, params, ...(sessionId ? { sessionId } : {}) }
  ws.send(JSON.stringify(msg))
  return new Promise((resolve, reject) => pending.set(msg.id, { resolve, reject }))
}
async function connectCdp() {
  for (let i = 0; i < 50; i++) {
    try {
      return await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()
    } catch {
      await sleep(200)
    }
  }
  return undefined
}

try {
  let targets = await connectCdp()
  // 端末によっては SwiftShader の起動オプションで Edge が DevTools の準備前に終了する。既定の描画経路で 1 回だけ起動し直す
  if (!targets && !args.gpu) {
    console.error("SwiftShader の起動オプションで Edge に接続できないため、既定の描画経路で起動し直します")
    proc.kill()
    await sleep(1500)
    proc = launch("default")
    targets = await connectCdp()
  }
  if (!targets) throw new Error("Edge の CDP に接続できませんでした")
  ws = new WebSocket(targets.webSocketDebuggerUrl)
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data)
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id)
      pending.delete(m.id)
      m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result)
    } else if (m.method === "Runtime.consoleAPICalled" || m.method === "Runtime.exceptionThrown" || m.method === "Log.entryAdded") {
      events.push(m)
    }
  }
  const { targetId } = await send("Target.createTarget", { url: "about:blank" })
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true })
  await send("Runtime.enable", {}, sessionId)
  await send("Log.enable", {}, sessionId)
  await send("Page.enable", {}, sessionId)
  await send("Emulation.setDeviceMetricsOverride", { width: vw, height: vh, deviceScaleFactor: 1, mobile: false }, sessionId)
  if (args["pause-raf"]) await send("Page.addScriptToEvaluateOnNewDocument", { source: "window.requestAnimationFrame = () => 0" }, sessionId)
  if (args.setup) await send("Page.addScriptToEvaluateOnNewDocument", { source: String(args.setup) }, sessionId)
  await send("Page.navigate", { url }, sessionId)
  // 固定時間だけ待つと、GLB の解析や影の計算が終わる前の空の画面を撮る（低メモリの端末では 25 秒以上かかった）。
  // --ready の式が真になるまで待ってから、--wait（ready 指定時の既定は 1 秒）だけ落ち着かせて撮る
  let ready = null
  if (args.ready) {
    const started = Date.now()
    const timeout = Number(args["ready-timeout"] ?? 180) * 1000
    ready = false
    while (Date.now() - started < timeout) {
      const r = await send("Runtime.evaluate", { expression: `Boolean(${args.ready})`, returnByValue: true }, sessionId)
      if (r.result?.value === true) { ready = true; break }
      await sleep(500)
    }
    ready = ready ? `${((Date.now() - started) / 1000).toFixed(1)}s` : false
    await sleep(Number(args.wait ?? 1000))
  } else {
    await sleep(waitMs)
  }
  let value = null
  const expression = args["eval-file"] ? readFileSync(String(args["eval-file"]), "utf8") : args.eval
  if (expression) {
    const r = await send("Runtime.evaluate", { expression: String(expression), awaitPromise: true, returnByValue: true }, sessionId)
    value = r.exceptionDetails ? { error: r.exceptionDetails.text } : r.result.value
  }
  if (args.after) {
    await send("Runtime.evaluate", { expression: String(args.after), awaitPromise: true }, sessionId)
    await sleep(Number(args.afterWait ?? 3000))
  }
  const shot = await send("Page.captureScreenshot", { format: "png", ...(args.clip ? { clip: { ...JSON.parse(args.clip), scale: 1 } } : {}) }, sessionId)
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, Buffer.from(shot.data, "base64"))
  const logs = events
    .map(e => (e.method === "Runtime.exceptionThrown" ? `exception: ${e.params.exceptionDetails.exception?.description ?? e.params.exceptionDetails.text}` : e.method === "Log.entryAdded" ? `${e.params.entry.level}: ${e.params.entry.text}` : `${e.params.type}: ${e.params.args.map(a => a.value ?? a.description ?? "").join(" ")}`))
    .filter(l => /error|exception|warn|Refused|CSP/i.test(l))
  console.log(JSON.stringify({ value, ready, screenshot: out, problems: logs.slice(0, 20) }, null, 1))
  if (ready === false) {
    console.error(`--ready の条件が真になりませんでした: ${args.ready}`)
    process.exitCode = 1
  }
  if (args["fail-on-error"] && logs.length) process.exitCode = 1
} finally {
  try { ws?.close() } catch { /* noop */ }
  proc.kill()
  try {
    execSync(`powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name='msedge.exe'\\" | Where-Object { $_.CommandLine -like '*${userData.replace(/\\/g, "\\\\")}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`, { stdio: "ignore" })
  } catch { /* noop */ }
  await sleep(500)
  try { rmSync(userData, { recursive: true, force: true }) } catch { /* Edge がまだ掴んでいる場合は残す */ }
}
