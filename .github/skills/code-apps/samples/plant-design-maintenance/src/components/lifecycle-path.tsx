import { cn } from "@/lib/utils"
import type { LifecycleStage, LifecycleStageId, LifecycleTone } from "@/lib/lifecycle"

/** 選択時は彩度の高いグラデーション、非選択時は淡いトーンで奥行きを出す */
const TONE_ACTIVE: Record<LifecycleTone, string> = {
  sky: "from-sky-500 to-sky-600",
  blue: "from-blue-500 to-blue-600",
  indigo: "from-indigo-500 to-indigo-600",
  amber: "from-amber-500 to-amber-600",
  violet: "from-violet-500 to-violet-600",
  emerald: "from-emerald-500 to-emerald-600",
  teal: "from-teal-500 to-teal-600",
}

const TONE_IDLE: Record<LifecycleTone, string> = {
  sky: "from-sky-500/25 to-sky-600/30",
  blue: "from-blue-500/25 to-blue-600/30",
  indigo: "from-indigo-500/25 to-indigo-600/30",
  amber: "from-amber-500/25 to-amber-600/30",
  violet: "from-violet-500/25 to-violet-600/30",
  emerald: "from-emerald-500/25 to-emerald-600/30",
  teal: "from-teal-500/25 to-teal-600/30",
}

const NOTCH = 18

/** 先頭は左ノッチなし。以降は左右にノッチを入れて矢羽を連結する */
function chevronClip(isFirst: boolean): string {
  return isFirst
    ? `polygon(0 0, calc(100% - ${NOTCH}px) 0, 100% 50%, calc(100% - ${NOTCH}px) 100%, 0 100%)`
    : `polygon(0 0, calc(100% - ${NOTCH}px) 0, 100% 50%, calc(100% - ${NOTCH}px) 100%, 0 100%, ${NOTCH}px 50%)`
}

export type LifecyclePathItem = {
  stage: LifecycleStage
  count: number
}

interface LifecyclePathProps {
  items: LifecyclePathItem[]
  selectedId: LifecycleStageId
  onSelect: (id: LifecycleStageId) => void
  className?: string
}

/**
 * ナレッジのライフサイクルを矢羽で表す。
 * clip-path で切り抜くと ring / outline も一緒に削られるため、
 * 外側の枠と内側の塗りを二重に切り抜いて「矢羽の形をした枠線」を作っている。
 */
export function LifecyclePath({ items, selectedId, onSelect, className }: LifecyclePathProps) {
  return (
    <div className={cn("w-full overflow-x-auto pb-1", className)}>
      <div className="flex min-w-[900px] items-stretch">
        {items.map((item, idx) => {
          const { stage, count } = item
          const isSelected = stage.id === selectedId
          const clip = chevronClip(idx === 0)

          return (
            <button
              key={stage.id}
              type="button"
              data-tour={`lifecycle-stage-${stage.id}`}
              aria-pressed={isSelected}
              onClick={() => onSelect(stage.id)}
              style={{ clipPath: clip, marginLeft: idx === 0 ? 0 : -NOTCH + 2 }}
              className={cn(
                "group relative flex-1 p-[3px] transition-all duration-200 focus:outline-none",
                isSelected ? "bg-foreground/70" : "bg-transparent hover:bg-foreground/20",
              )}
              title={`${stage.label} — ${stage.caption}`}
            >
              <span
                style={{ clipPath: clip }}
                className={cn(
                  "flex h-full w-full flex-col items-center justify-center gap-0.5 bg-gradient-to-br px-6 py-3 text-white transition-all duration-200",
                  isSelected ? TONE_ACTIVE[stage.tone] : TONE_IDLE[stage.tone],
                  !isSelected && "group-hover:brightness-125",
                )}
              >
                <span
                  className={cn(
                    "text-[10px] font-medium uppercase tracking-widest",
                    isSelected ? "text-white/80" : "text-foreground/60",
                  )}
                >
                  {stage.kind === "incident" ? "問い合わせ" : "ナレッジ"}
                </span>
                <span
                  className={cn(
                    "text-sm font-semibold whitespace-nowrap",
                    !isSelected && "text-foreground/90",
                  )}
                >
                  {stage.label}
                </span>
                <span
                  className={cn(
                    "text-2xl font-bold leading-none tabular-nums",
                    !isSelected && "text-foreground",
                  )}
                >
                  {count}
                  <span className="ml-0.5 text-xs font-normal">件</span>
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
