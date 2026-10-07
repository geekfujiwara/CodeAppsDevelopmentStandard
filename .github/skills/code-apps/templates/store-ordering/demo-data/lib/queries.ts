import { addDays } from './dates.ts';
import { round1 } from './format.ts';
import type { Item } from './catalog.ts';
import type { DatabaseSync } from 'node:sqlite';
import type { DemoState } from './state.ts';

export type Row = Record<string, number | string | null>;

export interface EventRow {
  date: string;
  start: string;
  end: string;
  venue: string;
  name: string;
  scale: number;
  distance_m: number;
}

export function eventsBetween(db: DatabaseSync, from: string, to: string): EventRow[] {
  return db.prepare('SELECT * FROM event WHERE date BETWEEN ? AND ? ORDER BY date, start').all(from, to) as unknown as EventRow[];
}

export function currentStock(state: DemoState, sku: string): number {
  const row = state.db.prepare('SELECT qty FROM inventory WHERE sku = ? ORDER BY as_of DESC LIMIT 1').get(sku) as Row | undefined;
  return Number(row?.qty ?? 0);
}

/**
 * 本日の残り時間の見込み販売数。直近 4 週の同じ曜日の平均で、天気とイベントは反映しない
 * （補正は店長の判断基準＝スキル側で行う）。
 */
export function expectedRemainingToday(state: DemoState, item: Item): number {
  const now = state.now();
  const days = [7, 14, 21, 28].map((n) => addDays(state.scenario.businessDate, -n));
  const frac = 1 - (now.minutes - now.hour * 60) / 60;
  const rows = state.db
    .prepare(
      `SELECT date, SUM(CASE WHEN hour > ? THEN qty WHEN hour = ? THEN qty * ? ELSE 0 END) AS q
       FROM sales_hourly WHERE sku = ? AND date IN (?, ?, ?, ?) GROUP BY date`,
    )
    .all(now.hour, now.hour, frac, item.sku, ...days) as Row[];
  const total = rows.reduce((a, r) => a + Number(r.q), 0);
  return round1(total / days.length);
}
