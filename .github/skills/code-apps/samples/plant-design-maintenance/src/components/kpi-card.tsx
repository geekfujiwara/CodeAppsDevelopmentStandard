import type { LucideIcon } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { formatKpi, formatTarget, type KpiResult, type KpiTone } from "@/lib/kpi"

const TONE_STYLE: Record<KpiTone, { value: string; badge: string; label: string }> = {
  good: { value: "text-emerald-600 dark:text-emerald-400", badge: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", label: "達成" },
  warn: { value: "text-amber-600 dark:text-amber-400", badge: "bg-amber-500/10 text-amber-700 dark:text-amber-300", label: "要注意" },
  bad: { value: "text-rose-600 dark:text-rose-400", badge: "bg-rose-500/10 text-rose-700 dark:text-rose-300", label: "未達" },
  neutral: { value: "text-muted-foreground", badge: "bg-muted text-muted-foreground", label: "データなし" },
}

type Props = {
  kpi: KpiResult
  icon?: LucideIcon
  emphasis?: boolean
}

export function KpiCard({ kpi, icon: Icon, emphasis = false }: Props) {
  const tone = TONE_STYLE[kpi.tone]

  return (
    <Card className={cn(emphasis && "border-primary/30")}>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-muted-foreground">{kpi.id}</p>
            <p className="truncate text-sm font-medium">{kpi.label}</p>
          </div>
          {Icon ? <Icon className="h-6 w-6 shrink-0 text-primary/50" /> : null}
        </div>

        <p className={cn("mt-3 font-bold tabular-nums", emphasis ? "text-4xl" : "text-3xl", tone.value)}>
          {formatKpi(kpi)}
        </p>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", tone.badge)}>{tone.label}</span>
          <span className="text-xs text-muted-foreground">{formatTarget(kpi)}</span>
        </div>

        <p className="mt-2 text-xs text-muted-foreground [overflow-wrap:anywhere]">{kpi.detail}</p>
        <p className="mt-1 text-xs text-muted-foreground/80 [overflow-wrap:anywhere]">{kpi.hint}</p>
      </CardContent>
    </Card>
  )
}
