import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { LucideIcon } from "lucide-react"

export interface StatCardData {
  title: string
  value: string | number
  description: string
  icon: LucideIcon
  trend?: {
    value: number
    label: string
    isPositive?: boolean
  }
}

interface StatsCardsProps {
  stats: StatCardData[]
  columns?: 2 | 3 | 4
}

/**
 * 統計カードグリッドコンポーネント
 * 
 * @example
 * ```tsx
 * import { BookOpen, Clock, Target, Users } from "lucide-react"
 * 
 * const stats: StatCardData[] = [
 *   {
 *     title: "総ユーザー数",
 *     value: "1,234",
 *     description: "アクティブなユーザー数",
 *     icon: Users,
 *   },
 *   {
 *     title: "完了タスク",
 *     value: "89",
 *     description: "今月の完了タスク数",
 *     icon: Target,
 *     trend: { value: 12, label: "先月比", isPositive: true }
 *   },
 * ]
 * 
 * <StatsCards stats={stats} columns={4} />
 * ```
 */
export function StatsCards({ stats, columns = 4 }: StatsCardsProps) {
  const gridCols = {
    2: "sm:grid-cols-2",
    3: "sm:grid-cols-2 lg:grid-cols-3",
    4: "sm:grid-cols-2 lg:grid-cols-4",
  }

  return (
    <section className={`grid grid-cols-1 gap-4 ${gridCols[columns]}`}>
      {stats.map((stat, index) => (
        <Card key={index}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
            <stat.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stat.value}</div>
            <p className="text-xs text-muted-foreground">{stat.description}</p>
            {stat.trend && (
              <div className="mt-2 flex items-center gap-1 text-xs">
                <span className={stat.trend.isPositive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
                  {stat.trend.isPositive ? "↑" : "↓"} {Math.abs(stat.trend.value)}%
                </span>
                <span className="text-muted-foreground">{stat.trend.label}</span>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </section>
  )
}
