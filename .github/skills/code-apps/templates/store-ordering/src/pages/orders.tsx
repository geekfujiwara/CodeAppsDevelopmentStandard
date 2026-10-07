import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import { TerminalDialog } from "@/components/terminal/terminal-dialog"
import { useFunctionKeys, useMessage } from "@/components/terminal/terminal-context"
import { useInventory, useItems, useOrders, useSetting } from "@/lib/queries"
import { updateOrderStatus } from "@/lib/store-api"
import { displayStatus, fmtShort, orderCutoff, parseLines, yen } from "@/lib/order-rules"

export default function OrderList() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const setMessage = useMessage()
  const setting = useSetting()
  const items = useItems()
  const inventory = useInventory()
  const orders = useOrders()
  const [selected, setSelected] = useState(0)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [busy, setBusy] = useState(false)

  const today = setting.data?.businessDate ?? ""
  const now = setting.data?.demoTime ?? "00:00"
  const rows = useMemo(() => {
    return (orders.data ?? [])
      .filter((o) => o.deliveryDate >= today)
      .map((o) => {
        const cutoff = orderCutoff(o, items.data ?? [], inventory.data ?? [], today)
        const state = displayStatus(o, cutoff, now, today)
        return { order: o, cutoff, state, cancellable: state === "受付済" }
      })
  }, [orders.data, items.data, inventory.data, today, now])
  const current = rows[Math.min(selected, Math.max(rows.length - 1, 0))]

  useEffect(() => {
    if (!orders.isLoading) setMessage(rows.length ? `本日以降の発注 ${rows.length} 件。↑↓ で選んで明細を表示。F8 で取消。` : "本日以降の発注はありません。")
  }, [orders.isLoading, rows.length, setMessage])

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

  const cancel = async () => {
    if (!current) return
    setBusy(true)
    try {
      await updateOrderStatus(current.order.id, "取消")
      await queryClient.invalidateQueries({ queryKey: ["orders"] })
      setMessage(`${current.order.no} を取り消しました。`)
    } catch (err) {
      setMessage(`取消できませんでした: ${err instanceof Error ? err.message : String(err)}`, "error")
    } finally {
      setBusy(false)
      setConfirmCancel(false)
    }
  }

  useFunctionKeys([
    { key: 1, label: "メニュー", action: () => navigate("/menu") },
    { key: 2, label: "戻る", action: () => navigate("/menu") },
    {
      key: 5,
      label: "再表示",
      action: () => {
        void queryClient.invalidateQueries({ queryKey: ["orders"] })
        setMessage("発注を読み直しました。")
      },
    },
    { key: 6, label: "単品発注", action: () => navigate("/order") },
    {
      key: 8,
      label: "取消",
      disabled: !current || !current.cancellable,
      action: () => setConfirmCancel(true),
    },
  ])

  if (orders.isLoading || setting.isLoading) return <div className="t-loading">発注を読み込み中…</div>

  return (
    <>
      <fieldset className="t-panel">
        <legend>発注一覧（本日以降の納品）</legend>
        <div className="t-table-wrap" style={{ maxHeight: 280 }}>
          <table className="t-table">
            <thead>
              <tr>
                <th>No</th><th>発注番号</th><th>便</th><th>納品日</th><th className="t-num">品目</th><th className="t-num">数量</th><th className="t-num">金額</th><th>状態</th><th>締め</th><th>登録元</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.order.id} className={`t-clickable${i === selected ? " t-selected" : ""}`} onClick={() => setSelected(i)}>
                  <td className="t-num">{i + 1}</td>
                  <td>{r.order.no}</td>
                  <td>{r.order.slot}</td>
                  <td>{fmtShort(r.order.deliveryDate)}</td>
                  <td className="t-num">{r.order.itemCount}</td>
                  <td className="t-num">{r.order.totalQty}</td>
                  <td className="t-num">{yen(r.order.totalAmount)}</td>
                  <td>
                    <span className={`t-tag ${r.state === "取消" ? "t-tag-ng" : r.state === "受付済" ? "t-tag-ok" : "t-tag-warn"}`}>{r.state}</span>
                  </td>
                  <td>{r.cutoff ?? "―"}</td>
                  <td>{r.order.source || "―"}</td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={10} className="t-center">該当する発注はありません</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </fieldset>

      {current && (
        <fieldset className="t-panel">
          <legend>明細 — {current.order.no}</legend>
          <div className="t-row" style={{ marginBottom: 6 }}>
            <span className="t-field"><b>理由・メモ</b><span>{current.order.reason || "―"}</span></span>
          </div>
          <div className="t-table-wrap" style={{ maxHeight: 240 }}>
            <table className="t-table">
              <thead>
                <tr>
                  <th>No</th><th>コード</th><th>品名</th><th className="t-num">数量</th><th className="t-num">売価</th><th className="t-num">金額</th>
                </tr>
              </thead>
              <tbody>
                {parseLines(current.order.lines).map((l, i) => {
                  const price = items.data?.find((it) => it.sku === l.sku)?.price ?? 0
                  return (
                    <tr key={`${l.sku}-${i}`}>
                      <td className="t-num">{i + 1}</td>
                      <td>{l.sku}</td>
                      <td>{l.name}</td>
                      <td className="t-num">{l.qty}</td>
                      <td className="t-num">{price ? yen(price) : "―"}</td>
                      <td className="t-num">{price ? yen(price * l.qty) : "―"}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </fieldset>
      )}

      {confirmCancel && current && (
        <TerminalDialog
          title="発注取消"
          icon="w"
          onClose={() => setConfirmCancel(false)}
          actions={[
            { label: busy ? "処理中…" : "はい(Y)", onClick: () => void cancel(), primary: true, disabled: busy },
            { label: "いいえ(N)", onClick: () => setConfirmCancel(false), disabled: busy },
          ]}
        >
          <p>
            {current.order.no}（{current.order.slot}・{current.order.itemCount} 品目・{current.order.totalQty} 個）を取り消しますか？
          </p>
          <p className="t-mini">取り消した発注は照会に「取消」として残ります。</p>
        </TerminalDialog>
      )}
    </>
  )
}
