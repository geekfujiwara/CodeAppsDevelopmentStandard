const WEEKDAYS_JA = ['日', '月', '火', '水', '木', '金', '土'];

function toUtc(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function addDays(iso: string, n: number): string {
  const dt = toUtc(iso);
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

export function dayOfWeek(iso: string): number {
  return toUtc(iso).getUTCDay();
}

export function weekdayJa(iso: string): string {
  return WEEKDAYS_JA[dayOfWeek(iso)];
}

export function diffDays(from: string, to: string): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / 86_400_000);
}

export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** "2026-10-30" -> "10/30(金)" */
export function labelDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${m}/${d}(${weekdayJa(iso)})`;
}

export function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(toUtc(s).getTime());
}

export function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** 実時刻の日本時間（live 用） */
export function jstNow(): { date: string; time: string } {
  const jst = new Date(Date.now() + 9 * 3_600_000).toISOString();
  return { date: jst.slice(0, 10), time: jst.slice(11, 16) };
}
