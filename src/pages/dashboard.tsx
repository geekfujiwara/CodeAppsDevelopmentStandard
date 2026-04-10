import { useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { ListTable } from "@/components/list-table"
import type { TableColumn } from "@/components/list-table"
import {
  AlertCircle, Clock, CheckCircle2, XCircle, BarChart3,
  AlertTriangle, UserX, ArrowRight,
} from "lucide-react"
import {
  useIncidents,
  useCategories,
  useSystemUsers,
} from "@/hooks/use-incidents"
import type { Geek_incidents } from "@/generated/models/Geek_incidentsModel"
import {
  statusLabels,
  statusColors,
  priorityLabels,
  priorityColors,
  IncidentStatus,
} from "@/types/incident"

type IncidentRow = Geek_incidents & Record<string, unknown>

export default function DashboardPage() {
  const navigate = useNavigate()
  const { data: incidents = [], isLoading } = useIncidents()
  const { data: categories = [] } = useCategories()
  const { data: users = [] } = useSystemUsers()

  const userMap = useMemo(() => {
    const m = new Map<string, string>()
    users.forEach((u) => m.set(u.systemuserid, u.fullname || u.internalemailaddress || ""))
    return m
  }, [users])
  const categoryMap = useMemo(() => {
    const m = new Map<string, string>()
    categories.forEach((c) => m.set(c.geek_incidentcategoryid, c.geek_name))
    return m
  }, [categories])

  // 統計
  const newCount = incidents.filter((i) => i.geek_status === IncidentStatus.NEW).length
  const inProgressCount = incidents.filter((i) => i.geek_status === IncidentStatus.IN_PROGRESS).length
  const resolvedCount = incidents.filter((i) => i.geek_status === IncidentStatus.RESOLVED).length
  const closedCount = incidents.filter((i) => i.geek_status === IncidentStatus.CLOSED).length
  const onHoldCount = incidents.filter((i) => i.geek_status === (100000002 as typeof IncidentStatus.NEW)).length
  const totalActive = newCount + inProgressCount + onHoldCount

  // 未割当インシデント
  const unassigned = incidents.filter(
    (i) => !i._geek_assignedtoid_value &&
      i.geek_status !== IncidentStatus.CLOSED &&
      i.geek_status !== IncidentStatus.RESOLVED,
  )

  // 直近 5 件
  const recentIncidents = incidents.slice(0, 5)

  // カテゴリ別集計
  const categoryStats = useMemo(() => {
    const map = new Map<string, number>()
    incidents.forEach((i) => {
      const catId = i._geek_incidentcategoryid_value as string | undefined
      const name = catId ? categoryMap.get(catId) || "未分類" : "未分類"
      map.set(name, (map.get(name) || 0) + 1)
    })
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
  }, [incidents, categoryMap])

  const stats = [
    { title: "合計", value: String(incidents.length), description: "全インシデント", icon: BarChart3, className: "text-primary" },
    { title: "新規", value: String(newCount), description: "未対応", icon: AlertCircle, className: "text-blue-600" },
    { title: "対応中", value: String(inProgressCount), description: "作業中", icon: Clock, className: "text-yellow-600" },
    { title: "解決済", value: String(resolvedCount), description: "解決済み", icon: CheckCircle2, className: "text-green-600" },
    { title: "クローズ", value: String(closedCount), description: "完了", icon: XCircle, className: "text-gray-600" },
  ]

  const recentColumns: TableColumn<IncidentRow>[] = [
    { key: "geek_name", label: "タイトル", sortable: false },
    {
      key: "geek_status", label: "ステータス", sortable: false,
      render: (item) => {
        const s = item.geek_status as number | undefined
        return s != null ? (
          <Badge variant="outline" className={statusColors[s]}>{statusLabels[s]}</Badge>
        ) : null
      },
    },
    {
      key: "geek_priority", label: "優先度", sortable: false,
      render: (item) => {
        const p = item.geek_priority as number | undefined
        return p != null ? (
          <Badge variant="outline" className={priorityColors[p]}>{priorityLabels[p]}</Badge>
        ) : null
      },
    },
    {
      key: "_geek_assignedtoid_value", label: "担当者", sortable: false,
      render: (item) => {
        const v = item._geek_assignedtoid_value as string | undefined
        return v ? userMap.get(v) || "" : <span className="text-muted-foreground">未割当</span>
      },
    },
  ]

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 統計カード */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {stats.map((s) => (
          <Card key={s.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{s.title}</CardTitle>
              <s.icon className={`h-4 w-4 ${s.className}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{s.value}</div>
              <p className="text-xs text-muted-foreground">{s.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 中段: ステータス分布 + カテゴリ分布 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* ステータス分布 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">ステータス分布</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { label: "新規", count: newCount, color: "bg-blue-500", total: incidents.length },
              { label: "対応中", count: inProgressCount, color: "bg-yellow-500", total: incidents.length },
              { label: "保留", count: onHoldCount, color: "bg-gray-400", total: incidents.length },
              { label: "解決済", count: resolvedCount, color: "bg-green-500", total: incidents.length },
              { label: "クローズ", count: closedCount, color: "bg-gray-600", total: incidents.length },
            ].map((s) => (
              <div key={s.label} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span>{s.label}</span>
                  <span className="text-muted-foreground">{s.count} 件 ({incidents.length > 0 ? Math.round((s.count / incidents.length) * 100) : 0}%)</span>
                </div>
                <Progress
                  value={incidents.length > 0 ? (s.count / incidents.length) * 100 : 0}
                  className="h-2"
                />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* カテゴリ別集計 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">カテゴリ別 Top 5</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {categoryStats.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">データがありません</p>
            ) : (
              categoryStats.map(([name, count]) => (
                <div key={name} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span>{name}</span>
                    <span className="text-muted-foreground">{count} 件</span>
                  </div>
                  <Progress
                    value={incidents.length > 0 ? (count / incidents.length) * 100 : 0}
                    className="h-2"
                  />
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* アラート: 未割当 */}
      {unassigned.length > 0 && (
        <Card className="border-orange-200 dark:border-orange-800">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <UserX className="h-5 w-5 text-orange-500" />
              <CardTitle className="text-base">未割当インシデント ({unassigned.length} 件)</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {unassigned.slice(0, 8).map((i) => (
                <Badge
                  key={i.geek_incidentid}
                  variant="outline"
                  className="cursor-pointer hover:bg-accent"
                  onClick={() => navigate(`/incidents/${i.geek_incidentid}`)}
                >
                  {i.geek_name}
                </Badge>
              ))}
              {unassigned.length > 8 && (
                <Badge variant="secondary">+{unassigned.length - 8} 件</Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* アクティブインシデント数ハイライト */}
      {totalActive > 0 && (
        <Card className="border-yellow-200 dark:border-yellow-800">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              <CardTitle className="text-base">アクティブなインシデント: {totalActive} 件</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              新規 {newCount} 件 + 対応中 {inProgressCount} 件 + 保留 {onHoldCount} 件が未完了です。
            </p>
          </CardContent>
        </Card>
      )}

      {/* 直近のインシデント */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">直近のインシデント</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => navigate("/incidents")}>
            すべて表示 <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </CardHeader>
        <CardContent>
          <ListTable
            data={recentIncidents as IncidentRow[]}
            columns={recentColumns}
            onRowClick={(item) => navigate(`/incidents/${item.geek_incidentid}`)}
            emptyMessage="インシデントはまだありません"
            searchable={false}
            itemsPerPage={5}
          />
        </CardContent>
      </Card>
    </div>
  )
}
