import type { DatabaseSync } from 'node:sqlite';
import { HABIT, HISTORY_END } from './seed.ts';
import { addDays } from './dates.ts';

export interface HabitCheck {
  label: string;
  pass: boolean;
  detail: string;
  value: number;
}

type Row = Record<string, number | string | null>;

function avgDaily(db: DatabaseSync, skus: string[], dayFilter: string, hourFilter = '1=1', from = '2026-08-01'): number {
  const marks = skus.map(() => '?').join(',');
  const row = db
    .prepare(
      `SELECT AVG(total) AS v FROM (
         SELECT w.date, COALESCE((SELECT SUM(s.qty) FROM sales_hourly s WHERE s.date = w.date AND s.sku IN (${marks}) AND ${hourFilter}), 0) AS total
         FROM weather w WHERE w.is_forecast = 0 AND w.date >= ? AND (${dayFilter}))`,
    )
    .get(...skus, from) as Row;
  return Number(row.v ?? 0);
}

function ratioCheck(label: string, a: number, b: number, op: '>=' | '<=', threshold: number): HabitCheck {
  const v = b === 0 ? 0 : a / b;
  const pass = op === '>=' ? v >= threshold : v <= threshold;
  return { label, pass, value: v, detail: `${v.toFixed(2)} 倍（基準 ${op} ${threshold}）` };
}

const EVENT_DAYS = `w.date IN (SELECT date FROM event)`;
const NO_EVENT = `w.date NOT IN (SELECT date FROM event)`;

/** 合成データに「気づける癖」が出ているかを数字で確かめる */
export function analyzeHabits(db: DatabaseSync): HabitCheck[] {
  const checks: HabitCheck[] = [];
  const rain = `w.condition = '雨'`;
  const dry = `w.condition <> '雨'`;

  const oden = ['E01', 'E02', 'E03', 'E04', 'E05'];
  checks.push(ratioCheck('雨の日はおでんが伸びる', avgDaily(db, oden, rain, '1=1', '2026-10-01'), avgDaily(db, oden, dry, '1=1', '2026-10-01'), '>=', 1.3));
  checks.push(ratioCheck('雨の日は傘が売れる', avgDaily(db, ['U01'], rain), avgDaily(db, ['U01'], dry), '>=', 3));
  checks.push(ratioCheck('雨の日はカップ麺が伸びる', avgDaily(db, ['N03', 'N04', 'N05'], rain), avgDaily(db, ['N03', 'N04', 'N05'], dry), '>=', 1.3));
  checks.push(ratioCheck('雨の日は冷し麺が落ちる', avgDaily(db, ['N01', 'N02'], rain), avgDaily(db, ['N01', 'N02'], dry), '<=', 0.8));
  checks.push(ratioCheck('雨の日はアイスが落ちる', avgDaily(db, ['I01', 'I02'], rain), avgDaily(db, ['I01', 'I02'], dry), '<=', 0.8));

  const hot = `w.condition <> '雨' AND w.temp_max >= 25`;
  const mild = `w.condition <> '雨' AND w.temp_max < 25`;
  checks.push(ratioCheck('25℃以上で冷し麺が伸びる', avgDaily(db, ['N01', 'N02'], hot), avgDaily(db, ['N01', 'N02'], mild), '>=', 1.3));
  checks.push(ratioCheck('25℃以上で飲料が伸びる', avgDaily(db, ['K01', 'K02', 'K03'], hot), avgDaily(db, ['K01', 'K02', 'K03'], mild), '>=', 1.2));

  const evening = 's.hour BETWEEN 15 AND 20';
  const onigiri = ['O01', 'O02', 'O03', 'O04', 'O05', 'O06', 'O07', 'O08'];
  checks.push(ratioCheck('イベント日は夕方におにぎりが跳ねる', avgDaily(db, onigiri, EVENT_DAYS, evening), avgDaily(db, onigiri, NO_EVENT, evening), '>=', 1.3));
  checks.push(ratioCheck('イベント日は夕方に飲料が跳ねる', avgDaily(db, ['K01', 'K02', 'K03', 'K06'], EVENT_DAYS, evening), avgDaily(db, ['K01', 'K02', 'K03', 'K06'], NO_EVENT, evening), '>=', 1.3));

  const from14 = addDays(HISTORY_END, -13);
  const wasteDays = db
    .prepare(`SELECT date FROM waste WHERE sku = ? AND date >= ? AND qty > 0 ORDER BY date`)
    .all(HABIT.wasteDessert, from14) as Row[];
  checks.push({
    label: 'マンゴー杏仁の廃棄が直近 2 週間続いている',
    pass: wasteDays.length === 14,
    value: wasteDays.length,
    detail: `直近 14 日のうち ${wasteDays.length} 日で廃棄`,
  });
  const top = db
    .prepare(`SELECT w.sku, SUM(w.qty * i.price) AS q FROM waste w JOIN item i USING (sku) WHERE w.date >= ? GROUP BY w.sku ORDER BY q DESC LIMIT 1`)
    .get(from14) as Row;
  checks.push({
    label: '直近 2 週間の廃棄金額 1 位がマンゴー杏仁',
    pass: top.sku === HABIT.wasteDessert,
    value: Number(top.q),
    detail: `1 位は ${top.sku}（${top.q} 円）`,
  });

  const from28 = addDays(HISTORY_END, -27);
  const rate = db
    .prepare(
      `SELECT CAST((SELECT SUM(qty) FROM waste WHERE date >= ?1 AND sku <> ?2) AS REAL) /
              ((SELECT SUM(qty) FROM waste WHERE date >= ?1 AND sku <> ?2) + (SELECT SUM(s.qty) FROM sales_hourly s JOIN item i USING (sku) WHERE s.date >= ?1 AND s.date <= ?3 AND s.sku <> ?2 AND i.shelf_life_hours <= 48)) AS r`,
    )
    .get(from28, HABIT.wasteDessert, HISTORY_END) as Row;
  checks.push({
    label: 'ほかの品目の廃棄率は現実的な水準',
    pass: Number(rate.r) <= 0.15,
    value: Number(rate.r),
    detail: `直近 28 日の廃棄率 ${(Number(rate.r) * 100).toFixed(1)}%（基準 <= 15%）`,
  });

  const so = db
    .prepare(`SELECT COUNT(*) AS days, AVG(first_hour) AS h FROM stockout WHERE sku = ? AND date >= ?`)
    .get(HABIT.stockoutBento, from28) as Row;
  const days = Number(so.days);
  const hour = Number(so.h);
  checks.push({
    label: '特製から揚げ弁当が夕方に欠品しがち',
    pass: days >= 15 && hour >= 15 && hour <= 19,
    value: days,
    detail: `直近 28 日で ${days} 日欠品、平均 ${hour.toFixed(1)} 時台に売り切れ`,
  });
  return checks;
}
