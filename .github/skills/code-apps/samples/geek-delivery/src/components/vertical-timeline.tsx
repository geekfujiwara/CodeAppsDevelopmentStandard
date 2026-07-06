import { type ReactNode } from "react"
import { cn } from "@/lib/utils"
import { Check, X } from "lucide-react"

export type TimelineState = "done" | "current" | "problem" | "pending"

export interface TimelineItem {
  id: string
  title: string
  subtitle?: string
  /** タイトル右側の補足（バッジ・時刻など） */
  meta?: ReactNode
  /** 行右端の操作エリア（ボタンなど） */
  actions?: ReactNode
  state: TimelineState
}

const DOT_CLASS: Record<TimelineState, string> = {
  done:    "bg-emerald-600 text-white",
  current: "bg-blue-600 text-white ring-4 ring-blue-500/20",
  problem: "bg-rose-600 text-white",
  pending: "bg-muted text-muted-foreground border",
}

/**
 * 縦タイムライン（ステッパー）。経由地の配達状況・処理履歴・工程進捗など、
 * 「順序を持つ項目の進行状態」を上から下へ可視化する。
 * done=チェック、problem=バツ、current=強調リング、pending=順序数字。
 */
export function VerticalTimeline({ items, emptyText = "項目がありません" }: {
  items: TimelineItem[]
  emptyText?: string
}) {
  if (items.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{emptyText}</p>
  }

  return (
    <ol className="space-y-0">
      {items.map((item, i) => (
        <li key={item.id} className="relative flex gap-3 pb-6 last:pb-0">
          {/* 縦線（最後の項目には引かない） */}
          {i < items.length - 1 && (
            <span className="absolute left-[13px] top-7 h-[calc(100%-16px)] w-0.5 bg-border" aria-hidden="true" />
          )}
          {/* ドット */}
          <span className={cn(
            "relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
            DOT_CLASS[item.state],
          )}>
            {item.state === "done" ? <Check className="h-4 w-4" />
              : item.state === "problem" ? <X className="h-4 w-4" />
              : i + 1}
          </span>
          {/* 本文 */}
          <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className={cn(
                  "text-sm font-medium leading-snug",
                  item.state === "pending" && "text-muted-foreground",
                )}>
                  {item.title}
                </p>
                {item.meta}
              </div>
              {item.subtitle && (
                <p className="truncate text-xs text-muted-foreground">{item.subtitle}</p>
              )}
            </div>
            {item.actions && <div className="flex shrink-0 items-center gap-1">{item.actions}</div>}
          </div>
        </li>
      ))}
    </ol>
  )
}
