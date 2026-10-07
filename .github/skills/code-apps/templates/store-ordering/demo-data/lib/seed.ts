import { DatabaseSync } from 'node:sqlite';
import { ITEMS, hourShare, isDailyFresh, type Item } from './catalog.ts';
import { addDays, dateRange, dayOfWeek, diffDays, timeToMinutes } from './dates.ts';
import type { EventDef, Scenario, WeatherDay } from './scenario.ts';

export const STORE = {
  store_id: 'S0001',
  name: 'デモ店 品川港南口店',
  area: '東京都港区港南（架空の店舗）',
  open_hours: '24 時間',
};

export const HISTORY_START = '2026-08-01';
export const HISTORY_END = '2026-10-29';
export const FORECAST_DAYS = 7;
const SEED = 20261030;

/** 癖を仕込んだ品目 */
export const HABIT = {
  wasteDessert: 'D02',
  wasteDessertFixedFrom: '2026-10-16',
  wasteDessertFixedQty: 7,
  stockoutBento: 'B01',
  stockoutBentoCap: 11,
  umbrella: 'U01',
} as const;

export const SCHEMA = `
CREATE TABLE store (store_id TEXT PRIMARY KEY, name TEXT NOT NULL, area TEXT NOT NULL, open_hours TEXT NOT NULL);
CREATE TABLE item (
  sku TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL, price INTEGER NOT NULL,
  shelf_life_hours INTEGER NOT NULL, order_cutoff TEXT NOT NULL, lead_time_days INTEGER NOT NULL, min_lot INTEGER NOT NULL
);
CREATE TABLE sales_hourly (date TEXT NOT NULL, hour INTEGER NOT NULL, sku TEXT NOT NULL, qty INTEGER NOT NULL, PRIMARY KEY (date, hour, sku));
CREATE TABLE inventory (as_of TEXT NOT NULL, sku TEXT NOT NULL, qty INTEGER NOT NULL, PRIMARY KEY (as_of, sku));
CREATE TABLE waste (date TEXT NOT NULL, sku TEXT NOT NULL, qty INTEGER NOT NULL, reason TEXT NOT NULL, PRIMARY KEY (date, sku));
CREATE TABLE stockout (date TEXT NOT NULL, sku TEXT NOT NULL, first_hour INTEGER NOT NULL, lost_qty INTEGER NOT NULL, PRIMARY KEY (date, sku));
CREATE TABLE orders (
  order_id TEXT NOT NULL, created_at TEXT NOT NULL, sku TEXT NOT NULL, qty INTEGER NOT NULL, status TEXT NOT NULL,
  created_by TEXT NOT NULL, delivery_date TEXT NOT NULL, delivery_time TEXT NOT NULL, reason TEXT, source TEXT NOT NULL,
  PRIMARY KEY (order_id, sku)
);
CREATE TABLE weather (date TEXT PRIMARY KEY, condition TEXT NOT NULL, temp_max REAL NOT NULL, temp_min REAL NOT NULL, precip_prob INTEGER NOT NULL, is_forecast INTEGER NOT NULL);
CREATE TABLE event (date TEXT NOT NULL, start TEXT NOT NULL, "end" TEXT NOT NULL, venue TEXT NOT NULL, name TEXT NOT NULL, scale INTEGER NOT NULL, distance_m INTEGER NOT NULL);
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE INDEX ix_sales_sku_date ON sales_hourly (sku, date);
CREATE INDEX ix_orders_delivery ON orders (delivery_date, sku);
`;

/** 過去 90 日の周辺イベント（架空） */
export const PAST_EVENTS: EventDef[] = [
  { date: '2026-08-08', start: '16:00', end: '21:00', venue: '品川運河沿い緑地', name: '運河 夏まつり', scale: 8000, distance_m: 600 },
  { date: '2026-08-21', start: '18:00', end: '21:00', venue: '港南ホール', name: 'サマーライブ', scale: 5000, distance_m: 350 },
  { date: '2026-09-04', start: '17:30', end: '20:30', venue: '港南ホール', name: 'アイドルライブ', scale: 5000, distance_m: 350 },
  { date: '2026-09-12', start: '10:00', end: '16:00', venue: '港南第一高校', name: '文化祭', scale: 2000, distance_m: 800 },
  { date: '2026-09-25', start: '18:00', end: '21:00', venue: '港南ホール', name: 'ロックコンサート', scale: 5000, distance_m: 350 },
  { date: '2026-10-03', start: '11:00', end: '17:00', venue: '港南シーサイド広場', name: '秋のマルシェ', scale: 1500, distance_m: 500 },
  { date: '2026-10-09', start: '18:00', end: '21:00', venue: '港南ホール', name: '秋のライブ', scale: 5000, distance_m: 350 },
  { date: '2026-10-17', start: '09:00', end: '16:00', venue: '港南運動公園', name: '区民スポーツ大会', scale: 3000, distance_m: 900 },
  { date: '2026-10-23', start: '17:30', end: '20:30', venue: '港南ホール', name: 'ピアノリサイタル', scale: 3000, distance_m: 350 },
];

type Rng = () => number;

function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(r: Rng): number {
  const u = Math.max(r(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}

function poisson(r: Rng, lambda: number): number {
  if (lambda <= 0) return 0;
  if (lambda > 40) return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * normal(r)));
  const l = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= r();
  } while (p > l);
  return k - 1;
}

const DOW_FACTOR = [0.8, 1.0, 1.0, 1.0, 1.02, 1.08, 0.85];

/** 季節の流れに沿った天気（過去実績 + 既定の予報）。10/29 は前日比を作るため晴れで固定。 */
export function baseWeather(): Map<string, WeatherDay> {
  const r = mulberry32(SEED + 1);
  const end = addDays(HISTORY_END, FORECAST_DAYS + 1);
  const days = dateRange(HISTORY_START, end);
  const total = diffDays(HISTORY_START, HISTORY_END);
  const out = new Map<string, WeatherDay>();
  for (const d of days) {
    const t = diffDays(HISTORY_START, d) / total;
    let max = 33.5 - 14 * t + normal(r) * 1.8;
    const rainProb = d < '2026-09-01' ? 0.25 : d < '2026-10-01' ? 0.38 : 0.3;
    const isRain = r() < rainProb;
    const cloudy = !isRain && r() < 0.4;
    if (isRain) max -= 3;
    const condition: WeatherDay['condition'] = isRain ? '雨' : cloudy ? 'くもり' : '晴れ';
    const precip = isRain ? 70 + Math.floor(r() * 26) : cloudy ? 20 + Math.floor(r() * 21) : Math.floor(r() * 11);
    const spread = 6 + r() * 3;
    out.set(d, {
      condition,
      temp_max: Math.round(max * 10) / 10,
      temp_min: Math.round((max - spread) * 10) / 10,
      precip_prob: precip,
    });
  }
  out.set(HISTORY_END, { condition: '晴れ', temp_max: 20.4, temp_min: 12.8, precip_prob: 10 });
  return out;
}

function weatherMult(item: Item, w: WeatherDay): number {
  let m = 1;
  if (w.condition === '雨') m *= item.rain;
  if (w.temp_max >= 25) m *= item.hot;
  else if (w.temp_max <= 16) m *= item.cold;
  return m;
}

function trendMult(item: Item, date: string): number {
  if (item.since) {
    if (date < item.since) return 0;
    return Math.min(1, 0.5 + diffDays(item.since, date) * 0.05);
  }
  if (item.sku === HABIT.wasteDessert && date >= '2026-09-20') {
    return Math.max(0.25, 1 - diffDays('2026-09-20', date) * 0.025);
  }
  if (item.sku === 'D05' && date >= '2026-09-01') {
    return 1 + Math.min(0.6, diffDays('2026-09-01', date) * 0.012);
  }
  return 1;
}

function eventHourMult(item: Item, events: EventDef[], hour: number): number {
  let m = 1;
  for (const ev of events) {
    const startHour = Math.floor(timeToMinutes(ev.start) / 60) - 1;
    const endHour = Math.ceil(timeToMinutes(ev.end) / 60);
    if (hour >= startHour && hour < endHour) {
      m = Math.max(m, 1 + (item.event - 1) * Math.min(1, ev.scale / 5000));
    }
  }
  return m;
}

/** 平常日の需要（天気・イベントの補正なし）。在庫ツールの「見込み」と同じ考え方。 */
export function dailyDemand(item: Item, date: string, w: WeatherDay, noise = 1): number {
  return item.base * DOW_FACTOR[dayOfWeek(date)] * weatherMult(item, w) * trendMult(item, date) * noise;
}

function roundToLot(qty: number, lot: number): number {
  if (qty <= 0) return 0;
  return Math.max(lot, Math.ceil(qty / lot) * lot);
}

interface ItemState {
  stock: number;
  pendingDelivery: number;
  recentSales: number[];
}

interface Writers {
  sales: (date: string, hour: number, sku: string, qty: number) => void;
  waste: (date: string, sku: string, qty: number, reason: string) => void;
  stockout: (date: string, sku: string, hour: number, lost: number) => void;
  order: (date: string, sku: string, qty: number, deliveryDate: string, deliveryTime?: string) => void;
}

function freshOrderQty(item: Item, date: string, st: ItemState): number {
  if (item.sku === HABIT.wasteDessert && date >= HABIT.wasteDessertFixedFrom) return HABIT.wasteDessertFixedQty;
  const trend = trendMult(item, date);
  if (trend === 0) return 0;
  const hist = st.recentSales.slice(-7);
  const avgDow = DOW_FACTOR.reduce((a, b) => a + b, 0) / 7;
  const dowAdj = DOW_FACTOR[dayOfWeek(date)] / avgDow;
  const forecast =
    hist.length >= 3 ? (hist.reduce((a, b) => a + b, 0) / hist.length) * dowAdj * 1.05 : item.base * trend * dowAdj * 1.05;
  let qty = roundToLot(forecast, item.minLot);
  if (item.sku === HABIT.stockoutBento) qty = Math.min(qty, HABIT.stockoutBentoCap);
  return qty;
}

/** 店長は経験でイベント日に夕方便を追加していた（イベントに強い品目だけ） */
function eventAddOnQty(item: Item, baseQty: number, events: EventDef[]): number {
  if (events.length === 0 || item.event < 1.5 || baseQty === 0) return 0;
  let extraShare = 0;
  for (let h = 0; h < 24; h++) extraShare += hourShare(item.profile, h) * (eventHourMult(item, events, h) - 1);
  return roundToLot(baseQty * extraShare, item.minLot);
}

function groceryPolicy(item: Item): { reorderPoint: number; target: number } {
  if (item.sku === HABIT.umbrella) return { reorderPoint: 3, target: 4 };
  if (item.cooked) return { reorderPoint: Math.ceil(item.base * 3), target: Math.ceil(item.base * 6) };
  return { reorderPoint: Math.ceil(item.base * 2), target: Math.ceil(item.base * 4) };
}

/** 1 日分（または途中の時刻まで）を時間別にシミュレーションする */
function simulateDay(
  r: Rng,
  item: Item,
  date: string,
  w: WeatherDay,
  events: EventDef[],
  st: ItemState,
  out: Writers,
  untilMinutes = 24 * 60,
): number {
  const noise = Math.exp(normal(r) * 0.12);
  const daily = dailyDemand(item, date, w, noise);
  let soldTotal = 0;
  let firstStockout = -1;
  let lost = 0;
  for (let h = 0; h < 24; h++) {
    const fraction = Math.max(0, Math.min(1, (untilMinutes - h * 60) / 60));
    if (fraction === 0) break;
    const demand = poisson(r, daily * hourShare(item.profile, h) * eventHourMult(item, events, h) * fraction);
    const sold = Math.min(demand, st.stock);
    st.stock -= sold;
    soldTotal += sold;
    if (sold > 0) out.sales(date, h, item.sku, sold);
    if (demand > sold) {
      if (firstStockout < 0) firstStockout = h;
      lost += demand - sold;
    }
  }
  if (firstStockout >= 0) out.stockout(date, item.sku, firstStockout, lost);
  return soldTotal;
}

export interface BuildResult {
  dbPath: string;
  scenario: string;
  businessDate: string;
  salesRows: number;
  wasteRows: number;
  ms: number;
}

export function buildDatabase(db: DatabaseSync, scenario: Scenario): Omit<BuildResult, 'dbPath'> {
  const started = Date.now();
  if (scenario.businessDate !== addDays(HISTORY_END, 1)) {
    throw new Error(`シナリオの営業日は ${addDays(HISTORY_END, 1)} にしてください（現在: ${scenario.businessDate}）`);
  }
  db.exec(SCHEMA);
  db.exec('BEGIN');
  try {
    db.prepare('INSERT INTO store VALUES (?, ?, ?, ?)').run(STORE.store_id, STORE.name, STORE.area, STORE.open_hours);
    const insItem = db.prepare('INSERT INTO item VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    for (const i of ITEMS) {
      insItem.run(i.sku, i.name, i.category, i.price, i.shelfLifeHours, i.orderCutoff, i.leadTimeDays, i.minLot);
    }

    const weather = baseWeather();
    for (const [d, w] of Object.entries(scenario.weather)) weather.set(d, w);
    const insWeather = db.prepare('INSERT INTO weather VALUES (?, ?, ?, ?, ?, ?)');
    for (const [d, w] of [...weather.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      insWeather.run(d, w.condition, w.temp_max, w.temp_min, w.precip_prob, d >= scenario.businessDate ? 1 : 0);
    }
    const allEvents = [...PAST_EVENTS, ...scenario.events];
    const insEvent = db.prepare('INSERT INTO event VALUES (?, ?, ?, ?, ?, ?, ?)');
    for (const e of allEvents) insEvent.run(e.date, e.start, e.end, e.venue, e.name, e.scale, e.distance_m);

    const insSales = db.prepare('INSERT INTO sales_hourly VALUES (?, ?, ?, ?)');
    const insWaste = db.prepare('INSERT INTO waste VALUES (?, ?, ?, ?)');
    const insStockout = db.prepare('INSERT INTO stockout VALUES (?, ?, ?, ?)');
    const insOrder = db.prepare('INSERT INTO orders VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    let salesRows = 0;
    let wasteRows = 0;
    const out: Writers = {
      sales: (d, h, sku, q) => {
        insSales.run(d, h, sku, q);
        salesRows++;
      },
      waste: (d, sku, q, reason) => {
        insWaste.run(d, sku, q, reason);
        wasteRows++;
      },
      stockout: (d, sku, h, lost) => insStockout.run(d, sku, h, lost),
      order: (d, sku, q, deliveryDate, deliveryTime = '06:00') => {
        const evening = deliveryTime !== '06:00';
        const created = evening ? deliveryDate : addDays(deliveryDate, -1);
        insOrder.run(
          `PO-${deliveryDate.replaceAll('-', '')}${evening ? '-2' : ''}`,
          `${created}T09:30`,
          sku,
          q,
          '納品済',
          evening ? '店長（夕方便の追加）' : '店舗（定期発注）',
          deliveryDate,
          deliveryTime,
          evening ? 'イベント対応' : null,
          'history',
        );
      },
    };

    const days = dateRange(HISTORY_START, HISTORY_END);
    const [demoH, demoM] = scenario.demoTime.split(':').map(Number);
    const inventory = new Map<string, number>();

    ITEMS.forEach((item, idx) => {
      const r = mulberry32(SEED + 100 + idx);
      const st: ItemState = { stock: 0, pendingDelivery: 0, recentSales: [] };
      const fresh = isDailyFresh(item);
      if (!fresh) {
        st.stock = item.sku === HABIT.umbrella ? 4 : roundToLot(item.base * 3, item.minLot);
      }
      const runDay = (date: string, until?: number) => {
        const w = weather.get(date)!;
        const events = allEvents.filter((e) => e.date === date);
        if (fresh) {
          const qty = freshOrderQty(item, date, st);
          if (qty > 0) out.order(date, item.sku, qty, date);
          st.stock = qty;
          // 当日の夕方便は朝の時点では未入荷なので、営業日の途中までのシミュレーションでは足さない
          const addOn = until === undefined ? eventAddOnQty(item, qty, events) : 0;
          if (addOn > 0) {
            out.order(date, item.sku, addOn, date, '16:00');
            st.stock += addOn;
          }
        } else if (st.pendingDelivery > 0) {
          out.order(date, item.sku, st.pendingDelivery, date);
          st.stock += st.pendingDelivery;
          st.pendingDelivery = 0;
        }
        const sold = simulateDay(r, item, date, w, events, st, out, until);
        if (until !== undefined) return;
        if (trendMult(item, date) > 0) st.recentSales.push(sold);
        if (fresh) {
          if (st.stock > 0) out.waste(date, item.sku, st.stock, '消費期限切れ');
          st.stock = 0;
        } else {
          if (item.cooked && sold > 0) {
            const cookedWaste = Math.min(st.stock, Math.round(sold * (0.04 + r() * 0.08)));
            if (cookedWaste > 0) {
              out.waste(date, item.sku, cookedWaste, '調理後の時間超過');
              st.stock -= cookedWaste;
            }
          }
          const p = groceryPolicy(item);
          if (st.stock < p.reorderPoint) st.pendingDelivery = roundToLot(p.target - st.stock, item.minLot);
        }
      };
      for (const d of days) runDay(d);
      runDay(scenario.businessDate, demoH * 60 + demoM);
      inventory.set(item.sku, st.stock);
    });

    const asOf = `${scenario.businessDate}T${scenario.demoTime}`;
    const insInv = db.prepare('INSERT INTO inventory VALUES (?, ?, ?)');
    for (const item of ITEMS) {
      const override = scenario.inventoryOverrides[item.sku];
      insInv.run(asOf, item.sku, override ?? inventory.get(item.sku) ?? 0);
    }

    const insMeta = db.prepare('INSERT INTO meta VALUES (?, ?)');
    insMeta.run('scenario', scenario.id);
    insMeta.run('business_date', scenario.businessDate);
    insMeta.run('demo_time', scenario.demoTime);
    insMeta.run('generated_at', new Date().toISOString());
    db.exec('COMMIT');
    return { scenario: scenario.id, businessDate: scenario.businessDate, salesRows, wasteRows, ms: Date.now() - started };
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
