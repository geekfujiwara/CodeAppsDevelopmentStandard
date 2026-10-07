import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Outlet, useLocation } from "react-router-dom"
import { getContext } from "@microsoft/power-apps/app"
import { CODEAPPS_APP_NAME, NAV_SECTIONS, TERMINAL_VERSION } from "@/config"
import { HelpDialog } from "@/components/terminal/help-dialog"
import { TerminalContext, type FKeyDef, type MessageKind } from "@/components/terminal/terminal-context"
import { useSetting } from "@/lib/queries"
import { fmtDate } from "@/lib/order-rules"

const HELP_SEEN_KEY = "order-terminal-help-seen"
const SCREEN_IDS: Record<string, string> = { "/menu": "MN-000", "/order": "OD-110", "/orders": "OD-210", "/stock": "ST-310", "/weather": "WX-410" }

export default function Layout() {
  const location = useLocation()
  const setting = useSetting()
  const [userName, setUserName] = useState("")
  const [helpOpen, setHelpOpen] = useState(() => {
    try {
      return localStorage.getItem(HELP_SEEN_KEY) !== "1"
    } catch {
      return false
    }
  })
  const [message, setMessageState] = useState<{ text: string; kind: MessageKind }>({ text: "", kind: "info" })
  const fkeys = useRef<FKeyDef[]>([])
  const [, setSignature] = useState("")

  const setFKeys = useCallback((defs: FKeyDef[]) => {
    fkeys.current = defs
    const sig = defs.map((d) => `${d.key}:${d.label}:${d.disabled ? 1 : 0}`).join("|")
    setSignature((prev) => (prev === sig ? prev : sig))
  }, [])
  const setMessage = useCallback((text: string, kind: MessageKind = "info") => setMessageState({ text, kind }), [])
  const openHelp = useCallback(() => setHelpOpen(true), [])
  const closeHelp = useCallback(() => {
    setHelpOpen(false)
    try {
      localStorage.setItem(HELP_SEEN_KEY, "1")
    } catch {
      /* 保存できない環境では毎回表示される */
    }
  }, [])
  const ctx = useMemo(() => ({ setFKeys, setMessage, openHelp }), [setFKeys, setMessage, openHelp])

  useEffect(() => {
    getContext()
      .then((c) => setUserName(c.user?.fullName || c.user?.userPrincipalName || ""))
      .catch(() => setUserName(""))
  }, [])

  // 画面が変わったらメッセージを消す
  useEffect(() => setMessageState({ text: "", kind: "info" }), [location.pathname])

  // ファンクションキー（F1〜F10）と Esc（= F2）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector(".t-overlay")) return
      const m = /^F(\d{1,2})$/.exec(e.key)
      const no = m ? Number(m[1]) : e.key === "Escape" ? 2 : 0
      if (!no) return
      const def = fkeys.current.find((d) => d.key === no)
      // F1（ヘルプ）・F5（再読み込み）などブラウザの動きを止める。F11・F12 は止めない
      if (m && no <= 10) e.preventDefault()
      if (def && !def.disabled) {
        e.preventDefault()
        def.action()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const nav = NAV_SECTIONS[0].items.find((i) => location.pathname === i.path || location.pathname.startsWith(`${i.path}/`))
  const s = setting.data
  const keys = Array.from({ length: 12 }, (_, i) => fkeys.current.find((d) => d.key === i + 1))

  return (
    <TerminalContext.Provider value={ctx}>
      <div className="t-root">
        <div className="t-window">
          <div className="t-titlebar">
            <span>
              {CODEAPPS_APP_NAME} <small>{TERMINAL_VERSION}</small>
            </span>
            <span className="t-titlebar-btns" aria-hidden="true">
              <span>_</span>
              <span>□</span>
              <span>×</span>
            </span>
          </div>

          <div className="t-infobar" aria-label="店舗情報">
            <span className="t-field"><b>店番</b><span>0001</span></span>
            <span className="t-field"><b>店名</b><span>{s?.storeName ?? "―"}</span></span>
            <span className="t-field"><b>営業日</b><span>{s ? fmtDate(s.businessDate) : "―"}</span></span>
            <span className="t-field"><b>業務時刻</b><span>{s?.demoTime ?? "--:--"}</span></span>
            <span className="t-field"><b>担当者</b><span>{userName || "―"}</span></span>
          </div>

          <div className="t-screenbar">
            <h1>{nav?.label ?? "業務"}</h1>
            <span className="t-screen-id">画面ID {SCREEN_IDS[nav?.path ?? ""] ?? "--"}</span>
          </div>

          <main className="t-main">
            {setting.isError ? (
              <div className="t-panel">
                <p className="t-up">本部のデータに接続できません。</p>
                <p>{String((setting.error as Error)?.message ?? setting.error)}</p>
              </div>
            ) : (
              <Outlet />
            )}
          </main>

          <div className={`t-message${message.kind === "error" ? " t-msg-error" : message.kind === "warn" ? " t-msg-warn" : ""}`} role="status" aria-live="polite">
            <span>{message.text ? `＞ ${message.text}` : "＞ "}</span>
            {!message.text && <span className="t-blink">_</span>}
          </div>

          <nav className="t-fkeys" aria-label="ファンクションキー">
            {keys.map((def, i) => (
              <button
                key={i}
                type="button"
                className="t-fkey"
                disabled={!def || def.disabled}
                onClick={() => {
                  // 表示中のラベルが描画待ちでも、押した時点の最新の定義で動かす（キーボードと同じ）
                  if (document.querySelector(".t-overlay")) return
                  const cur = fkeys.current.find((d) => d.key === i + 1)
                  if (cur && !cur.disabled) cur.action()
                }}
                title={def ? `F${i + 1} ${def.label}` : undefined}
              >
                <b>F{i + 1}</b>
                {def?.label ?? "　"}
              </button>
            ))}
          </nav>
        </div>
      </div>
      {helpOpen && <HelpDialog onClose={closeHelp} />}
    </TerminalContext.Provider>
  )
}
