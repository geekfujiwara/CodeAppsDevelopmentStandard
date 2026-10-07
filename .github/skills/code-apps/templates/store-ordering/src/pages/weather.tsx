import { useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import { useFunctionKeys, useMessage } from "@/components/terminal/terminal-context"
import { useEvents, useSetting, useWeather } from "@/lib/queries"
import { fmtShort } from "@/lib/order-rules"

const ICON: Record<string, string> = { 晴れ: "☀", くもり: "☁", 雨: "☂" }

export default function WeatherPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const setMessage = useMessage()
  const setting = useSetting()
  const today = setting.data?.businessDate
  const weather = useWeather(today)
  const events = useEvents(today)

  useEffect(() => setMessage("今日から 7 日の予報と、直近 7 日の実績・周辺の催事です。"), [setMessage])

  useFunctionKeys([
    { key: 1, label: "メニュー", action: () => navigate("/menu") },
    { key: 2, label: "戻る", action: () => navigate("/menu") },
    {
      key: 5,
      label: "再表示",
      action: () => {
        void queryClient.invalidateQueries({ queryKey: ["weather"] })
        void queryClient.invalidateQueries({ queryKey: ["events"] })
        setMessage("天気と催事を読み直しました。")
      },
    },
    { key: 6, label: "単品発注", action: () => navigate("/order") },
  ])

  if (weather.isLoading || events.isLoading || !today) return <div className="t-loading">天気・催事を読み込み中…</div>

  const forecast = (weather.data ?? []).filter((w) => w.date >= today)
  const past = (weather.data ?? []).filter((w) => w.date < today)
  const upcoming = (events.data ?? []).filter((e) => e.date >= today)
  const recent = (events.data ?? []).filter((e) => e.date < today).reverse()

  const weatherRows = (list: typeof forecast) =>
    list.map((w) => (
      <tr key={w.date} className={w.date === today ? "t-selected" : undefined}>
        <td>{fmtShort(w.date)}{w.date === today ? " 本日" : ""}</td>
        <td>{ICON[w.condition] ?? ""} {w.condition}</td>
        <td className="t-num">{w.tempMax ?? "―"}</td>
        <td className="t-num">{w.tempMin ?? "―"}</td>
        <td className="t-num">{w.precipProb != null ? `${w.precipProb}%` : "―"}</td>
        <td className={`t-num${w.tempDiff != null && w.tempDiff <= -5 ? " t-down" : w.tempDiff != null && w.tempDiff >= 5 ? " t-up" : ""}`}>
          {w.tempDiff != null ? `${w.tempDiff > 0 ? "+" : ""}${w.tempDiff}` : "―"}
        </td>
        <td>{w.kind}</td>
      </tr>
    ))

  const head = (
    <thead>
      <tr>
        <th>日付</th><th>天気</th><th className="t-num">最高℃</th><th className="t-num">最低℃</th><th className="t-num">降水</th><th className="t-num">前日差</th><th>区分</th>
      </tr>
    </thead>
  )

  return (
    <>
      <fieldset className="t-panel">
        <legend>週間予報（店舗周辺）</legend>
        <div className="t-table-wrap">
          <table className="t-table">
            {head}
            <tbody>{weatherRows(forecast)}</tbody>
          </table>
        </div>
        <p className="t-mini">前日差が −5℃ 以下（青）は冷え込み、+5℃ 以上（赤）は気温上昇。</p>
      </fieldset>

      <fieldset className="t-panel">
        <legend>周辺の催事（半径 1km）</legend>
        <div className="t-table-wrap">
          <table className="t-table">
            <thead>
              <tr>
                <th>日付</th><th>時間</th><th>名称</th><th>会場</th><th className="t-num">規模</th><th className="t-num">距離</th>
              </tr>
            </thead>
            <tbody>
              {[...upcoming, ...recent].map((e) => (
                <tr key={`${e.date}-${e.name}`} className={e.date === today ? "t-selected" : undefined}>
                  <td>{fmtShort(e.date)}{e.date === today ? " 本日" : e.date < today ? " 済" : ""}</td>
                  <td>{e.start}〜{e.end}</td>
                  <td>{e.name}</td>
                  <td>{e.venue}</td>
                  <td className="t-num">約 {e.scale.toLocaleString("ja-JP")} 人</td>
                  <td className="t-num">{e.distanceM} m</td>
                </tr>
              ))}
              {!upcoming.length && !recent.length && (
                <tr><td colSpan={6} className="t-center">予定されている催事はありません</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </fieldset>

      <fieldset className="t-panel">
        <legend>直近 7 日の天気（実績）</legend>
        <div className="t-table-wrap">
          <table className="t-table">
            {head}
            <tbody>{weatherRows(past)}</tbody>
          </table>
        </div>
      </fieldset>
    </>
  )
}
