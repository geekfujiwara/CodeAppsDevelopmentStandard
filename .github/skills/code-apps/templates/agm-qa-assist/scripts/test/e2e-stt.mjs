// 文字起こしの比較（Azure Speech リアルタイム × MAI-Transcribe）を、疑似マイク（WAV）で通しで確かめる E2E。
// 前提: VITE_DEV_LOCAL_CORPUS=1 / VITE_DEV_AUTOSTART=live / VITE_DEV_SPEECH_TOKEN / VITE_DEV_SPEECH_REGION / VITE_DEV_ANSWER_TICKET_URL=./dev-ticket.json
//       でビルドし、serve_host_emulation.mjs で配信していること（connect-src に wss の Speech と Function）。
// 使い方: node scripts/test/e2e-stt.mjs --wav .mcp/tts/rehearsal25.wav [--url http://localhost:4175/] [--seconds 90] [--engine compare|mai]
import { spawn, execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { preflight } from "./_preflight.mjs"

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? process.argv[i + 1] : fallback
}
const url = arg("url", "http://localhost:4173/")
const wav = resolve(arg("wav", ".mcp/tts/rehearsal25.wav"))
const seconds = Number(arg("seconds", "90"))
const engine = arg("engine", "compare")
const outDir = resolve(arg("out", ".screens/e2e-stt"))
mkdirSync(outDir, { recursive: true })
// 疑似マイクの再生と再認識の時間ぶん、チケットが持つこと
await preflight(url, { minSeconds: seconds + 120 })
const port = 9300 + Math.floor(Math.random() * 500)
const edge = `${process.env["ProgramFiles(x86)"]}\\Microsoft\\Edge\\Application\\msedge.exe`
const killByProfile = (pattern) =>
  execFileSync("powershell", ["-NoProfile", "-Command", `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like '*${pattern}*' } | Sort-Object { $_.CommandLine -match '--type=' } | ForEach-Object { try { [Diagnostics.Process]::GetProcessById([int]$_.ProcessId).Kill() } catch {} }`], { stdio: "ignore" })
killByProfile("agm-stt-")
const userData = mkdtempSync(join(tmpdir(), "agm-stt-"))
spawn(edge, ["--headless=new", `--user-data-dir=${userData}`, "--no-first-run", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${wav}%noloop`, "--autoplay-policy=no-user-gesture-required", "--disable-background-timer-throttling", `--remote-debugging-port=${port}`, "--window-size=1920,1080", "about:blank"], { stdio: "ignore", detached: true }).unref()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
const logs = []
const check = (id, ok, detail) => {
  results.push({ id, ok: !!ok, detail })
  console.log(`${ok ? "✔" : "✖"} ${id}: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`)
}

try {
  let wsUrl
  for (let i = 0; i < 50 && !wsUrl; i++) {
    try {
      wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page")?.webSocketDebuggerUrl
    } catch {
      // 起動待ち
    }
    if (!wsUrl) await sleep(200)
  }
  const ws = new WebSocket(wsUrl)
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
    } else if (msg.method === "Runtime.consoleAPICalled") {
      const line = msg.params.args.map((x) => x.value ?? x.description ?? "").join(" ")
      if (line.includes("[AGM")) logs.push(line)
    }
  }
  const send = (method, params = {}) =>
    new Promise((r) => {
      const n = ++id
      pending.set(n, r)
      ws.send(JSON.stringify({ id: n, method, params }))
    })
  const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result?.result?.value
  await send("Runtime.enable")
  await send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false })
  // この端末だけの設定で、文字起こしを比較（または MAI）にしてから開き直す（自動開始は設定の読み込み後に動く）
  await send("Page.navigate", { url })
  await sleep(500)
  await evaluate(`localStorage.setItem("agm-settings-local", JSON.stringify({ stt: { engine: ${JSON.stringify(engine)} } }))`)
  await send("Page.reload", { ignoreCache: true })
  await sleep(seconds * 1000)
  console.log("localStorage:", await evaluate(`localStorage.getItem("agm-settings-local")`), "/ origin:", await evaluate("location.href"))
  await evaluate(`document.querySelector('[data-testid="compare-tab"]')?.click()`)
  await sleep(1500)
  const r = await evaluate(`(() => {
    const rows = [...document.querySelectorAll('[data-testid="stt-compare-row"]')].map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent.trim()))
    return { summary: document.querySelector('[data-testid="stt-compare-summary"]')?.textContent ?? "", rows }
  })()`)
  const done = r.rows.filter((row) => row[2] && !row[2].includes("録音が無い") && !row[2].includes("Error") && row[2] !== "—")
  check("compare-rows", r.rows.length >= 5, `確定文 ${r.rows.length} 行`)
  check("mai-refined", r.rows.length > 0 && done.length >= Math.min(5, r.rows.length - 2), `MAI の結果 ${done.length} 行`)
  check("compare-summary", /食い違い（文字）平均 [\d.]+%/.test(r.summary) && /応答 中央値 \d+ ms/.test(r.summary), r.summary)
  const refineLogs = logs.filter((l) => l.includes("確定文を認識し直しました"))
  check("refine-logs", refineLogs.length >= 5, `再認識のログ ${refineLogs.length} 件`)
  const shot = await send("Page.captureScreenshot", { format: "png" })
  writeFileSync(join(outDir, `stt-${engine}.png`), Buffer.from(shot.result.data, "base64"))
  writeFileSync(join(outDir, `stt-${engine}.json`), JSON.stringify({ summary: r.summary, rows: r.rows }, null, 2))
  writeFileSync(join(outDir, "logs.txt"), logs.join("\n"))
  ws.close()
} finally {
  killByProfile(userData)
  try {
    rmSync(userData, { recursive: true, force: true })
  } catch {
    // 一時フォルダーなので残してよい
  }
}
const failed = results.filter((x) => !x.ok)
console.log(`\n${results.length - failed.length}/${results.length} 合格`)
process.exit(failed.length ? 1 : 0)
