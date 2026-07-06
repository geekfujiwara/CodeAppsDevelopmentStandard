import { judgeThreshold, formatRange } from "@/lib/threshold"
import { cn } from "@/lib/utils"

/**
 * 基準レンジに対する測定値の位置を横バーで表示するゲージ。
 * 適合帯（緑）の中に測定値のマーカーを置き、逸脱時はマーカーが帯の外（左=下限/右=上限）に出る。
 * min/max のどちらかが未設定（片側規格）でも動作する。
 */
export function ThresholdGauge({ value, min, max, unit = "", className }: {
  value: number | null | undefined
  min: number | null | undefined
  max: number | null | undefined
  unit?: string
  className?: string
}) {
  const result = judgeThreshold(value, min, max)

  // 表示レンジ: min/max の周辺に余白を取る。片側規格は基準値の ±50% を仮レンジにする
  const lo = min ?? (max != null ? max - Math.abs(max) * 0.5 - 1 : 0)
  const hi = max ?? (min != null ? min + Math.abs(min) * 0.5 + 1 : 100)
  const span = hi - lo || 1
  const pad = span * 0.25
  const axisLo = lo - pad
  const axisHi = hi + pad
  const axisSpan = axisHi - axisLo || 1

  const pct = (v: number) => Math.max(0, Math.min(100, ((v - axisLo) / axisSpan) * 100))
  const bandLeft = pct(min ?? axisLo)
  const bandRight = pct(max ?? axisHi)
  const markerPct = value != null && !Number.isNaN(value) ? pct(value) : null

  const markerColor = result.judgement === "ok" ? "bg-emerald-600"
    : result.judgement === "none" ? "bg-gray-400"
    : "bg-rose-600"

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>基準 {formatRange(min, max, unit)}</span>
        <span className={cn("font-semibold", result.deviated ? "text-rose-600" : result.judgement === "ok" ? "text-emerald-600" : "")}>
          {value != null && !Number.isNaN(value) ? `${value}${unit}` : "—"}
        </span>
      </div>
      <div className="relative h-2.5 w-full rounded-full bg-muted">
        {/* 適合帯 */}
        <div
          className="absolute inset-y-0 rounded-full bg-emerald-500/30"
          style={{ left: `${bandLeft}%`, right: `${100 - bandRight}%` }}
        />
        {/* 測定値マーカー */}
        {markerPct != null && (
          <div
            className={cn("absolute top-1/2 h-4 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-background", markerColor)}
            style={{ left: `${markerPct}%` }}
          />
        )}
      </div>
    </div>
  )
}
