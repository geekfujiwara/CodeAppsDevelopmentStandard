import type { LucideIcon } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"

interface KpiCardProps {
  label: string
  value: string
  hint?: string
  icon: LucideIcon
  progress?: number
  tone?: "default" | "good" | "warn" | "bad"
}

const TONE: Record<NonNullable<KpiCardProps["tone"]>, string> = {
  default: "text-primary",
  good: "text-emerald-600 dark:text-emerald-400",
  warn: "text-amber-600 dark:text-amber-400",
  bad: "text-rose-600 dark:text-rose-400",
}

export function KpiCard({ label, value, hint, icon: Icon, progress, tone = "default" }: KpiCardProps) {
  return (
    <Card className="min-w-0">
      <CardContent className="space-y-2 py-5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">{label}</p>
          <Icon className={cn("h-5 w-5 shrink-0", TONE[tone])} />
        </div>
        <p className={cn("text-2xl font-bold tabular-nums [overflow-wrap:anywhere]", TONE[tone])}>{value}</p>
        {progress !== undefined && <Progress value={Math.min(progress * 100, 100)} />}
        {hint && <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{hint}</p>}
      </CardContent>
    </Card>
  )
}
