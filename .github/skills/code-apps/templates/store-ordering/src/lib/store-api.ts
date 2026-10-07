import { createRecord, listRecords, updateRecord, type DataverseRow } from "@/lib/dataverse-client"
import { PUBLISHER_PREFIX, TABLE_PREFIX } from "@/config"

// テンプレートの置換（${UPPER}）と区別するため小文字の別名で使う
const pfx = PUBLISHER_PREFIX

// Dataverse のテーブル（dataverse/schema.json。scripts/dataverse/setup_dataverse.py が作る）。
// 各関数の先頭の分岐は開発時の模擬データ（vite dev かつ VITE_USE_MOCK=1）。本番ビルドでは消える。
// データソース追加前でもビルドできる遅延版クライアント（dataverse-client.ts）への薄い窓口
const DataverseService = {
  ListRecords: (entitySet: string, select: string[], filter?: string) => listRecords(entitySet, { select, filter }),
  CreateRecord: (entitySet: string, body: DataverseRow) => createRecord(entitySet, body),
  UpdateRecord: (entitySet: string, id: string, body: DataverseRow) => updateRecord(entitySet, id, body),
}

const ENTITY = {
  setting: `${TABLE_PREFIX}settings`,
  item: `${TABLE_PREFIX}items`,
  inventory: `${TABLE_PREFIX}inventories`,
  trend: `${TABLE_PREFIX}trends`,
  daily: `${TABLE_PREFIX}dailies`,
  weather: `${TABLE_PREFIX}weathers`,
  event: `${TABLE_PREFIX}events`,
  order: `${TABLE_PREFIX}orders`,
} as const

const c = (name: string) => `${pfx}_${name}`
const str = (r: DataverseRow, name: string) => (r[c(name)] == null ? "" : String(r[c(name)]))
const num = (r: DataverseRow, name: string) => (r[c(name)] == null ? null : Number(r[c(name)]))
const int = (r: DataverseRow, name: string) => num(r, name) ?? 0
const day = (r: DataverseRow, name: string) => str(r, name).slice(0, 10)
const sel = (...names: string[]) => names.map(c)

export interface Setting {
  id: string
  businessDate: string
  demoTime: string
  storeName: string
  storeArea: string
  scenario: string
  scenarioTitle: string
}

export interface Item {
  sku: string
  name: string
  category: string
  price: number
  itemType: string
  orderCutoff: string
  leadTimeDays: number
  minLot: number
}

export interface Inventory {
  sku: string
  stock: number
  soldToday: number
  expectedRest: number
  balance: number
  status: string
  eveningOrder: boolean
}

export interface Trend {
  sku: string
  avg7: number
  weekRatio: string
  waste14: number
  wasteRate14: number
  wasteStreak: number
  stockoutDays14: number
  soldOutHour: number | null
  lost14: number
  peakHours: string
  rainAvg: number | null
  dryAvg: number | null
  eventAvg: number | null
}

export interface Daily {
  sku: string
  date: string
  weekday: string
  weather: string
  tempMax: number | null
  salesQty: number
  wasteQty: number
  soldOutHour: number | null
  deliveryMorning: number
  deliveryEvening: number
}

export interface Weather {
  date: string
  condition: string
  tempMax: number | null
  tempMin: number | null
  precipProb: number | null
  kind: string
  tempDiff: number | null
  prevCondition: string
}

export interface StoreEvent {
  name: string
  date: string
  start: string
  end: string
  venue: string
  scale: number
  distanceM: number
}

export interface Order {
  id: string
  no: string
  deliveryDate: string
  slot: string
  lines: string
  itemCount: number
  totalQty: number
  totalAmount: number
  reason: string
  status: string
  source: string
  createdOn: string
}

export async function fetchSetting(): Promise<Setting> {
  if (import.meta.env.DEV && import.meta.env.VITE_USE_MOCK === "1") return (await import("@/lib/mock-store")).mockSetting()
  const rows = await DataverseService.ListRecords(
    ENTITY.setting,
    [...sel("businessdate", "demotime", "storename", "storearea", "scenario", "scenariotitle"), `${pfx}_tksettingid`],
  )
  const r = rows[0]
  if (!r) throw new Error("デモ設定が 1 件もありません（demo_data.py load を実行してください）。")
  return {
    id: String(r[`${pfx}_tksettingid`] ?? ""),
    businessDate: day(r, "businessdate"),
    demoTime: str(r, "demotime") || "08:30",
    storeName: str(r, "storename"),
    storeArea: str(r, "storearea"),
    scenario: str(r, "scenario"),
    scenarioTitle: str(r, "scenariotitle"),
  }
}

export async function fetchItems(): Promise<Item[]> {
  if (import.meta.env.DEV && import.meta.env.VITE_USE_MOCK === "1") return (await import("@/lib/mock-store")).mockItems()
  const rows = await DataverseService.ListRecords(
    ENTITY.item,
    sel("sku", "name", "category", "price", "itemtype", "ordercutoff", "leadtimedays", "minlot"),
  )
  return rows
    .map((r) => ({
      sku: str(r, "sku"),
      name: str(r, "name"),
      category: str(r, "category"),
      price: int(r, "price"),
      itemType: str(r, "itemtype"),
      orderCutoff: str(r, "ordercutoff"),
      leadTimeDays: int(r, "leadtimedays"),
      minLot: Math.max(1, int(r, "minlot")),
    }))
    .sort((a, b) => a.sku.localeCompare(b.sku))
}

export async function fetchInventory(): Promise<Inventory[]> {
  if (import.meta.env.DEV && import.meta.env.VITE_USE_MOCK === "1") return (await import("@/lib/mock-store")).mockInventory()
  const rows = await DataverseService.ListRecords(
    ENTITY.inventory,
    sel("sku", "stock", "soldtoday", "expectedrest", "balance", "status", "eveningorder"),
  )
  return rows.map((r) => ({
    sku: str(r, "sku"),
    stock: int(r, "stock"),
    soldToday: int(r, "soldtoday"),
    expectedRest: num(r, "expectedrest") ?? 0,
    balance: num(r, "balance") ?? 0,
    status: str(r, "status"),
    eveningOrder: str(r, "eveningorder").startsWith("可"),
  }))
}

export async function fetchTrends(): Promise<Trend[]> {
  if (import.meta.env.DEV && import.meta.env.VITE_USE_MOCK === "1") return (await import("@/lib/mock-store")).mockTrends()
  const rows = await DataverseService.ListRecords(
    ENTITY.trend,
    sel("sku", "avg7", "weekratio", "waste14", "wasterate14", "wastestreak", "stockoutdays14", "soldouthour", "lost14", "peakhours", "rainavg", "dryavg", "eventavg"),
  )
  return rows.map((r) => ({
    sku: str(r, "sku"),
    avg7: num(r, "avg7") ?? 0,
    weekRatio: str(r, "weekratio"),
    waste14: int(r, "waste14"),
    wasteRate14: num(r, "wasterate14") ?? 0,
    wasteStreak: int(r, "wastestreak"),
    stockoutDays14: int(r, "stockoutdays14"),
    soldOutHour: num(r, "soldouthour"),
    lost14: int(r, "lost14"),
    peakHours: str(r, "peakhours"),
    rainAvg: num(r, "rainavg"),
    dryAvg: num(r, "dryavg"),
    eventAvg: num(r, "eventavg"),
  }))
}

/** from 以降（from を含む）の単品日次実績。sku を指定するとその品目だけ */
export async function fetchDaily(from: string, sku?: string): Promise<Daily[]> {
  if (import.meta.env.DEV && import.meta.env.VITE_USE_MOCK === "1") return (await import("@/lib/mock-store")).mockDaily(from, sku)
  const filter = [`${c("date")} ge ${from}`, sku ? `${c("sku")} eq '${sku.replace(/'/g, "''")}'` : ""].filter(Boolean).join(" and ")
  const rows = await DataverseService.ListRecords(
    ENTITY.daily,
    sel("sku", "date", "weekday", "weather", "tempmax", "salesqty", "wasteqty", "soldouthour", "deliverymorning", "deliveryevening"),
    filter,
  )
  return rows
    .map((r) => ({
      sku: str(r, "sku"),
      date: day(r, "date"),
      weekday: str(r, "weekday"),
      weather: str(r, "weather"),
      tempMax: num(r, "tempmax"),
      salesQty: int(r, "salesqty"),
      wasteQty: int(r, "wasteqty"),
      soldOutHour: num(r, "soldouthour"),
      deliveryMorning: int(r, "deliverymorning"),
      deliveryEvening: int(r, "deliveryevening"),
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.sku.localeCompare(b.sku))
}

export async function fetchWeather(from: string): Promise<Weather[]> {
  if (import.meta.env.DEV && import.meta.env.VITE_USE_MOCK === "1") return (await import("@/lib/mock-store")).mockWeather(from)
  const rows = await DataverseService.ListRecords(
    ENTITY.weather,
    sel("date", "condition", "tempmax", "tempmin", "precipprob", "kind", "tempdiff", "prevcondition"),
    `${c("date")} ge ${from}`,
  )
  return rows
    .map((r) => ({
      date: day(r, "date"),
      condition: str(r, "condition"),
      tempMax: num(r, "tempmax"),
      tempMin: num(r, "tempmin"),
      precipProb: num(r, "precipprob"),
      kind: str(r, "kind"),
      tempDiff: num(r, "tempdiff"),
      prevCondition: str(r, "prevcondition"),
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

export async function fetchEvents(from: string): Promise<StoreEvent[]> {
  if (import.meta.env.DEV && import.meta.env.VITE_USE_MOCK === "1") return (await import("@/lib/mock-store")).mockEvents(from)
  const rows = await DataverseService.ListRecords(
    ENTITY.event,
    sel("name", "date", "starttime", "endtime", "venue", "scale", "distancem"),
    `${c("date")} ge ${from}`,
  )
  return rows
    .map((r) => ({
      name: str(r, "name"),
      date: day(r, "date"),
      start: str(r, "starttime"),
      end: str(r, "endtime"),
      venue: str(r, "venue"),
      scale: int(r, "scale"),
      distanceM: int(r, "distancem"),
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start))
}

export async function fetchOrders(): Promise<Order[]> {
  if (import.meta.env.DEV && import.meta.env.VITE_USE_MOCK === "1") return (await import("@/lib/mock-store")).mockOrders()
  const rows = await DataverseService.ListRecords(ENTITY.order, [
    ...sel("name", "deliverydate", "deliveryslot", "lines", "itemcount", "totalqty", "totalamount", "reason", "status", "source"),
    `${pfx}_tkorderid`,
    "createdon",
  ])
  return rows
    .map((r) => ({
      id: String(r[`${pfx}_tkorderid`] ?? ""),
      no: str(r, "name"),
      deliveryDate: day(r, "deliverydate"),
      slot: str(r, "deliveryslot"),
      lines: str(r, "lines"),
      itemCount: int(r, "itemcount"),
      totalQty: int(r, "totalqty"),
      totalAmount: int(r, "totalamount"),
      reason: str(r, "reason"),
      status: str(r, "status"),
      source: str(r, "source"),
      createdOn: String(r.createdon ?? ""),
    }))
    .sort((a, b) => b.no.localeCompare(a.no))
}

export interface NewOrder {
  no: string
  deliveryDate: string
  slot: string
  lines: string
  itemCount: number
  totalQty: number
  totalAmount: number
  reason: string
  source: string
}

/** Cowork（order-execute スキル）と同じ形式で発注を 1 行登録する */
export async function createOrder(o: NewOrder): Promise<void> {
  if (import.meta.env.DEV && import.meta.env.VITE_USE_MOCK === "1") return (await import("@/lib/mock-store")).mockCreateOrder(o)
  try {
    await createOrderRecord(o)
  } catch (err) {
    throw explainPrivilege(err, "発注の登録")
  }
}

async function createOrderRecord(o: NewOrder): Promise<void> {
  await DataverseService.CreateRecord(ENTITY.order, {
    [c("name")]: o.no,
    [c("deliverydate")]: o.deliveryDate,
    [c("deliveryslot")]: o.slot,
    [c("lines")]: o.lines,
    [c("itemcount")]: o.itemCount,
    [c("totalqty")]: o.totalQty,
    [c("totalamount")]: o.totalAmount,
    [c("reason")]: o.reason,
    [c("status")]: "受付済",
    [c("source")]: o.source,
  })
}

export async function updateOrderStatus(id: string, status: string): Promise<void> {
  if (import.meta.env.DEV && import.meta.env.VITE_USE_MOCK === "1") return (await import("@/lib/mock-store")).mockUpdateOrderStatus(id, status)
  try {
    await DataverseService.UpdateRecord(ENTITY.order, id, { [c("status")]: status })
  } catch (err) {
    throw explainPrivilege(err, "発注の更新（取消）")
  }
}

/** 権限不足は利用者が対処できる文に置き換える（デモ利用者ロールは発注の作成だけで、更新できない） */
function explainPrivilege(err: unknown, what: string): Error {
  const msg = err instanceof Error ? err.message : String(err)
  if (/privilege|prv(Create|Write|Read)|0x80040220|0x80042f09|403/i.test(msg)) {
    return new Error(`${what}の権限がありません。管理者に、発注テーブルの${what.includes("取消") ? "書き込み" : "作成"}権限を依頼してください。`)
  }
  return err instanceof Error ? err : new Error(msg)
}
