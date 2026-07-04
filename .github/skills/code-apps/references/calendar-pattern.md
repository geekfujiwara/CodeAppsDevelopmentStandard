# 月間カレンダーパターン（Month Grid Calendar)

イベント・予約・締切・スケジュールなど**日付を持つレコードを月間グリッドで俯瞰する**汎用コンポーネント。
外部カレンダーライブラリを使わず、`date-fns` と Tailwind だけで実装する（依存追加なし・CSP 安全）。

- 月移動（前月 / 今月 / 翌月）、今日のハイライト、他月セルのグレーアウト
- 1 セルに最大 3 件までイベントチップを表示し、超過分は「+N 件」で省略
- イベントチップ・日付セルのクリックをコールバックで通知（詳細遷移・新規作成に接続）
- チップの色はイベント側から `colorClass` で注入（OptionSet のバッジ色・カテゴリハッシュ色をそのまま渡せる）

> 週表示・時間帯グリッド（予約表など）が必要な場合も、まず本パターンの月表示から始めて
> 「セル = 日」を「セル = 時間帯」に置き換えるのが最短。リソース×時間帯の 2 軸予約表は
> 需要が確定してから拡張する。

---

## コンポーネント本体

`src/components/month-calendar.tsx`:

```tsx
import { useMemo, useState } from "react"
import {
  addDays, addMonths, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, startOfMonth, startOfWeek,
} from "date-fns"
import { ja } from "date-fns/locale"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { ChevronLeft, ChevronRight } from "lucide-react"

export interface CalendarEvent {
  id: string
  /** YYYY-MM-DD（Dataverse DateOnly 列の値をそのまま渡す） */
  date: string
  title: string
  /** チップの色（例: "bg-blue-100 text-blue-800"）。省略時は muted */
  colorClass?: string
}

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"]
const MAX_CHIPS_PER_DAY = 3

export function MonthCalendar({ events, onEventClick, onDayClick }: {
  events: CalendarEvent[]
  onEventClick?: (id: string) => void
  onDayClick?: (date: string) => void
}) {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()))

  // 月初を含む週の日曜 〜 月末を含む週の土曜 まで（常に 5〜6 行）
  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor))
    const end = endOfWeek(endOfMonth(cursor))
    const list: Date[] = []
    for (let d = start; d <= end; d = addDays(d, 1)) list.push(d)
    return list
  }, [cursor])

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const ev of events) {
      if (!ev.date) continue
      const key = ev.date.slice(0, 10)
      map.set(key, [...(map.get(key) ?? []), ev])
    }
    return map
  }, [events])

  const today = new Date()

  return (
    <div className="space-y-3">
      {/* ヘッダー: 年月 + 月移動 */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{format(cursor, "yyyy年M月", { locale: ja })}</h2>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => setCursor(c => addMonths(c, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCursor(startOfMonth(new Date()))}>
            今月
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCursor(c => addMonths(c, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* 曜日ヘッダー */}
      <div className="grid grid-cols-7 rounded-t-md border bg-muted/40 text-center text-xs font-medium text-muted-foreground">
        {WEEKDAYS.map((w, i) => (
          <div key={w} className={cn("py-1.5", i === 0 && "text-red-500", i === 6 && "text-blue-500")}>{w}</div>
        ))}
      </div>

      {/* 日付グリッド */}
      <div className="grid grid-cols-7 rounded-b-md border border-t-0">
        {days.map((day) => {
          const key = format(day, "yyyy-MM-dd")
          const dayEvents = eventsByDate.get(key) ?? []
          const inMonth = isSameMonth(day, cursor)
          const isToday = isSameDay(day, today)
          return (
            <div
              key={key}
              onClick={() => onDayClick?.(key)}
              className={cn(
                "min-h-[92px] border-b border-r p-1.5 align-top last:border-r-0 [&:nth-child(7n)]:border-r-0",
                !inMonth && "bg-muted/30 text-muted-foreground",
                onDayClick && "cursor-pointer hover:bg-muted/40",
              )}
            >
              <span className={cn(
                "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs",
                isToday && "bg-primary font-bold text-primary-foreground",
              )}>
                {format(day, "d")}
              </span>
              <div className="mt-0.5 space-y-0.5">
                {dayEvents.slice(0, MAX_CHIPS_PER_DAY).map(ev => (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onEventClick?.(ev.id) }}
                    className={cn(
                      "block w-full truncate rounded px-1 py-0.5 text-left text-[11px] font-medium leading-tight",
                      ev.colorClass ?? "bg-muted text-foreground",
                      onEventClick && "hover:brightness-95",
                    )}
                    title={ev.title}
                  >
                    {ev.title}
                  </button>
                ))}
                {dayEvents.length > MAX_CHIPS_PER_DAY && (
                  <p className="px-1 text-[10px] text-muted-foreground">+{dayEvents.length - MAX_CHIPS_PER_DAY} 件</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

---

## 使い方（Dataverse レコード → CalendarEvent 変換）

```tsx
import { MonthCalendar, type CalendarEvent } from "@/components/month-calendar"

const calendarEvents: CalendarEvent[] = useMemo(() =>
  records
    .filter(r => r[f.start_date])
    .map(r => ({
      id: String(r[f.id] ?? ""),
      date: String(r[f.start_date]),
      title: String(r[f.name] ?? ""),
      // OptionSet のバッジ色（STATUS_COLOR 等）をそのまま渡す
      colorClass: STATUS_COLOR[r[f.status] as keyof typeof STATUS_COLOR],
    })),
  [records]
)

<MonthCalendar
  events={calendarEvents}
  onEventClick={(id) => navigate(`/events/${id}`)}
  onDayClick={(date) => handleNewWithDate(date)}  // 空セルクリックでその日付を初期値に新規作成
/>
```

---

## 設計上の注意

- **日付キーは文字列比較**: Dataverse DateOnly は `YYYY-MM-DD` 文字列で返るため、`Date` に変換せず `slice(0, 10)` でキー化するとタイムゾーンずれが起きない。
- **チップ 3 件 + 「+N 件」**: セルの高さを固定（`min-h-[92px]`）してグリッドの段崩れを防ぐ。全件確認は日付クリック → 一覧フィルターか詳細画面に委ねる。
- **土日の色**: 曜日ヘッダーのみ着色し、セル本体は着色しない（イベントチップの色と干渉するため）。
- **月境界セル**: `isSameMonth` で判定して `bg-muted/30` に落とす。非表示にすると週の行が欠けて視線移動が乱れる。
- **一覧との併設**: カレンダーは俯瞰用と割り切り、同一ページに Tabs で「一覧」ビューを併設すると CRUD 操作系はテーブルに寄せられる（[design-pattern.md](design-pattern.md) の複数ブロック構成）。
