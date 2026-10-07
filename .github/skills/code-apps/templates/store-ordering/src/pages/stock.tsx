import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import { useFunctionKeys, useMessage } from "@/components/terminal/terminal-context"
import { useInventory, useItemDaily, useItems, useSetting, useTrends } from "@/lib/queries"
import { fmtShort, textBar } from "@/lib/order-rules"

const CATEGORY_ORDER = ["おにぎり", "弁当", "麺", "パン", "デザート", "サラダ", "おでん", "ホットスナック", "飲料", "アイス", "日用品"]

export default function StockPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const setMessage = useMessage()
  const setting = useSetting()
  const items = useItems()
  const inventory = useInventory()
  const trends = useTrends()
  const [catIndex, setCatIndex] = useState(0)
  const [selected, setSelected] = useState(0)

  const categories = useMemo(() => {
    const set = new Set((items.data ?? []).map((i) => i.category))
    return [...CATEGORY_ORDER.filter((c) => set.has(c)), ...[...set].filter((c) => !CATEGORY_ORDER.includes(c))]
  }, [items.data])
  const category = categories[catIndex] ?? ""
  const rows = useMemo(() => (items.data ?? []).filter((i) => i.category === category), [items.data, category])
  const invMap = useMemo(() => new Map((inventory.data ?? []).map((v) => [v.sku, v])), [inventory.data])
  const trendMap = useMemo(() => new Map((trends.data ?? []).map((t) => [t.sku, t])), [trends.data])
  const current = rows[Math.min(selected, Math.max(rows.length - 1, 0))]
  const daily = useItemDaily(setting.data?.businessDate, current?.sku, 14)
  const maxQty = Math.max(1, ...(daily.data ?? []).map((d) => Math.max(d.salesQty, d.wasteQty)))
  const unit = Math.max(1, Math.ceil(maxQty / 25))

  const moveCategory = (delta: number) => {
    if (!categories.length) return
    setCatIndex((i) => (i + delta + categories.length) % categories.length)
    setSelected(0)
  }

  useEffect(() => setMessage("↑↓ で品目を選ぶと、直近 14 日の販売と廃棄を表示します。F3・F4 で分類を切り替え。"), [setMessage])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector(".t-overlay")) return
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setSelected((i) => Math.min(i + 1, rows.length - 1))
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        setSelected((i) => Math.max(i - 1, 0))
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [rows.length])

  useFunctionKeys([
    { key: 1, label: "メニュー", action: () => navigate("/menu") },
    { key: 2, label: "戻る", action: () => navigate("/menu") },
    { key: 3, label: "前分類", action: () => moveCategory(-1) },
    { key: 4, label: "次分類", action: () => moveCategory(1) },
    {
      key: 5,
      label: "再表示",
      action: () => {
        void queryClient.invalidateQueries()
        setMessage("本部のデータを読み直しました。")
      },
    },
    { key: 6, label: "単品発注", action: () => navigate("/order") },
  ])

  if (items.isLoading || inventory.isLoading || trends.isLoading) return <div className="t-loading">在庫を読み込み中…</div>

  const t = current ? trendMap.get(current.sku) : undefined
  return (
    <>
      <div className="t-tabs" role="tablist" aria-label="分類">
        {categories.map((c, i) => (
          <button key={c} type="button" role="tab" className="t-tab" aria-selected={i === catIndex} onClick={() => { setCatIndex(i); setSelected(0) }}>
            {c}
          </button>
        ))}
      </div>
      <div className="t-table-wrap" style={{ maxHeight: 300 }}>
        <table className="t-table">
          <thead>
            <tr>
              <th>コード</th><th>品名</th><th>区分</th><th className="t-num">在庫</th><th className="t-num">本日販売</th><th className="t-num">残見込</th><th className="t-num">過不足</th><th>判定</th>
              <th className="t-num">7日平均</th><th>前週比</th><th className="t-num">廃棄14日</th><th className="t-num">廃棄率</th><th className="t-num">廃棄連続</th><th className="t-num">欠品14日</th><th>売れる時間</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item, i) => {
              const inv = invMap.get(item.sku)
              const tr = trendMap.get(item.sku)
              return (
                <tr key={item.sku} className={`t-clickable${i === selected ? " t-selected" : ""}`} onClick={() => setSelected(i)}>
                  <td>{item.sku}</td>
                  <td>{item.name}</td>
                  <td>{item.itemType}</td>
                  <td className="t-num">{inv?.stock ?? "―"}</td>
                  <td className="t-num">{inv?.soldToday ?? "―"}</td>
                  <td className="t-num">{inv ? inv.expectedRest.toFixed(1) : "―"}</td>
                  <td className={`t-num${inv && inv.balance < 0 ? " t-up" : ""}`}>{inv ? inv.balance.toFixed(1) : "―"}</td>
                  <td>{inv?.status ?? "―"}</td>
                  <td className="t-num">{tr ? tr.avg7.toFixed(1) : "―"}</td>
                  <td>{tr?.weekRatio ?? "―"}</td>
                  <td className="t-num">{tr?.waste14 ?? "―"}</td>
                  <td className={`t-num${tr && tr.wasteRate14 >= 30 ? " t-up" : ""}`}>{tr ? `${tr.wasteRate14.toFixed(1)}%` : "―"}</td>
                  <td className={`t-num${tr && tr.wasteStreak >= 3 ? " t-up" : ""}`}>{tr ? `${tr.wasteStreak}日` : "―"}</td>
                  <td className={`t-num${tr && tr.stockoutDays14 >= 5 ? " t-up" : ""}`}>{tr ? `${tr.stockoutDays14}日` : "―"}</td>
                  <td>{tr?.peakHours || "―"}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {current && (
        <fieldset className="t-panel" style={{ marginTop: 8 }}>
          <legend>
            {current.sku} {current.name} — 直近 14 日の販売と廃棄（■ 1 個 = {unit} 個）
          </legend>
          {t && (
            <div className="t-row" style={{ marginBottom: 6 }}>
              <span className="t-field"><b>雨の日平均</b><span>{t.rainAvg ?? "―"}</span></span>
              <span className="t-field"><b>晴・曇平均</b><span>{t.dryAvg ?? "―"}</span></span>
              <span className="t-field"><b>催事日平均</b><span>{t.eventAvg ?? "―"}</span></span>
              <span className="t-field"><b>売切時刻</b><span>{t.soldOutHour != null ? `${t.soldOutHour.toFixed(1)}時` : "―"}</span></span>
              <span className="t-field"><b>機会ロス数</b><span>{t.lost14}</span></span>
            </div>
          )}
          <div className="t-table-wrap" style={{ maxHeight: 320 }}>
            <table className="t-table">
              <thead>
                <tr>
                  <th>日付</th><th>天気</th><th className="t-num">納品</th><th className="t-num">販売</th><th className="t-num">廃棄</th><th>売切</th><th>グラフ（青=販売 赤=廃棄）</th>
                </tr>
              </thead>
              <tbody>
                {daily.isLoading && (
                  <tr><td colSpan={7} className="t-center">読み込み中…</td></tr>
                )}
                {(daily.data ?? []).map((d) => (
                  <tr key={d.date}>
                    <td>{fmtShort(d.date)}</td>
                    <td>{d.weather} {d.tempMax != null ? `${d.tempMax}℃` : ""}</td>
                    <td className="t-num">{d.deliveryMorning + d.deliveryEvening}</td>
                    <td className="t-num">{d.salesQty}</td>
                    <td className={`t-num${d.wasteQty > 0 ? " t-up" : ""}`}>{d.wasteQty}</td>
                    <td>{d.soldOutHour != null ? `${d.soldOutHour}時台` : ""}</td>
                    <td>
                      <span className="t-bar t-bar-sales">{textBar(d.salesQty, unit)}</span>
                      <span className="t-bar t-bar-waste">{textBar(d.wasteQty, unit)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </fieldset>
      )}
    </>
  )
}
