import { useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { NAV_SECTIONS } from "@/config"
import { useFunctionKeys, useHelp, useMessage } from "@/components/terminal/terminal-context"
import { useOrders, useSetting } from "@/lib/queries"
import { fmtDate } from "@/lib/order-rules"
import { useQueryClient } from "@tanstack/react-query"

const ITEMS = NAV_SECTIONS[0].items.filter((i) => i.no !== "0")

export default function MenuPage() {
  const navigate = useNavigate()
  const openHelp = useHelp()
  const setMessage = useMessage()
  const queryClient = useQueryClient()
  const setting = useSetting()
  const orders = useOrders()

  const go = (path: string) => navigate(path)
  useFunctionKeys([
    { key: 1, label: "単品発注", action: () => go("/order") },
    { key: 2, label: "発注照会", action: () => go("/orders") },
    { key: 3, label: "在庫照会", action: () => go("/stock") },
    { key: 4, label: "天気催事", action: () => go("/weather") },
    {
      key: 5,
      label: "再表示",
      action: () => {
        void queryClient.invalidateQueries()
        setMessage("本部のデータを読み直しました。")
      },
    },
    { key: 9, label: "操作説明", action: openHelp },
  ])

  // 数字キーで業務を選ぶ
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector(".t-overlay") || (e.target as HTMLElement)?.tagName === "INPUT") return
      const hit = ITEMS.find((i) => i.no === e.key)
      if (hit) {
        e.preventDefault()
        navigate(hit.path)
      } else if (e.key === "9") {
        e.preventDefault()
        openHelp()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [navigate, openHelp])

  useEffect(() => setMessage("業務を番号で選んでください。"), [setMessage])

  const s = setting.data
  const today = s?.businessDate ?? ""
  const todays = (orders.data ?? []).filter((o) => o.deliveryDate >= today && o.status !== "取消")

  return (
    <>
      <fieldset className="t-panel">
        <legend>業務メニュー</legend>
        <div className="t-menu">
          {ITEMS.map((i) => (
            <button key={i.key} type="button" className="t-btn t-menu-btn" onClick={() => go(i.path)}>
              <span className="t-num">{i.no}</span>
              <span>
                {i.label}
                <small>{i.note}</small>
              </span>
            </button>
          ))}
          <button type="button" className="t-btn t-menu-btn" onClick={openHelp}>
            <span className="t-num">9</span>
            <span>
              操作説明
              <small>この端末の使い方</small>
            </span>
          </button>
        </div>
      </fieldset>

      <fieldset className="t-panel">
        <legend>本日の状況</legend>
        <div className="t-table-wrap">
          <table className="t-table">
            <tbody>
              <tr>
                <th>営業日</th>
                <td>{s ? fmtDate(s.businessDate) : "―"}</td>
                <th>業務時刻</th>
                <td>{s?.demoTime ?? "―"}</td>
              </tr>
              <tr>
                <th>夕方便の締め</th>
                <td>本日 10:00（16:00 納品）</td>
                <th>朝便の締め</th>
                <td>日配 21:00 ／ 常温・冷凍 11:00（翌 6:00 納品）</td>
              </tr>
              <tr>
                <th>本日以降の発注</th>
                <td>{orders.isLoading ? "読み込み中…" : `${todays.length} 件`}</td>
                <th>デモ設定</th>
                <td className="t-wrap">{s?.scenarioTitle ?? "―"}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </fieldset>
    </>
  )
}
