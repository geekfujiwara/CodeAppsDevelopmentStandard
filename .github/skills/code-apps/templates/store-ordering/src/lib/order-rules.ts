import type { Inventory, Item, Order } from "@/lib/store-api"

// 発注のルール（Cowork の order-execute スキルと同じ）。Dataverse 側では止まらないので画面で守る。
export type SlotKey = "evening" | "morning"

export const MAX_QTY = 200
const MORNING_CUTOFF_FRESH = "21:00"
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"]

export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + n))
  return dt.toISOString().slice(0, 10)
}

export function weekday(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number)
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
}

/** 2026-10-30 → 2026/10/30(金) */
export function fmtDate(iso: string): string {
  if (!iso) return ""
  return `${iso.replace(/-/g, "/")}(${weekday(iso)})`
}

/** 2026-10-30 → 10/30(金) */
export function fmtShort(iso: string): string {
  if (!iso) return ""
  const [, m, d] = iso.split("-").map(Number)
  return `${m}/${d}(${weekday(iso)})`
}

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number)
  return h * 60 + (m || 0)
}

export function yen(n: number): string {
  return `¥${Math.round(n).toLocaleString("ja-JP")}`
}

export interface SlotInfo {
  key: SlotKey
  label: "夕方便" | "朝便"
  deliveryDate: string
  deliveryTime: string
}

export function slotInfo(key: SlotKey, businessDate: string): SlotInfo {
  return key === "evening"
    ? { key, label: "夕方便", deliveryDate: businessDate, deliveryTime: "16:00" }
    : { key, label: "朝便", deliveryDate: addDays(businessDate, 1), deliveryTime: "06:00" }
}

/** その便の締め時刻（今日の時刻）。発注できない品目は null */
export function cutoffFor(item: Item, inv: Inventory | undefined, slot: SlotKey): string | null {
  if (slot === "evening") {
    if (item.leadTimeDays > 0 || inv?.eveningOrder === false) return null
    return item.orderCutoff || "10:00"
  }
  if (item.leadTimeDays > 1) return null
  return item.leadTimeDays === 0 ? MORNING_CUTOFF_FRESH : item.orderCutoff || "11:00"
}

export type Orderability = { ok: true; cutoff: string } | { ok: false; reason: string; cutoff: string | null }

export function orderability(item: Item, inv: Inventory | undefined, slot: SlotKey, now: string): Orderability {
  const cutoff = cutoffFor(item, inv, slot)
  if (!cutoff) return { ok: false, reason: slot === "evening" ? "夕方便不可" : "不可", cutoff: null }
  if (toMinutes(now) >= toMinutes(cutoff)) return { ok: false, reason: "締切済", cutoff }
  return { ok: true, cutoff }
}

/** 数量の検査。問題なければ null、あれば日本語の理由 */
export function qtyError(qty: number, minLot: number): string | null {
  if (!Number.isInteger(qty) || qty < 0) return "数量は 0 以上の整数で入力してください。"
  if (qty === 0) return null
  if (qty > MAX_QTY) return `1 品目 ${MAX_QTY} 個までです。`
  if (qty % minLot !== 0) {
    const lower = Math.floor(qty / minLot) * minLot
    return `発注単位は ${minLot} 個です（${lower > 0 ? `${lower} または ` : ""}${lower + minLot}）。`
  }
  return null
}

export function remaining(now: string, cutoff: string): string {
  const diff = toMinutes(cutoff) - toMinutes(now)
  if (diff <= 0) return "締切済"
  return `あと ${Math.floor(diff / 60)}:${String(diff % 60).padStart(2, "0")}`
}

/** 発注番号 PO-<納品日>-<便>-<連番2桁>（Cowork と同じ） */
export function nextOrderNo(orders: Order[], deliveryDate: string, slot: string): string {
  const prefix = `PO-${deliveryDate.replace(/-/g, "")}-${slot}-`
  const used = orders.filter((o) => o.no.startsWith(prefix)).map((o) => Number(o.no.slice(prefix.length)) || 0)
  const next = (used.length ? Math.max(...used) : 0) + 1
  return `${prefix}${String(next).padStart(2, "0")}`
}

export interface OrderLine {
  sku: string
  name: string
  qty: number
}

/** 明細の本文「O01 鮭おにぎり ×8」を行に分ける */
export function parseLines(text: string): OrderLine[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const m = /^(\S+)\s+(.+?)\s*[×x*]\s*(\d+)\s*$/.exec(l)
      return m ? { sku: m[1], name: m[2], qty: Number(m[3]) } : { sku: "", name: l, qty: 0 }
    })
}

export function formatLines(lines: OrderLine[]): string {
  return lines.map((l) => `${l.sku} ${l.name} ×${l.qty}`).join("\n")
}

/** 発注の締め時刻（明細の品目のうち最も早いもの）。取消できるかの判定に使う */
export function orderCutoff(order: Order, items: Item[], inventory: Inventory[], businessDate: string): string | null {
  const slot: SlotKey = order.slot === "夕方便" ? "evening" : "morning"
  if (order.deliveryDate !== slotInfo(slot, businessDate).deliveryDate) return null
  const times = parseLines(order.lines)
    .map((l) => items.find((i) => i.sku === l.sku))
    .filter((i): i is Item => Boolean(i))
    .map((i) => cutoffFor(i, inventory.find((v) => v.sku === i.sku), slot))
    .filter((t): t is string => Boolean(t))
    .sort()
  return times[0] ?? null
}

/** 照会画面の状態（保存されている状態と、締め時刻・納品時刻からの読み替え） */
export function displayStatus(order: Order, cutoff: string | null, now: string, businessDate: string): string {
  if (order.status === "取消") return "取消"
  if (order.deliveryDate < businessDate) return "納品済"
  const slot: SlotKey = order.slot === "夕方便" ? "evening" : "morning"
  const info = slotInfo(slot, businessDate)
  if (order.deliveryDate === businessDate && toMinutes(now) >= toMinutes(info.deliveryTime)) return "納品済"
  if (cutoff && toMinutes(now) >= toMinutes(cutoff)) return "確定"
  return order.status || "受付済"
}

/** 数値を文字の棒にする（■ 1 個 = unit） */
export function textBar(value: number, unit: number, max = 30): string {
  if (value <= 0) return ""
  return "■".repeat(Math.min(max, Math.max(1, Math.round(value / unit))))
}
