// 開発時だけ使う模擬データ（VITE_USE_MOCK=1 かつ vite dev）。本番の成果物には入らない。
// 元データは demo-data/export/<scenario>.json（npm run mock で src/mock/mock-data.json を作る）
import type { Daily, Inventory, Item, NewOrder, Order, Setting, StoreEvent, Trend, Weather } from "@/lib/store-api"

type Row = Record<string, unknown>
type MockData = { setting: Row; items: Row[]; inventory: Row[]; trends: Row[]; daily: Row[]; weather: Row[]; events: Row[] }

const files = import.meta.glob<MockData>("../mock/mock-data.json", { import: "default" })
let cache: MockData | undefined
const orders: Order[] = []

async function data(): Promise<MockData> {
  if (cache) return cache
  const loader = files["../mock/mock-data.json"]
  if (!loader) throw new Error("src/mock/mock-data.json がありません（node scripts/build-mock.mjs を実行）")
  cache = await loader()
  return cache
}

const s = (r: Row, k: string) => (r[k] == null ? "" : String(r[k]))
const n = (r: Row, k: string) => (r[k] == null ? null : Number(r[k]))

export async function mockSetting(): Promise<Setting> {
  const r = (await data()).setting
  return {
    id: "mock",
    businessDate: s(r, "businessdate"),
    demoTime: s(r, "demotime"),
    storeName: s(r, "storename"),
    storeArea: s(r, "storearea"),
    scenario: s(r, "scenario"),
    scenarioTitle: s(r, "scenariotitle"),
  }
}

export async function mockItems(): Promise<Item[]> {
  return (await data()).items.map((r) => ({
    sku: s(r, "sku"),
    name: s(r, "name"),
    category: s(r, "category"),
    price: n(r, "price") ?? 0,
    itemType: s(r, "itemtype"),
    orderCutoff: s(r, "ordercutoff"),
    leadTimeDays: n(r, "leadtimedays") ?? 0,
    minLot: n(r, "minlot") ?? 1,
  }))
}

export async function mockInventory(): Promise<Inventory[]> {
  return (await data()).inventory.map((r) => ({
    sku: s(r, "sku"),
    stock: n(r, "stock") ?? 0,
    soldToday: n(r, "soldtoday") ?? 0,
    expectedRest: n(r, "expectedrest") ?? 0,
    balance: n(r, "balance") ?? 0,
    status: s(r, "status"),
    eveningOrder: s(r, "eveningorder").startsWith("可"),
  }))
}

export async function mockTrends(): Promise<Trend[]> {
  return (await data()).trends.map((r) => ({
    sku: s(r, "sku"),
    avg7: n(r, "avg7") ?? 0,
    weekRatio: s(r, "weekratio"),
    waste14: n(r, "waste14") ?? 0,
    wasteRate14: n(r, "wasterate14") ?? 0,
    wasteStreak: n(r, "wastestreak") ?? 0,
    stockoutDays14: n(r, "stockoutdays14") ?? 0,
    soldOutHour: n(r, "soldouthour"),
    lost14: n(r, "lost14") ?? 0,
    peakHours: s(r, "peakhours"),
    rainAvg: n(r, "rainavg"),
    dryAvg: n(r, "dryavg"),
    eventAvg: n(r, "eventavg"),
  }))
}

export async function mockDaily(from: string, sku?: string): Promise<Daily[]> {
  return (await data()).daily
    .filter((r) => s(r, "date") >= from && (!sku || s(r, "sku") === sku))
    .map((r) => ({
      sku: s(r, "sku"),
      date: s(r, "date"),
      weekday: s(r, "weekday"),
      weather: s(r, "weather"),
      tempMax: n(r, "tempmax"),
      salesQty: n(r, "salesqty") ?? 0,
      wasteQty: n(r, "wasteqty") ?? 0,
      soldOutHour: n(r, "soldouthour"),
      deliveryMorning: n(r, "deliverymorning") ?? 0,
      deliveryEvening: n(r, "deliveryevening") ?? 0,
    }))
}

export async function mockWeather(from: string): Promise<Weather[]> {
  return (await data()).weather
    .filter((r) => s(r, "date") >= from)
    .map((r) => ({
      date: s(r, "date"),
      condition: s(r, "condition"),
      tempMax: n(r, "tempmax"),
      tempMin: n(r, "tempmin"),
      precipProb: n(r, "precipprob"),
      kind: s(r, "kind"),
      tempDiff: n(r, "tempdiff"),
      prevCondition: s(r, "prevcondition"),
    }))
}

export async function mockEvents(from: string): Promise<StoreEvent[]> {
  return (await data()).events
    .filter((r) => s(r, "date") >= from)
    .map((r) => ({
      name: s(r, "name"),
      date: s(r, "date"),
      start: s(r, "starttime"),
      end: s(r, "endtime"),
      venue: s(r, "venue"),
      scale: n(r, "scale") ?? 0,
      distanceM: n(r, "distancem") ?? 0,
    }))
}

export async function mockOrders(): Promise<Order[]> {
  return [...orders]
}

export async function mockCreateOrder(o: NewOrder): Promise<void> {
  orders.unshift({ ...o, id: `mock-${orders.length + 1}`, status: "受付済", createdOn: new Date().toISOString() })
}

export async function mockUpdateOrderStatus(id: string, status: string): Promise<void> {
  const o = orders.find((x) => x.id === id)
  if (o) o.status = status
}
