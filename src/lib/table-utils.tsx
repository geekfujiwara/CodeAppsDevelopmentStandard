import { Badge } from "@/components/ui/badge"

// バッジレンダリングヘルパー
export function renderBadge(text: string, variant?: "default" | "secondary" | "outline" | "destructive") {
  return <Badge variant={variant}>{text}</Badge>
}

// 優先度バッジのヘルパー
export function renderPriorityBadge(priority: string) {
  const variants: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
    high: "destructive",
    medium: "default",
    low: "secondary",
  }
  const labels: Record<string, string> = {
    high: "高",
    medium: "中",
    low: "低",
  }
  return <Badge variant={variants[priority] || "outline"}>{labels[priority] || priority}</Badge>
}

// ステータスバッジのヘルパー
export function renderStatusBadge(status: string) {
  const getVariant = (status: string): "default" | "secondary" | "outline" => {
    if (status.includes("完了") || status === "done") return "default"
    if (status.includes("進行中") || status === "in-progress") return "secondary"
    return "outline"
  }
  return <Badge variant={getVariant(status)}>{status}</Badge>
}
