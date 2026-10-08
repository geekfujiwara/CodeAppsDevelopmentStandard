import { cn } from "@/lib/utils"

export interface StagePathItem {
  value: number
  label: string
}

interface StagePathProps {
  stages: StagePathItem[]
  current?: number
  /** 却下・失注など否定的な終端ステージの値（赤系で表示） */
  negativeValue?: number
  onSelect?: (value: number) => void
  className?: string
}

/**
 * Salesforce 風のステージ矢羽（パス）表示。
 * 完了済みステージは塗りつぶし、現在ステージは強調、未到達はグレー。
 */
export function StagePath({ stages, current, negativeValue, onSelect, className }: StagePathProps) {
  const currentIndex = stages.findIndex((s) => s.value === current)
  const isNegative = current !== undefined && current === negativeValue

  return (
    <div className={cn("flex w-full overflow-x-auto", className)}>
      {stages.map((stage, idx) => {
        const isCurrent = idx === currentIndex
        const isCompleted = currentIndex >= 0 && idx < currentIndex && !isNegative
        const isLastNegative = isNegative && stage.value === negativeValue

        let toneClass: string
        if (isLastNegative) {
          toneClass = "bg-rose-600 text-white"
        } else if (isCurrent) {
          toneClass =
            negativeValue !== undefined && idx === stages.length - 1
              ? "bg-emerald-700 text-white"
              : "bg-emerald-600 text-white"
        } else if (isCompleted) {
          toneClass = "bg-emerald-500/90 text-white"
        } else {
          toneClass = "bg-muted text-muted-foreground"
        }

        // 矢羽形状（先頭セルは左ノッチなし、それ以降は左右にノッチ）
        const clip =
          idx === 0
            ? "polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%)"
            : "polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%, 14px 50%)"

        return (
          <button
            key={stage.value}
            type="button"
            disabled={!onSelect}
            onClick={() => onSelect?.(stage.value)}
            style={{ clipPath: clip, marginLeft: idx === 0 ? 0 : -10 }}
            className={cn(
              "relative flex h-9 min-w-[96px] flex-1 items-center justify-center px-4 text-xs font-medium whitespace-nowrap transition-colors",
              toneClass,
              onSelect && "cursor-pointer hover:brightness-110",
              isCurrent && "font-semibold",
            )}
            title={stage.label}
          >
            <span className="flex items-center gap-1">
              {(isCompleted || (isCurrent && !isLastNegative)) && (
                <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M3 8.5l3.5 3.5L13 4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              {stage.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
