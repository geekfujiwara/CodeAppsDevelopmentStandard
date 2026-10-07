import { ITEMS, isDailyFresh, type Item } from './catalog.ts';
import { addDays, dateRange, labelDate, weekdayJa } from './dates.ts';
import { round1, signedPct } from './format.ts';
import { HISTORY_START, STORE } from './seed.ts';
import { currentStock, eventsBetween, expectedRemainingToday, type Row } from './queries.ts';
import type { DemoState } from './state.ts';

/** Dataverse の 1 行。key は決定的な行 ID の元、item は商品 Lookup（商品コード）、それ以外は列の論理名（接頭辞なし） */
export type DvRow = { key: string; name: string; item?: string } & Record<string, string | number | null | undefined>;

export interface ExportBundle {
  scenario: { id: string; title: string; businessDate: string; demoTime: string };
  /** シナリオに依存しない（全シナリオで同じ） */
  history: { items: DvRow[]; trends: DvRow[]; daily: DvRow[]; weather: DvRow[]; events: DvRow[] };
  /** シナリオを切り替えると書き換える */
  scenarioRows: { weather: DvRow[]; events: DvRow[]; inventory: DvRow[]; setting: DvRow[] };
}

const EVENING = [15, 16, 17, 18, 19, 20];

function itemType(i: Item): string {
  if (i.cooked) return '店内調理';
  return isDailyFresh(i) ? '日配' : '常温・冷凍';
}

function avg(xs: number[]): number | null {
  return xs.length ? round1(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
}

export function buildExport(state: DemoState): ExportBundle {
  const db = state.db;
  const s = state.scenario;
  const today = s.businessDate;
  const last = addDays(today, -1);
  const days = dateRange(HISTORY_START, last);

  const hourly = new Map<string, number[]>();
  for (const r of db.prepare('SELECT date, sku, hour, qty FROM sales_hourly WHERE date <= ?').all(last) as Row[]) {
    const k = `${r.date}|${r.sku}`;
    const arr = hourly.get(k) ?? new Array<number>(24).fill(0);
    arr[Number(r.hour)] = Number(r.qty);
    hourly.set(k, arr);
  }
  const byKey = (sql: string) => new Map((db.prepare(sql).all() as Row[]).map((r) => [`${r.date}|${r.sku}`, r]));
  const waste = byKey('SELECT date, sku, qty, reason FROM waste');
  const stockout = byKey('SELECT date, sku, first_hour, lost_qty FROM stockout');
  const deliveries = byKey(
    `SELECT delivery_date AS date, sku, SUM(CASE WHEN delivery_time = '06:00' THEN qty ELSE 0 END) AS morning,
            SUM(CASE WHEN delivery_time <> '06:00' THEN qty ELSE 0 END) AS evening
     FROM orders WHERE source = 'history' GROUP BY delivery_date, sku`,
  );
  const weather = new Map((db.prepare('SELECT * FROM weather').all() as Row[]).map((r) => [String(r.date), r]));
  const allEvents = eventsBetween(db, HISTORY_START, addDays(today, 30));
  const eventByDate = new Map<string, string>();
  for (const e of allEvents) eventByDate.set(e.date, `${e.name}（${e.start}〜${e.end}・${e.venue}・約${e.scale.toLocaleString('ja-JP')}人）`);

  const items: DvRow[] = ITEMS.map((i) => ({
    key: `item:${i.sku}`,
    name: i.name,
    sku: i.sku,
    category: i.category,
    price: i.price,
    itemtype: itemType(i),
    shelflifehours: i.shelfLifeHours,
    ordercutoff: i.leadTimeDays === 0 ? i.orderCutoff : null,
    leadtimedays: i.leadTimeDays,
    minlot: i.minLot,
    unit: i.unit,
    salesstart: i.since ?? null,
  }));

  const daily: DvRow[] = [];
  for (const d of days) {
    const w = weather.get(d)!;
    for (const i of ITEMS) {
      if (i.since && d < i.since) continue;
      const k = `${d}|${i.sku}`;
      const h = hourly.get(k) ?? new Array<number>(24).fill(0);
      const qty = h.reduce((a, b) => a + b, 0);
      const wr = waste.get(k);
      const so = stockout.get(k);
      const dl = deliveries.get(k);
      daily.push({
        key: `daily:${k}`,
        name: `${labelDate(d)} ${i.sku} ${i.name}`,
        item: i.sku,
        sku: i.sku,
        category: i.category,
        date: d,
        weekday: weekdayJa(d),
        weather: String(w.condition),
        tempmax: Number(w.temp_max),
        event: eventByDate.get(d) ?? 'なし',
        salesqty: qty,
        salesamount: qty * i.price,
        eveningqty: EVENING.reduce((a, x) => a + h[x], 0),
        hourly: h.join(','),
        wasteqty: Number(wr?.qty ?? 0),
        wasteamount: Number(wr?.qty ?? 0) * i.price,
        wastereason: wr ? String(wr.reason) : null,
        soldouthour: so ? Number(so.first_hour) : null,
        lostqty: Number(so?.lost_qty ?? 0),
        deliverymorning: Number(dl?.morning ?? 0),
        deliveryevening: Number(dl?.evening ?? 0),
      });
    }
  }

  const trends = ITEMS.map((i) => buildTrend(state, i, daily));

  const weatherRow = (d: string, kind: '実績' | '予報'): DvRow => {
    const w = weather.get(d)!;
    const prev = weather.get(addDays(d, -1));
    return {
      key: `weather:${d}`,
      name: labelDate(d),
      date: d,
      condition: String(w.condition),
      tempmax: Number(w.temp_max),
      tempmin: Number(w.temp_min),
      precipprob: Number(w.precip_prob),
      kind,
      tempdiff: prev ? round1(Number(w.temp_max) - Number(prev.temp_max)) : null,
      prevcondition: prev ? String(prev.condition) : null,
    };
  };
  const forecastDays = dateRange(today, addDays(today, 6));

  const eventRow = (e: (typeof allEvents)[number]): DvRow => ({
    key: `event:${e.date}:${e.name}`,
    name: e.name,
    date: e.date,
    starttime: e.start,
    endtime: e.end,
    venue: e.venue,
    scale: e.scale,
    distancem: e.distance_m,
  });

  const asof = `${labelDate(today)} ${s.demoTime}`;
  const inventory: DvRow[] = ITEMS.filter((i) => !i.since || i.since <= today).map((i) => {
    const stock = currentStock(state, i.sku);
    const expected = expectedRemainingToday(state, i);
    const soldToday = Number(
      (db.prepare('SELECT SUM(qty) AS q FROM sales_hourly WHERE date = ? AND sku = ?').get(today, i.sku) as Row).q ?? 0,
    );
    const status = stock < expected * 0.9 ? '不足の恐れ' : isDailyFresh(i) && stock > expected * 1.5 + 2 ? '多め' : '十分';
    return {
      key: `inventory:${i.sku}`,
      name: `${i.sku} ${i.name}`,
      item: i.sku,
      sku: i.sku,
      category: i.category,
      asof,
      stock,
      soldtoday: soldToday,
      expectedrest: expected,
      balance: round1(stock - expected),
      status,
      minlot: i.minLot,
      unit: i.unit,
      eveningorder: i.leadTimeDays === 0 ? `可（締め ${i.orderCutoff}・16:00 納品）` : '不可（翌日の朝便から）',
    };
  });

  return {
    scenario: { id: s.id, title: s.title, businessDate: today, demoTime: s.demoTime },
    history: {
      items,
      trends,
      daily,
      weather: days.map((d) => weatherRow(d, '実績')),
      events: allEvents.filter((e) => e.date < today).map(eventRow),
    },
    scenarioRows: {
      weather: forecastDays.filter((d) => weather.has(d)).map((d) => weatherRow(d, '予報')),
      events: allEvents.filter((e) => e.date >= today).map(eventRow),
      inventory,
      setting: [
        {
          key: 'setting:current',
          name: '現在のデモ設定',
          scenario: s.id,
          scenariotitle: s.title,
          businessdate: today,
          demotime: s.demoTime,
          storename: STORE.name,
          storearea: STORE.area,
        },
      ],
    },
  };
}

function buildTrend(state: DemoState, i: Item, daily: DvRow[]): DvRow {
  const last = addDays(state.scenario.businessDate, -1);
  const rows = daily.filter((r) => r.sku === i.sku);
  const byDate = new Map(rows.map((r) => [String(r.date), r]));
  const range = (from: string, to: string) => dateRange(from, to).map((d) => byDate.get(d)).filter((r): r is DvRow => !!r);
  const sum = (rs: DvRow[], col: string) => rs.reduce((a, r) => a + Number(r[col] ?? 0), 0);

  const r7 = range(addDays(last, -6), last);
  const p7 = range(addDays(last, -13), addDays(last, -7));
  const r14 = range(addDays(last, -13), last);

  // 天気別は直近 60 日（季節品は販売開始の 10 日後から）
  const sixty = addDays(last, -59);
  const since = i.since ? addDays(i.since, 10) : '';
  const base = range(since > sixty ? since : sixty, last);
  const isEvent = (r: DvRow) => r.event !== 'なし';
  const sales = (rs: DvRow[]) => rs.map((r) => Number(r.salesqty));

  const sold14 = sum(r14, 'salesqty');
  const waste14 = sum(r14, 'wasteqty');
  let streak = 0;
  for (let d = last; Number(byDate.get(d)?.wasteqty ?? 0) > 0; d = addDays(d, -1)) streak++;
  const so14 = r14.filter((r) => r.soldouthour !== null);
  const lost14 = sum(r14, 'lostqty');

  const hourTotals = new Array<number>(24).fill(0);
  for (const r of r14) String(r.hourly).split(',').forEach((v, h) => (hourTotals[h] += Number(v)));
  const peak = hourTotals
    .map((q, h) => ({ q, h }))
    .sort((a, b) => b.q - a.q)
    .slice(0, 3)
    .filter((x) => x.q > 0)
    .map((x) => `${x.h}時台`)
    .join('・');

  const sold7 = sum(r7, 'salesqty');
  const prev7 = sum(p7, 'salesqty');
  return {
    key: `trend:${i.sku}`,
    name: `${i.sku} ${i.name}`,
    item: i.sku,
    sku: i.sku,
    category: i.category,
    unit: i.unit,
    period: `直近7日 ${labelDate(addDays(last, -6))}〜${labelDate(last)} / 直近14日 ${labelDate(addDays(last, -13))}〜 / 天気別 ${labelDate(base[0]?.date ? String(base[0].date) : last)}〜`,
    avg7: round1(sold7 / 7),
    weekratio: prev7 ? signedPct(sold7 / prev7) : '比較できません',
    rainavg: avg(sales(base.filter((r) => r.weather === '雨'))),
    dryavg: avg(sales(base.filter((r) => r.weather !== '雨' && Number(r.tempmax) < 25))),
    hotavg: avg(sales(base.filter((r) => r.weather !== '雨' && Number(r.tempmax) >= 25))),
    eventavg: avg(sales(base.filter(isEvent))),
    eveningeventavg: avg(base.filter(isEvent).map((r) => Number(r.eveningqty))),
    eveningnormalavg: avg(base.filter((r) => !isEvent(r)).map((r) => Number(r.eveningqty))),
    peakhours: peak || 'なし',
    waste14,
    wasteamount14: waste14 * i.price,
    wasterate14: sold14 + waste14 ? round1((waste14 / (sold14 + waste14)) * 100) : 0,
    wastestreak: streak,
    orderavg14: round1((sum(r14, 'deliverymorning') + sum(r14, 'deliveryevening')) / 14),
    salesavg14: round1(sold14 / 14),
    stockoutdays14: so14.length,
    soldouthour: so14.length ? round1(so14.reduce((a, r) => a + Number(r.soldouthour), 0) / so14.length) : null,
    lost14,
    lostamount14: lost14 * i.price,
  };
}
