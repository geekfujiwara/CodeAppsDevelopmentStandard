import * as sdk from "microsoft-cognitiveservices-speech-sdk"

export type LogLevel = "debug" | "info" | "warn" | "error"
export type LogEntry = { at: string; level: LogLevel; scope: string; message: string; data?: unknown }

const listeners = new Set<(entry: LogEntry) => void>()
const history: LogEntry[] = []
let tag = "APP"
let installed = false

function serialize(data: unknown): string {
  if (typeof data === "string") return data
  if (data instanceof Error) return JSON.stringify({ name: data.name, message: data.message, stack: data.stack })
  if (data instanceof Event) return JSON.stringify({ type: data.type })
  try {
    return JSON.stringify(data)
  } catch {
    return String(data)
  }
}

function emit(level: LogLevel, scope: string, message: string, data?: unknown) {
  const entry: LogEntry = { at: new Date().toISOString().slice(11, 23), level, scope, message, data }
  history.push(entry)
  if (history.length > 2000) history.shift()
  const prefix = `[${tag} ${entry.at}][${scope}]`
  const write = level === "error" ? console.error : level === "warn" ? console.warn : level === "info" ? console.info : console.log
  // コピー＆ペーストで読めるよう、データは JSON 文字列で出力する（DevTools のオブジェクト表示はコピーすると {…} になる）
  if (data === undefined) write(prefix, message)
  else write(prefix, message, serialize(data))
  listeners.forEach((listener) => listener(entry))
}

export function createLogger(scope: string) {
  return {
    debug: (message: string, data?: unknown) => emit("debug", scope, message, data),
    info: (message: string, data?: unknown) => emit("info", scope, message, data),
    warn: (message: string, data?: unknown) => emit("warn", scope, message, data),
    error: (message: string, data?: unknown) => emit("error", scope, message, data),
  }
}

export function subscribeLog(listener: (entry: LogEntry) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getLogHistory(): LogEntry[] {
  return [...history]
}

// main.tsx で 1 回だけ呼ぶ。アプリのログ・Speech SDK の内部ログ・未処理例外・CSP 違反を Console に集約する
export function installDebugLogging(options: { tag?: string } = {}) {
  if (installed) return
  installed = true
  tag = options.tag ?? tag
  const global = createLogger("global")

  window.addEventListener("error", (event) => global.error(`未処理の例外: ${event.message}`, event.error))
  window.addEventListener("unhandledrejection", (event) => global.error("未処理の Promise 拒否", event.reason))
  document.addEventListener("securitypolicyviolation", (event) =>
    global.error(`CSP 違反: ${event.effectiveDirective} ${event.blockedURI}`, { source: event.sourceFile, line: event.lineNumber }),
  )

  // SDK の Debug ログは音声チャンクごとに出るため console.debug（DevTools の「詳細 / Verbose」）に分ける
  sdk.Diagnostics.SetLoggingLevel(sdk.LogLevel.Debug)
  sdk.Diagnostics.onLogOutput = (line: string) => console.debug(`[${tag}][speech-sdk]`, line)

  const historyName = `${tag.toLowerCase()}Logs`
  Object.assign(window, {
    [historyName]: () => console.table(getLogHistory().map(({ at, level, scope, message }) => ({ at, level, scope, message }))),
  })
  global.info(`デバッグログを有効化しました（Console で「[${tag}」で絞り込み、${historyName}() で履歴を表形式表示）`)
}
