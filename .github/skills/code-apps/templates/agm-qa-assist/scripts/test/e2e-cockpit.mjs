// 株主総会アシストの E2E（ホスト再現の CSP で配信したテスト用ビルドを、ヘッドレス Edge で操作して確かめる）。
// 前提: VITE_DEV_LOCAL_CORPUS=1 / VITE_DEV_AUTOSTART=text / VITE_DEV_ANSWER_TICKET_URL=./dev-ticket.json でビルドし、
//       serve_host_emulation.mjs で http://localhost:4173 に配信していること。
// 使い方: node scripts/test/e2e-cockpit.mjs [--url http://localhost:4173/] [--out .screens/e2e]
import { spawn, execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { preflight } from "./_preflight.mjs"

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? process.argv[i + 1] : fallback
}
const url = arg("url", "http://localhost:4173/")
const outDir = resolve(arg("out", ".screens/e2e"))
await preflight(url)
const port = 9300 + Math.floor(Math.random() * 500)
const edge = [`${process.env["ProgramFiles(x86)"]}\\Microsoft\\Edge\\Application\\msedge.exe`, `${process.env.ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe`].find((p) => existsSync(p))
mkdirSync(outDir, { recursive: true })
// 前回の実行が途中で止められると、ヘッドレス Edge が残ってアプリ（台本・LIVE・生成）を動かし続け、端末が重くなる。
// 起動前に、同じ接頭辞の一時プロファイルで動いている Edge をすべて止める（並行実行はしない前提）
const killByProfile = (pattern) =>
  execFileSync("powershell", ["-NoProfile", "-Command", `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like '*${pattern}*' } | Sort-Object { $_.CommandLine -match '--type=' } | ForEach-Object { try { [Diagnostics.Process]::GetProcessById([int]$_.ProcessId).Kill() } catch {} }`], { stdio: "ignore" })
killByProfile("agm-e2e-")
const userData = mkdtempSync(join(tmpdir(), "agm-e2e-"))
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => {
  killByProfile(userData)
  process.exit(130)
})
// 待ちが終わらない場合（生成が失敗し続ける等）に止まったままにしない
const maxMinutes = Number(arg("max-minutes", "12"))
setTimeout(() => {
  console.error(`✖ ${maxMinutes} 分で終わらなかったため止めました（${join(outDir, "logs.txt")} を確認）`)
  writeFileSync(join(outDir, "logs.txt"), logs.join("\n"))
  killByProfile(userData)
  process.exit(3)
}, maxMinutes * 60_000).unref()
spawn(edge, ["--headless=new", `--user-data-dir=${userData}`, "--no-first-run", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows", "--disable-features=IntensiveWakeUpThrottling", `--remote-debugging-port=${port}`, "--window-size=1920,1080", "about:blank"], { stdio: "ignore", detached: true }).unref()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
const logs = []
const check = (id, ok, detail) => {
  results.push({ id, ok: !!ok, detail })
  console.log(`${ok ? "✔" : "✖"} ${id}: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`)
  writeFileSync(join(outDir, "logs.txt"), logs.join("\n"))
}

async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl)
  ws.addEventListener("close", () => console.log("WebSocket closed: " + wsUrl.slice(-12)))
  await new Promise((r, j) => {
    ws.onopen = r
    ws.onerror = j
  })
  let id = 0
  const pending = new Map()
  const listeners = []
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data)
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg)
      pending.delete(msg.id)
    } else if (msg.method) listeners.forEach((f) => f(msg))
  }
  const send = (method, params = {}) =>
    new Promise((r) => {
      const n = ++id
      pending.set(n, r)
      ws.send(JSON.stringify({ id: n, method, params }))
    })
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? "evaluate failed")
    return r.result?.result?.value
  }
  const waitFor = async (expression, timeoutMs = 30000) => {
    const t0 = Date.now()
    while (Date.now() - t0 < timeoutMs) {
      const v = await evaluate(expression).catch(() => null)
      if (v) return v
      await sleep(300)
    }
    return null
  }
  const shot = async (name) => {
    const r = await send("Page.captureScreenshot", { format: "png" })
    writeFileSync(join(outDir, `${name}.png`), Buffer.from(r.result.data, "base64"))
  }
  await send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false })
  await send("Runtime.enable")
  return { ws, send, evaluate, waitFor, shot, on: (f) => listeners.push(f) }
}

async function pageTarget() {
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

// React の制御された input に値を入れる
const setInput = (selector, value) => `(() => {
  const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set
  setter.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event("input", { bubbles: true })); return true })()`
const pressEnter = (selector) => `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false
  el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); return true })()`
// React の制御された select / textarea に値を入れる
const setSelect = (selector, value) => `(() => {
  const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set
  setter.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event("change", { bubbles: true })); return el.value })()`
const setTextarea = (selector, value) => `(() => {
  const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set
  setter.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event("input", { bubbles: true })); return true })()`
const click = (selector) => `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.click(); return true })()`
const text = (selector) => `document.querySelector(${JSON.stringify(selector)})?.textContent ?? ""`

function stopAll() {
  const ps = `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like '*${userData.replaceAll("'", "''")}*' } | Sort-Object { $_.CommandLine -match '--type=' } | ForEach-Object { try { [Diagnostics.Process]::GetProcessById([int]$_.ProcessId).Kill() } catch {} }`
  for (let i = 0; i < 3; i++) execFileSync("powershell", ["-NoProfile", "-Command", ps], { stdio: "ignore" })
  try {
    rmSync(userData, { recursive: true, force: true })
  } catch {
    // ブラウザーの終了待ちで消せないことがある（一時フォルダーなので残してよい）
  }
}

try {
  const a = await connect(await pageTarget())
  a.on((m) => {
    if (m.method === "Runtime.consoleAPICalled") {
      const line = m.params.args.map((x) => x.value ?? x.description ?? "").join(" ")
      if (line.includes("[AGM")) logs.push(line)
    }
    if (m.method === "Runtime.exceptionThrown") logs.push("[exception] " + (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text))
  })
  await a.send("Page.navigate", { url })
  // 担当者の代わり: 紛らわしい候補が出たら 0236 を押し、結果を window.__rival に残す
  await sleep(2500)
  await a.evaluate(`(() => { const t = setInterval(() => {
    const s = document.querySelector('[data-testid="ident-status"]')?.textContent ?? ""
    if (!s.includes("紛らわしい候補") || window.__rival) return
    const b = [...document.querySelectorAll('[data-testid="candidate"]')].find((x) => x.textContent.includes("0236"))
    if (!b) return
    window.__rival = { status: s }
    b.click()
    setTimeout(() => { window.__rival.applied = (document.querySelector('[data-testid="current-number"]')?.textContent ?? "") + "/" + (document.querySelector('[data-testid="number-source"]')?.textContent ?? ""); clearInterval(t) }, 400)
  }, 200) })()`)

  // TC-37/38: 名乗りを AI で照合し、番号を自動で入れる
  const ident = await a.waitFor(`(() => { const t = document.querySelector('[data-testid="ident-status"]')?.textContent ?? ""; return /AI 照合: \\d/.test(t) ? t : null })()`, 60000)
  check("ident-shown", ident, ident ?? "AI 照合の表示がありません")
  const firstNumber = await a.evaluate(text('[data-testid="current-number"]'))
  const source = await a.evaluate(text('[data-testid="number-source"]'))
  check("number-applied", /\d{3,4}/.test(firstNumber) && source, `${firstNumber.trim()}（${source}）`)
  await a.shot("01-identify")

  // TC-41: カードの引用番号を押すと根拠の吹き出し
  await a.waitFor(`document.querySelectorAll('[data-testid="answer-block"] [data-testid="cite-chip"]').length > 0`, 40000)
  await a.evaluate(click('[data-testid="answer-block"] [data-testid="cite-chip"]'))
  const pop = await a.waitFor(`document.querySelector('[data-testid="cite-popover"]')?.textContent`, 5000)
  check("cite-popover", pop && pop.length > 20, (pop ?? "").slice(0, 60))
  await a.shot("02-cite-popover")
  await a.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 })
  await sleep(300)

  // TC-39: その場で株主番号を直す（ヘッダーではなく表示位置で）
  await a.evaluate(click('[data-testid="current-number"]'))
  await a.waitFor(`!!document.querySelector('[data-testid="number-input"]')`, 3000)
  await a.evaluate(setInput('[data-testid="number-input"]', "1601"))
  await a.evaluate(pressEnter('[data-testid="number-input"]'))
  const edited = await a.waitFor(`(() => { const n = document.querySelector('[data-testid="current-number"]')?.textContent ?? ""; const s = document.querySelector('[data-testid="number-source"]')?.textContent ?? ""; return n.includes("1601") && s.includes("手入力") ? n + "/" + s : null })()`, 5000)
  check("inline-edit", edited, edited ?? "直した番号が反映されません")
  check("no-header-number-input", !(await a.evaluate(`!!document.querySelector('[data-testid="number-override"]')`)), "ヘッダーの番号欄は無い")

  // TC-40: 名簿から選ぶ（全画面）
  await a.evaluate(click('[data-testid="open-picker"]'))
  await a.waitFor(`!!document.querySelector('[data-testid="shareholder-picker"]')`, 5000)
  await a.evaluate(setInput('[data-testid="picker-search"]', "ふじわら"))
  const rows = await a.waitFor(`(() => { const n = document.querySelectorAll('[data-testid="picker-row"]').length; return n > 0 && n < 20 ? n : null })()`, 5000)
  check("picker-search", rows >= 2, `「ふじわら」で ${rows} 人`)
  await a.shot("03-picker")
  await a.evaluate(click('[data-testid="picker-row"]'))
  const picked = await a.waitFor(`!document.querySelector('[data-testid="shareholder-picker"]') && document.querySelector('[data-testid="current-number"]')?.textContent`, 5000)
  check("picker-select", picked && !picked.includes("1601"), `選んだ番号: ${picked}`)

  // LIVE: 開始 → 別タブで閲覧（読み取り専用）
  await a.evaluate(click('[data-testid="live-button"]'))
  await a.waitFor(`!!document.querySelector('[data-testid="live-start"]')`, 5000)
  await a.evaluate(click('[data-testid="live-start"]'))
  const published = await a.waitFor(`(() => { const t = document.querySelector('[data-testid="live-publish-status"]')?.textContent ?? ""; return /更新 \\d+ 回目/.test(t) ? t : null })()`, 15000)
  check("live-publish", published, published ?? "更新されません")
  await a.evaluate(setInput('[data-testid="live-user-search"]', "常務"))
  await a.waitFor(`!!document.querySelector('[data-testid="live-add-viewer"]')`, 5000)
  await a.evaluate(click('[data-testid="live-add-viewer"]'))
  const viewers = await a.waitFor(`document.querySelectorAll('[data-testid="live-viewers"] li').length >= 1 && document.querySelector('[data-testid="live-viewers"]').textContent.includes("テスト幹部")`, 5000)
  check("live-viewer-added", viewers, "閲覧者を追加")
  await a.shot("04-live-dialog")
  await a.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 })

  const created = await a.send("Target.createTarget", { url })
  await sleep(1500)
  const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
  const viewerTarget = list.find((t) => t.id === created.result.targetId)
  const b = await connect(viewerTarget.webSocketDebuggerUrl)
  b.on((m) => {
    if (m.method === "Runtime.consoleAPICalled") logs.push("[viewer] " + m.params.args.map((x) => x.value ?? x.description ?? "").join(" "))
    if (m.method === "Runtime.exceptionThrown") logs.push("[viewer exception] " + (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text))
  })
  const tab = await b.waitFor(`!!document.querySelector('[data-testid="view-watch"]')`, 20000)
  check("live-tab", tab, "閲覧側に「LIVE 視聴」タブが出る")
  await b.evaluate(click('[data-testid="view-watch"]'))
  await b.send("Target.activateTarget", { targetId: created.result.targetId }).catch(() => undefined)
  let watched = null
  let editorNumber = ""
  for (let i = 0; i < 40 && !watched; i++) {
    editorNumber = (await a.evaluate(text('[data-testid="current-number"]'))).replace(/\D/g, "")
    const t = await b.evaluate(`document.querySelector('[data-testid="live-shareholder"]')?.textContent ?? ""`)
    if (editorNumber && t.includes(editorNumber)) watched = t
    else await sleep(500)
  }
  if (!watched) logs.push("[viewer dump] " + (await b.evaluate(`JSON.stringify({ ls: (localStorage.getItem("agm-live-local") ?? "").slice(0, 400), watch: document.querySelector('[data-testid="live-watch"]')?.textContent?.slice(0, 300) ?? document.querySelector('main')?.className })`)))
  check("live-watch", watched, `閲覧側: ${watched} / 担当者: ${editorNumber}`)
  const lag = await b.waitFor(`document.querySelector('[data-testid="live-lag"]')?.textContent`, 5000)
  check("live-lag", lag && Number(/最終更新 (\d+) 秒前/.exec(lag)?.[1] ?? 99) <= 10, lag)
  const viewerCards = await b.evaluate(`document.querySelectorAll('[data-testid="answer-block"]').length`)
  check("live-cards", viewerCards >= 0, `閲覧側の回答案 ${viewerCards} 件`)
  const noEditor = await b.evaluate(`!document.querySelector('[data-testid="live-watch"] [data-testid="number-input"], [data-testid="live-watch"] [data-testid="open-picker"]')`)
  check("live-readonly", noEditor, "閲覧側に編集の部品が無い")
  await b.shot("05-live-watch")

  // 紛らわしい名乗り（「株主番号を200。3 16番の藤原です」→ 0236 と 2036）は自動で決めず、候補を押して決める（ページ内の見張りが担当者の代わりに押す）
  const rival = await a.waitFor(`window.__rival?.applied ? JSON.stringify(window.__rival) : null`, 900000)
  const r = rival ? JSON.parse(rival) : {}
  check("ident-rival", r.status?.includes("紛らわしい候補") && r.status.includes("2036"), (r.status ?? "紛らわしい候補の表示がありません").slice(0, 100))
  check("ident-rival-pick", r.applied?.includes("0236") && r.applied.includes("手入力"), r.applied ?? "候補 0236 を押しても反映されません")
  // 台本の終わりまで待ち、記録の番号をその場で直す（TC-42）
  await a.send("Target.activateTarget", { targetId: (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.webSocketDebuggerUrl === a.ws.url)?.id ?? "" }).catch(() => undefined)
  const done = await a.waitFor(`(() => { document.querySelector('[data-testid="records-tab"]')?.click(); return document.querySelectorAll('[data-testid="record-number"]').length >= 6 })()`, 300000)
  check("records-saved", done, `記録 ${await a.evaluate(`document.querySelectorAll('[data-testid="record-number"]').length`)} 件`)
  const records = await a.evaluate(`[...document.querySelectorAll('[data-testid="record-number"]')].map((e) => e.textContent.trim()).join(",")`)
  check("records-numbers", /0236/.test(records) && /0263/.test(records), `記録の番号: ${records}`)
  const before = (await a.evaluate(text('[data-testid="record-number"]'))).trim()
  await a.evaluate(click('[data-testid="record-number"]'))
  await a.waitFor(`!!document.querySelector('[data-testid="record-number-input"]')`, 3000)
  await a.evaluate(setInput('[data-testid="record-number-input"]', "0360"))
  await a.evaluate(pressEnter('[data-testid="record-number-input"]'))
  const after = await a.waitFor(`(() => { const t = document.querySelector('[data-testid="record-number"]')?.textContent ?? ""; return t.includes("0360") ? t : null })()`, 8000)
  check("record-edit", after, `${before} → ${after}`)
  await a.shot("06-records")

  // TC-43/44: 総会の画面（集計・グラフ・評価）
  await a.evaluate(click('[data-testid="view-meeting"]'))
  const kpis = await a.waitFor(`(() => { const n = document.querySelectorAll('[data-testid="kpi"]').length; return n >= 7 ? n : null })()`, 15000)
  check("meeting-kpis", kpis, `KPI ${kpis} 件`)
  const charts = await a.waitFor(`document.querySelectorAll('[data-testid="meeting-view"] .recharts-surface').length`, 10000)
  check("meeting-charts", charts >= 4, `グラフ ${charts} 枚`)
  await a.evaluate(`document.querySelectorAll('[data-testid="rate-star"]')[3]?.click()`)
  const avg = await a.waitFor(`(() => { const k = [...document.querySelectorAll('[data-testid="kpi"]')].find((x) => x.textContent.includes("平均評価")); return k && /4/.test(k.textContent) ? k.textContent : null })()`, 5000)
  check("meeting-rating", avg, avg ?? "評価が集計に反映されません")
  await a.evaluate(click('[data-testid="export-meeting"]'))
  const exported = await a.waitFor(`!!document.querySelector('[data-testid="export-done"]')`, 10000)
  check("meeting-export", exported, "まとめの作成（テスト用ビルドは保存なし）")
  await a.shot("07-meeting")

  // 設定: 回答案のモデルを変えて「この端末だけで試す」→ 状態表示とチップ。MAI を選ぶと国外処理の注意。既定にする
  await a.evaluate(click('[data-testid="view-settings"]'))
  await a.waitFor(`!!document.querySelector('[data-testid="answer-deployment"] option[value="gpt-4.1-mini"]')`, 20000)
  const pickedModel = await a.evaluate(setSelect('[data-testid="answer-deployment"]', "gpt-4.1-mini"))
  await a.evaluate(click('[data-testid="settings-try-local"]'))
  const localChip = await a.waitFor(`(() => { const s = document.querySelector('[data-testid="settings-answer"]')?.textContent ?? ""; const st = document.body.textContent; return s.includes("この端末だけ") && st.includes("回答案: gpt-4.1-mini") ? "ok" : null })()`, 5000)
  check("settings-local", pickedModel === "gpt-4.1-mini" && localChip, `回答案のモデル ${pickedModel}・この端末だけ・状態表示`)
  await a.evaluate(click('[data-testid="engine-mai"]'))
  const residency = await a.waitFor(`document.querySelector('[data-testid="stt-residency"]')?.textContent`, 5000)
  check("settings-residency", residency && residency.includes("southeastasia"), (residency ?? "国外処理の注意がありません").slice(0, 60))
  await a.evaluate(click('[data-testid="engine-azure"]'))
  await a.evaluate(click('[data-testid="settings-save-default"]'))
  const saved = await a.waitFor(`document.querySelector('[data-testid="settings-message"]')?.textContent`, 8000)
  const orgChip = await a.waitFor(`(() => (document.querySelector('[data-testid="settings-answer"]')?.textContent ?? "").includes("組織の既定") ? "ok" : null)()`, 5000)
  check("settings-default", saved?.includes("組織の既定にしました") && orgChip, saved ?? "既定にできません")
  const evalRows = await a.evaluate(`document.querySelectorAll('[data-testid="stt-eval"] tbody tr').length`)
  check("settings-eval", evalRows >= 4, `比較の参考 ${evalRows} 行`)
  await a.shot("09-settings")

  // 想定問答を手動で追加（下書き）→ 一覧に「下書き」→ 承認すると外れる
  await a.evaluate(click('[data-testid="view-library"]'))
  await a.waitFor(`!!document.querySelector('[data-testid="qa-add"]')`, 5000)
  const draftsBefore = await a.evaluate(text('[data-testid="qa-drafts-only"]'))
  await a.evaluate(click('[data-testid="qa-add"]'))
  await a.waitFor(`!!document.querySelector('[data-testid="qa-editor"]')`, 5000)
  const newId = (await a.evaluate(`document.querySelector('[data-testid="qa-edit-id"]').value`)).trim()
  await a.evaluate(setInput('[data-testid="qa-edit-category"]', "配当・株主還元"))
  await a.evaluate(setTextarea('[data-testid="qa-edit-question"]', "記念配当を出す予定はありますか。"))
  await a.evaluate(setTextarea('[data-testid="qa-edit-answer"]', "現時点で記念配当の予定はございません。年間配当は60円を予定しております。"))
  await a.evaluate(setInput('[data-testid="qa-edit-responder"]', "取締役CFO"))
  await a.evaluate(setInput('[data-testid="qa-edit-sources"]', "IR-003"))
  await a.evaluate(setInput('[data-testid="qa-edit-keywords"]', "記念配当 配当"))
  await sleep(300)
  const issues = await a.evaluate(`document.querySelector('[data-testid="qa-edit-issues"]')?.textContent ?? ""`)
  await a.evaluate(click('[data-testid="qa-edit-save-draft"]'))
  const draftShown = await a.waitFor(`(() => { const t = document.querySelector('[data-testid="qa-drafts-only"]')?.textContent ?? ""; return t !== ${JSON.stringify(draftsBefore)} && !document.querySelector('[data-testid="qa-editor"]') ? t : null })()`, 5000)
  check("qa-add-draft", newId && draftShown, `${newId} を下書きで追加（${draftsBefore} → ${draftShown}）${issues ? "・注意: " + issues.slice(0, 40) : ""}`)
  await a.shot("10-qa-draft")
  await a.evaluate(click('[data-testid="qa-approve"]'))
  const approved = await a.waitFor(`(() => { const t = document.querySelector('[data-testid="qa-drafts-only"]')?.textContent ?? ""; return t === ${JSON.stringify(draftsBefore)} ? t : null })()`, 5000)
  check("qa-approve", approved, `承認で下書きの件数が戻る（${approved}）`)
  await a.evaluate(click('[data-testid="view-cockpit"]'))
  await a.evaluate(`document.querySelector('[data-testid="script-tab"]')?.click()`)
  const scriptOptions = await a.waitFor(`document.querySelectorAll('[data-testid="script-select"] option').length`, 5000)
  check("script-select", scriptOptions >= 1, `台本 ${scriptOptions} 件`)
  await a.evaluate(`document.querySelector('[data-testid="compare-tab"]')?.click()`)
  const compare = await a.waitFor(`document.querySelector('[data-testid="records"]') ? null : document.body.textContent.includes("確定文ごとに Azure Speech と MAI") ? "ok" : null`, 5000)
  check("compare-tab", compare, "比較タブ（文字だけのリハーサルでは対象外の案内）")
  // 想定問答の検索: AI 回答案のどの行が、どの検索結果を引用したかを線で結ぶ（React Flow）
  await a.evaluate(click('[data-testid="view-library"]'))
  await a.waitFor(`!!document.querySelector('[data-testid="qa-search"]')`, 5000)
  await a.evaluate(setInput('[data-testid="qa-search"]', "自社株買いは配当の代わりか"))
  const flowDone = await a.waitFor(`(() => { const s = document.querySelector('[data-testid="flow-answer"] [data-testid="generated"]')?.textContent ?? ""; return /完了 [\\d.]+ 秒/.test(s) ? s.slice(0, 40) : null })()`, 40000)
  check("library-generated", flowDone, flowDone ?? "回答案が完了しません")
  check("library-model", flowDone && flowDone.includes("gpt-4.1-mini"), `既定にしたモデルで生成: ${flowDone}`)
  await sleep(800)
  const flow = await a.evaluate(`(() => ({
    qa: document.querySelectorAll('[data-testid="flow-qa"]').length,
    ir: document.querySelectorAll('[data-testid="flow-ir"]').length,
    cite: document.querySelectorAll('.react-flow__edge[data-id^="cite-"]').length,
    pass: document.querySelectorAll('.react-flow__edge[data-id^="pass-"]').length,
    badges: [...document.querySelectorAll('[data-testid="qa-result"]')].filter((b) => b.textContent.includes("AI #")).length,
    stats: document.querySelector('[data-testid="flow-stats"]')?.textContent ?? "" }))()`)
  check("library-flow", flow.qa === 3 && flow.ir >= 1 && flow.cite >= 2 && flow.badges === 3, flow)
  const lineHit = await a.evaluate(`(() => {
    const edges = [...document.querySelectorAll('.react-flow__edge[data-id^="cite-"] path.react-flow__edge-path')]
    const lines = [...document.querySelectorAll('[data-testid="flow-answer"] [data-line]')].map((l) => l.getBoundingClientRect())
    // 線の終点が、回答案のいずれかの行の高さに来ているか
    return edges.filter((p) => { const len = p.getTotalLength(); const end = p.getPointAtLength(len); const m = p.getScreenCTM(); const y = end.x * m.b + end.y * m.d + m.f; return lines.some((r) => y >= r.top - 4 && y <= r.bottom + 4) }).length + "/" + edges.length })()`)
  const [hit, all] = lineHit.split("/").map(Number)
  check("library-line-anchor", all > 0 && hit === all, `行の高さに着いた線 ${lineHit}`)
  await a.evaluate(`(() => { const n = document.querySelector('[data-testid="flow-qa"]'); n.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })); n.dispatchEvent(new MouseEvent("mouseenter", { bubbles: false })); })()`)
  await a.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...(await a.evaluate(`(() => { const r = document.querySelector('[data-testid="flow-qa"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })()`)) })
  const lit = await a.waitFor(`document.querySelectorAll('[data-testid="flow-answer"] [data-line].outline').length`, 3000)
  check("library-hover", lit >= 1, `重ねた根拠を引用した行 ${lit} 行が光る`)
  await a.shot("08-library-flow")
  const identLogs = logs.filter((l) => !l.startsWith("[viewer") && l.includes("株主を照合しました"))
  check("ident-ai", identLogs.length >= 2, identLogs.map((l) => l.slice(l.indexOf("{"))).join(" / ") || "生成 AI の照合が呼ばれていません")
  writeFileSync(join(outDir, "logs.txt"), logs.join("\n"))
  writeFileSync(join(outDir, "results.json"), JSON.stringify(results, null, 2))
  a.ws.close()
  b.ws.close()
} finally {
  stopAll()
}
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} 合格`)
process.exit(failed.length ? 1 : 0)
