import { Badge } from "@/components/ui/badge"
import type { Health } from "@/crm/metrics"
import { cn } from "@/lib/utils"

const HEALTH: Record<Health, { label: string; className: string }> = {
  achieved: { label: "達成", className: "bg-emerald-600 text-white" },
  "on-track": { label: "順調", className: "bg-sky-600 text-white" },
  "at-risk": { label: "要注意", className: "bg-amber-500 text-white" },
  "off-track": { label: "要支援", className: "bg-rose-600 text-white" },
  "no-target": { label: "目標未設定", className: "bg-muted text-muted-foreground" },
}

export function HealthBadge({ health }: { health: Health }) {
  const h = HEALTH[health]
  return <Badge className={cn("border-transparent", h.className)}>{h.label}</Badge>
}
