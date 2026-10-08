import { Badge } from "@/components/ui/badge"

export function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-muted-foreground">-</span>
  const variant = score >= 4 ? "default" : score >= 3 ? "secondary" : "destructive"
  return <Badge variant={variant}>{score}</Badge>
}

export function VerdictBadge({ label }: { label: string }) {
  if (label === "OK") return <Badge variant="default">OK</Badge>
  if (label === "NG") return <Badge variant="destructive">NG</Badge>
  return <Badge variant="outline">未評価</Badge>
}
