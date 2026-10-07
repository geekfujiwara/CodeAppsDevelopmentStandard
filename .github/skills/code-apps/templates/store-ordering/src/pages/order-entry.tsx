import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import { ORDER_SOURCE } from "@/config"
import { TerminalDialog } from "@/components/terminal/terminal-dialog"
import { useFunctionKeys, useMessage } from "@/components/terminal/terminal-context"
import { useInventory, useItems, useRecentDaily, useSetting, useTrends } from "@/lib/queries"
import { createOrder, fetchOrders, type Item } from "@/lib/store-api"
import {
  addDays,
  fmtDate,
  fmtShort,
  formatLines,
  nextOrderNo,
  orderability,
  qtyError,
  remaining,
  slotInfo,
  toMinutes,
  weekday,
  yen,
  type SlotKey,
} from "@/lib/order-rules"

const CATEGORY_ORDER = ["おにぎり", "弁当", "麺", "パン", "デザート", "サラダ", "おでん", "ホットスナック", "飲料", "アイス", "日用品"]
type Mode = "input" | "confirm" | "done"
type Qty = Record<SlotKey, Record<string, string>>
type Pending = { kind: "leave" | "clear" | "send"; to?: string } | null

export default function OrderEntry() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const setMessage = useMessage()
  const setting = useSetting()
  const items = useItems()
  const inventory = useInventory()
  const trends = useTrends()
  const today = setting.data?.businessDate
  const now = setting.data?.demoTime ?? "00:00"
  const daily = useRecentDaily(today, 7)

  const [slot, setSlot] = useState<SlotKey>("evening")
  const [catIndex, setCatIndex] = useState(0)
  const [qty, setQty] = useState<Qty>({ evening: {}, morning: {} })
  const [mode, setMode] = useState<Mode>("input")
  const [memo, setMemo] = useState("店舗端末から入力")
  const [focusSku, setFocusSku] = useState<string | null>(null)
  const [pending, setPending] = useState<Pending>(null)
  const [sending, setSending] = useState(false)
  const [doneNo, setDoneNo] = useState("")
  const inputs = useRef<Map<string, HTMLInputElement>>(new Map())

  // 夕方便の締め（10:00）を過ぎていたら朝便から始める
  useEffect(() => {
    if (setting.data && toMinutes(setting.data.demoTime) >= toMinutes("10:00")) setSlot("morning")
  }, [setting.data])

  const invMap = useMemo(() => new Map((inventory.data ?? []).map((v) => [v.sku, v])), [inventory.data])
  const trendMap = useMemo(() => new Map((trends.data ?? []).map((t) => [t.sku, t])), [trends.data])
  const categories = useMemo(() => {
    const set = new Set((items.data ?? []).map((i) => i.category))
    return [...CATEGORY_ORDER.filter((c) => set.has(c)), ...[...set].filter((c) => !CATEGORY_ORDER.includes(c))]
  }, [items.data])
  const category = categories[catIndex] ?? ""
  const rows = useMemo(() => (items.data ?? []).filter((i) => i.category === category), [items.data, category])
  const days = useMemo(() => (today ? Array.from({ length: 7 }, (_, k) => addDays(today, k - 7)) : []), [today])
  const salesBy = useMemo(() => {
    const m = new Map<string, number>()
    for (const d of daily.data ?? []) m.set(`${d.sku}|${d.date}`, d.salesQty)
    return m
  }, [daily.data])

  const info = today ? slotInfo(slot, today) : null
  const slotCutoff = slot === "evening" ? "10:00" : "21:00"
  const current = qty[slot]

  const lines = useMemo(() => {
    const list: { item: Item; qty: number; error: string | null; closed: string | null }[] = []
    for (const item of items.data ?? []) {
      const raw = current[item.sku]
      if (raw === undefined || raw === "") continue
      const n = Number(raw)
      if (n === 0) continue
      const ord = orderability(item, invMap.get(item.sku), slot, now)
      list.push({ item, qty: n, error: qtyError(n, item.minLot), closed: ord.ok ? null : ord.reason })
    }
    return list
  }, [items.data, current, invMap, slot, now])
  const totalQty = lines.reduce((a, l) => a + l.qty, 0)
  const totalAmount = lines.reduce((a, l) => a + l.qty * l.item.price, 0)
  const dirty = lines.length > 0 && mode !== "done"

  const leave = useCallback(
    (to: string) => {
      if (dirty) setPending({ kind: "leave", to })
      else navigate(to)
    },
    [dirty, navigate],
  )

  const moveCategory = (delta: number) => {
    if (!categories.length) return
    setCatIndex((i) => (i + delta + categories.length) % categories.length)
  }

  const goConfirm = () => {
    if (!lines.length) {
      setMessage("発注数が入力されていません。", "warn")
      return
    }
    const bad = lines.find((l) => l.error)
    if (bad) {
      setMessage(`${bad.item.sku} ${bad.item.name}: ${bad.error}`, "error")
      return
    }
    const closed = lines.find((l) => l.closed)
    if (closed) {
      setMessage(`${closed.item.sku} ${closed.item.name} は ${info?.label} に発注できません（${closed.closed}）。`, "error")
      return
    }
    setMode("confirm")
    setMessage("内容を確認して F10 で送信してください。F2 で入力に戻ります。")
  }

  const send = async () => {
    if (!info || !today) return
    setSending(true)
    try {
      const all = await queryClient.fetchQuery({ queryKey: ["orders"], queryFn: fetchOrders, staleTime: 0 })
      const no = nextOrderNo(all, info.deliveryDate, info.label)
      await createOrder({
        no,
        deliveryDate: info.deliveryDate,
        slot: info.label,
        lines: formatLines(lines.map((l) => ({ sku: l.item.sku, name: l.item.name, qty: l.qty }))),
        itemCount: lines.length,
        totalQty,
        totalAmount,
        reason: memo.trim() || "店舗端末から入力",
        source: ORDER_SOURCE,
      })
      await queryClient.invalidateQueries({ queryKey: ["orders"] })
      setDoneNo(no)
      setQty((q) => ({ ...q, [slot]: {} }))
      setMode("done")
      setMessage(`送信しました。発注番号 ${no}`)
    } catch (err) {
      setMessage(`送信できませんでした: ${err instanceof Error ? err.message : String(err)}`, "error")
    } finally {
      setSending(false)
      setPending(null)
    }
  }

  const setRowQty = (sku: string, value: string) => {
    if (!/^\d{0,3}$/.test(value)) return
    setQty((q) => ({ ...q, [slot]: { ...q[slot], [sku]: value } }))
  }

  const validateRow = (item: Item) => {
    const raw = current[item.sku]
    if (!raw) return
    const err = qtyError(Number(raw), item.minLot)
    if (err) setMessage(`${item.sku} ${item.name}: ${err}`, "error")
  }

  const orderableRows = rows.filter((r) => orderability(r, invMap.get(r.sku), slot, now).ok)
  const focusRow = (sku: string | undefined) => {
    if (!sku) return
    const el = inputs.current.get(sku)
    el?.focus()
    el?.select()
  }
  const onInputKey = (e: React.KeyboardEvent<HTMLInputElement>, item: Item) => {
    const idx = orderableRows.findIndex((r) => r.sku === item.sku)
    if (e.key === "Enter" || e.key === "ArrowDown") {
      e.preventDefault()
      validateRow(item)
      focusRow(orderableRows[idx + 1]?.sku ?? orderableRows[0]?.sku)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      validateRow(item)
      focusRow(orderableRows[idx - 1]?.sku ?? orderableRows[orderableRows.length - 1]?.sku)
    }
  }

  // 分類・便を変えたら、最初の入力欄へ
  useEffect(() => {
    if (mode !== "input") return
    const first = orderableRows[0]?.sku
    const t = setTimeout(() => focusRow(first), 50)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, slot, mode, items.data, inventory.data])

  useEffect(() => {
    if (mode === "input" && info) setMessage(`${info.label}（${fmtShort(info.deliveryDate)} ${info.deliveryTime} 納品）の発注数を入力してください。F10 で確認。`)
  }, [mode, info?.label, info?.deliveryDate, info?.deliveryTime, setMessage]) // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = () => {
    void queryClient.invalidateQueries()
    setMessage("本部のデータを読み直しました。")
  }

  const inputKeys = [
    { key: 1, label: "メニュー", action: () => leave("/menu") },
    { key: 2, label: "戻る", action: () => leave("/menu") },
    { key: 3, label: "前分類", action: () => moveCategory(-1) },
    { key: 4, label: "次分類", action: () => moveCategory(1) },
    { key: 5, label: "再表示", action: refresh },
    { key: 6, label: slot === "evening" ? "朝便へ" : "夕方便へ", action: () => setSlot((s) => (s === "evening" ? "morning" : "evening")) },
    { key: 8, label: "行クリア", action: () => focusSku && setRowQty(focusSku, ""), disabled: !focusSku },
    { key: 9, label: "全クリア", action: () => lines.length && setPending({ kind: "clear" }), disabled: !lines.length },
    { key: 10, label: "確認", action: goConfirm },
  ]
  const confirmKeys = [
    { key: 1, label: "メニュー", action: () => leave("/menu") },
    { key: 2, label: "修正", action: () => setMode("input") },
    { key: 10, label: "送信", action: () => setPending({ kind: "send" }), disabled: sending },
  ]
  const doneKeys = [
    { key: 1, label: "メニュー", action: () => navigate("/menu") },
    { key: 2, label: "続けて入力", action: () => setMode("input") },
    { key: 3, label: "発注照会", action: () => navigate("/orders") },
  ]
  useFunctionKeys(mode === "input" ? inputKeys : mode === "confirm" ? confirmKeys : doneKeys)

  if (setting.isLoading || items.isLoading || inventory.isLoading) return <div className="t-loading">本部のデータを読み込み中…</div>
  if (!info || !today) return <div className="t-loading">デモ設定を読み込めません。</div>

  const header = (
    <fieldset className="t-panel">
      <legend>発注条件</legend>
      <div className="t-row">
        <span className="t-field"><b>便</b><span>{info.label}</span></span>
        <span className="t-field"><b>納品</b><span>{fmtDate(info.deliveryDate)} {info.deliveryTime}</span></span>
        <span className="t-field"><b>締め</b><span>本日 {slotCutoff}{slot === "morning" ? "（常温・冷凍 11:00）" : ""}</span></span>
        <span className="t-field"><b>残り</b><span className={toMinutes(now) >= toMinutes(slotCutoff) ? "t-up" : ""}>{remaining(now, slotCutoff)}</span></span>
        <span className="t-field"><b>入力</b><span>{lines.length} 品目 ／ {totalQty} 個 ／ {yen(totalAmount)}</span></span>
      </div>
    </fieldset>
  )

  if (mode === "done") {
    return (
      <>
        {header}
        <fieldset className="t-panel">
          <legend>送信結果</legend>
          <p className="t-down" style={{ fontSize: 18 }}>発注を送信しました。</p>
          <div className="t-table-wrap">
            <table className="t-table">
              <tbody>
                <tr><th>発注番号</th><td>{doneNo}</td></tr>
                <tr><th>便・納品</th><td>{info.label} ／ {fmtDate(info.deliveryDate)} {info.deliveryTime}</td></tr>
                <tr><th>状態</th><td>受付済（締め時刻までは発注照会で取消できます）</td></tr>
              </tbody>
            </table>
          </div>
          <p className="t-mini">F2 で続けて入力、F3 で発注照会。</p>
        </fieldset>
      </>
    )
  }

  if (mode === "confirm") {
    return (
      <>
        {header}
        <fieldset className="t-panel">
          <legend>発注確認</legend>
          <div className="t-table-wrap">
            <table className="t-table">
              <thead>
                <tr>
                  <th>No</th><th>分類</th><th>コード</th><th>品名</th><th className="t-num">数量</th><th className="t-num">売価</th><th className="t-num">金額</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={l.item.sku}>
                    <td className="t-num">{i + 1}</td>
                    <td>{l.item.category}</td>
                    <td>{l.item.sku}</td>
                    <td>{l.item.name}</td>
                    <td className="t-num">{l.qty}</td>
                    <td className="t-num">{yen(l.item.price)}</td>
                    <td className="t-num">{yen(l.qty * l.item.price)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4}>合計 {lines.length} 品目</td>
                  <td className="t-num">{totalQty}</td>
                  <td></td>
                  <td className="t-num">{yen(totalAmount)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="t-row" style={{ marginTop: 8 }}>
            <label htmlFor="memo">発注メモ</label>
            <input id="memo" className="t-input t-input-wide t-grow" maxLength={200} value={memo} onChange={(e) => setMemo(e.target.value)} />
          </div>
        </fieldset>
        {pending?.kind === "send" && (
          <TerminalDialog
            title="発注送信"
            icon="q"
            onClose={() => setPending(null)}
            actions={[
              { label: sending ? "送信中…" : "はい(Y)", onClick: () => void send(), primary: true, disabled: sending },
              { label: "いいえ(N)", onClick: () => setPending(null), disabled: sending },
            ]}
          >
            <p>{info.label}（{fmtShort(info.deliveryDate)} {info.deliveryTime} 納品）</p>
            <p>{lines.length} 品目・{totalQty} 個・{yen(totalAmount)} を送信しますか？</p>
          </TerminalDialog>
        )}
      </>
    )
  }

  return (
    <>
      {header}
      <div className="t-tabs" role="tablist" aria-label="分類">
        {categories.map((c, i) => (
          <button key={c} type="button" role="tab" className="t-tab" aria-selected={i === catIndex} onClick={() => setCatIndex(i)}>
            {c}
            {Object.entries(current).some(([sku, v]) => v && Number(v) > 0 && items.data?.find((it) => it.sku === sku)?.category === c) ? " ●" : ""}
          </button>
        ))}
      </div>
      <div className="t-table-wrap">
        <table className="t-table">
          <thead>
            <tr>
              <th>No</th>
              <th>コード</th>
              <th>品名</th>
              <th className="t-num">売価</th>
              <th className="t-num">単位</th>
              <th className="t-num">在庫</th>
              <th className="t-num">残見込</th>
              {days.map((d) => (
                <th key={d} className="t-num" title={d}>
                  {Number(d.slice(8))}
                  <br />
                  <span className="t-mini" style={{ color: "#fff" }}>{weekday(d)}</span>
                </th>
              ))}
              <th className="t-num">7日平均</th>
              <th className="t-num">廃棄率</th>
              <th className="t-num">欠品</th>
              <th>状態</th>
              <th className="t-num">発注数</th>
              <th className="t-num">金額</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item, i) => {
              const inv = invMap.get(item.sku)
              const tr = trendMap.get(item.sku)
              const ord = orderability(item, inv, slot, now)
              const raw = current[item.sku] ?? ""
              const n = Number(raw || 0)
              const err = raw ? qtyError(n, item.minLot) : null
              return (
                <tr key={item.sku} className={focusSku === item.sku ? "t-selected" : undefined}>
                  <td className="t-num">{i + 1}</td>
                  <td>{item.sku}</td>
                  <td>{item.name}</td>
                  <td className="t-num">{item.price}</td>
                  <td className="t-num">{item.minLot}</td>
                  <td className={`t-num${inv && inv.expectedRest > inv.stock ? " t-up" : ""}`}>{inv?.stock ?? "―"}</td>
                  <td className="t-num">{inv ? inv.expectedRest.toFixed(1) : "―"}</td>
                  {days.map((d) => (
                    <td key={d} className="t-num">{salesBy.get(`${item.sku}|${d}`) ?? "―"}</td>
                  ))}
                  <td className="t-num">{tr ? tr.avg7.toFixed(1) : "―"}</td>
                  <td className={`t-num${tr && tr.wasteRate14 >= 30 ? " t-up" : ""}`}>{tr ? `${tr.wasteRate14.toFixed(0)}%` : "―"}</td>
                  <td className={`t-num${tr && tr.stockoutDays14 >= 5 ? " t-up" : ""}`}>{tr ? `${tr.stockoutDays14}日` : "―"}</td>
                  <td className="t-center">
                    {ord.ok ? <span className="t-tag t-tag-ok">〜{ord.cutoff}</span> : <span className="t-tag t-tag-ng">{ord.reason}</span>}
                  </td>
                  <td className="t-num">
                    <input
                      ref={(el) => {
                        if (el) inputs.current.set(item.sku, el)
                        else inputs.current.delete(item.sku)
                      }}
                      className={`t-input${err ? " t-invalid" : ""}`}
                      inputMode="numeric"
                      aria-label={`${item.name} の発注数`}
                      value={raw}
                      disabled={!ord.ok}
                      onChange={(e) => setRowQty(item.sku, e.target.value.replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0)))}
                      onFocus={(e) => {
                        setFocusSku(item.sku)
                        e.currentTarget.select()
                      }}
                      onBlur={() => validateRow(item)}
                      onKeyDown={(e) => onInputKey(e, item)}
                    />
                  </td>
                  <td className="t-num">{n > 0 ? yen(n * item.price) : ""}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="t-mini">
        数字は過去 7 日の日別販売数。在庫が赤は本日残りの見込みより少ない、廃棄率・欠品が赤は直近 14 日で多い品目。残見込は直近 4 週の同じ曜日の平均（天気・催事は入っていません）。
      </p>

      {pending && pending.kind !== "send" && (
        <TerminalDialog
          title={pending.kind === "leave" ? "入力の破棄" : "全クリア"}
          icon="w"
          onClose={() => setPending(null)}
          actions={[
            {
              label: "はい(Y)",
              primary: true,
              onClick: () => {
                setQty({ evening: {}, morning: {} })
                const to = pending.to
                setPending(null)
                if (pending.kind === "leave" && to) navigate(to)
                else setMessage("入力した発注数をすべて消しました。")
              },
            },
            { label: "いいえ(N)", onClick: () => setPending(null) },
          ]}
        >
          <p>{pending.kind === "leave" ? "送信していない発注数があります。破棄して移動しますか？" : "入力した発注数（両方の便）をすべて消しますか？"}</p>
        </TerminalDialog>
      )}
    </>
  )
}
