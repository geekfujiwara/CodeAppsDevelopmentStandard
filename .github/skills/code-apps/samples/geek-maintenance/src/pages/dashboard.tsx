import { useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { LoadingSkeletonGrid } from "@/components/loading-skeleton"
import { useEquipment, useWorkOrders } from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX } from "@/config"
import {
  EQUIPMENT_STATUS_LABEL,
  EQUIPMENT_STATUS_COLOR,
  WORK_ORDER_TYPE_LABEL,
  WORK_ORDER_STATUS_LABEL,
  WORK_ORDER_STATUS_COLOR,
  PRIORITY_LABEL,
  PRIORITY_COLOR,
} from "@/types/dataverse"
import { Wrench, AlertTriangle, ClipboardList, CalendarClock } from "lucide-react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts"

const P = PUBLISHER_PREFIX

const fe = {
  id:       `${P}_equipmentid`,
  name:     `${P}_name`,
  status:   `${P}_status`,
  category: `${P}_category`,
  location: `${P}_location`,
}

const fw = {
  id:        `${P}_work_orderid`,
  name:      `${P}_name`,
  type:      `${P}_work_type`,
  priority:  `${P}_priority`,
  status:    `${P}_status`,
  planned:   `${P}_planned_date`,
}

const EQUIPMENT_STATUS_CHART_COLORS: Record<number, string> = {
  100000000: "#22c55e",
  100000001: "#9ca3af",
  100000002: "#eab308",
  100000003: "#ef4444",
}

const WORK_TYPE_CHART_COLORS: Record<number, string> = {
  100000000: "#3b82f6",
  100000001: "#f97316",
  100000002: "#ef4444",
  100000003: "#9ca3af",
}

function WorkOrderTypeBadge({ type }: { type: number }) {
  const label = WORK_ORDER_TYPE_LABEL[type as keyof typeof WORK_ORDER_TYPE_LABEL] ?? String(type)
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
      {label}
    </span>
  )
}

function WorkOrderStatusBadge({ status }: { status: number }) {
  const label = WORK_ORDER_STATUS_LABEL[status as keyof typeof WORK_ORDER_STATUS_LABEL] ?? String(status)
  const color = WORK_ORDER_STATUS_COLOR[status as keyof typeof WORK_ORDER_STATUS_COLOR] ?? "bg-gray-100 text-gray-600"
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {label}
    </span>
  )
}

function PriorityBadge({ priority }: { priority: number }) {
  const label = PRIORITY_LABEL[priority as keyof typeof PRIORITY_LABEL] ?? String(priority)
  const color = PRIORITY_COLOR[priority as keyof typeof PRIORITY_COLOR] ?? "bg-gray-100 text-gray-600"
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {label}
    </span>
  )
}

export default function DashboardPage() {
  const { data: equipment = [], isLoading: equipLoading } = useEquipment()
  const { data: workOrders = [], isLoading: woLoading } = useWorkOrders()
  const isLoading = equipLoading || woLoading

  const now = new Date()
  const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  const kpi = useMemo(() => {
    const active = equipment.filter(e => e[fe.status] === 100000000).length
    const underRepair = equipment.filter(e => e[fe.status] === 100000002).length
    const openWorkOrders = workOrders.filter(w => w[fw.status] !== 100000002).length
    const thisWeek = workOrders.filter(w => {
      if (w[fw.status] === 100000002) return false
      const pd = w[fw.planned] as string | undefined
      if (!pd) return false
      const d = new Date(pd)
      return d >= now && d <= sevenDaysLater
    }).length
    return { active, underRepair, openWorkOrders, thisWeek }
  }, [equipment, workOrders, now, sevenDaysLater])

  const workTypeChartData = useMemo(() => {
    const counts: Record<number, number> = {
      100000000: 0, 100000001: 0, 100000002: 0, 100000003: 0,
    }
    workOrders.forEach(w => {
      const t = w[fw.type] as number
      if (t in counts) counts[t]++
    })
    return Object.entries(counts).map(([k, v]) => ({
      name: WORK_ORDER_TYPE_LABEL[Number(k) as keyof typeof WORK_ORDER_TYPE_LABEL],
      value: v,
      key: Number(k),
    }))
  }, [workOrders])

  const equipStatusChartData = useMemo(() => {
    const counts: Record<number, number> = {
      100000000: 0, 100000001: 0, 100000002: 0, 100000003: 0,
    }
    equipment.forEach(e => {
      const s = e[fe.status] as number
      if (s in counts) counts[s]++
    })
    return Object.entries(counts).map(([k, v]) => ({
      name: EQUIPMENT_STATUS_LABEL[Number(k) as keyof typeof EQUIPMENT_STATUS_LABEL],
      value: v,
      key: Number(k),
    })).filter(d => d.value > 0)
  }, [equipment])

  const recentWorkOrders = useMemo(() => {
    return [...workOrders]
      .filter(w => w[fw.planned])
      .sort((a, b) => {
        const da = new Date(a[fw.planned] as string).getTime()
        const db = new Date(b[fw.planned] as string).getTime()
        return da - db
      })
      .slice(0, 5)
  }, [workOrders])

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">ダッシュボード</h1>
          <p className="text-muted-foreground text-sm mt-1">設備保全状況の概要</p>
        </div>
        <LoadingSkeletonGrid columns={4} count={4} variant="compact" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">ダッシュボード</h1>
        <p className="text-muted-foreground text-sm mt-1">設備保全状況の概要</p>
      </div>

      {/* KPI カード */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">稼働中設備</p>
                <p className="text-3xl font-bold text-green-600">{kpi.active}</p>
              </div>
              <Wrench className="h-10 w-10 text-green-300" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">修理中設備</p>
                <p className="text-3xl font-bold text-orange-600">{kpi.underRepair}</p>
              </div>
              <AlertTriangle className="h-10 w-10 text-orange-300" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">未完了作業指示</p>
                <p className="text-3xl font-bold text-blue-600">{kpi.openWorkOrders}</p>
              </div>
              <ClipboardList className="h-10 w-10 text-blue-300" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">今週の予定作業</p>
                <p className="text-3xl font-bold text-yellow-600">{kpi.thisWeek}</p>
              </div>
              <CalendarClock className="h-10 w-10 text-yellow-300" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* グラフ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 作業種別棒グラフ */}
        <Card>
          <CardHeader>
            <CardTitle>作業種別ごとの件数</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={workTypeChartData} layout="vertical">
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="value" name="件数">
                  {workTypeChartData.map((entry) => (
                    <Cell key={entry.key} fill={WORK_TYPE_CHART_COLORS[entry.key] ?? "#6b7280"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* 設備ステータス別円グラフ */}
        <Card>
          <CardHeader>
            <CardTitle>設備ステータス別件数</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={equipStatusChartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ name, value }) => value > 0 ? `${name}: ${value}` : ""}
                >
                  {equipStatusChartData.map((entry) => (
                    <Cell key={entry.key} fill={EQUIPMENT_STATUS_CHART_COLORS[entry.key] ?? "#6b7280"} />
                  ))}
                </Pie>
                <Legend />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* 最近の作業指示 */}
      <Card>
        <CardHeader>
          <CardTitle>直近の作業指示</CardTitle>
          <CardDescription>予定日順（直近 5 件）</CardDescription>
        </CardHeader>
        <CardContent>
          {recentWorkOrders.length === 0 ? (
            <p className="text-muted-foreground text-sm">作業指示がありません</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">件名</th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">作業種別</th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">優先度</th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">ステータス</th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">予定日</th>
                  </tr>
                </thead>
                <tbody>
                  {recentWorkOrders.map((wo, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="py-2 px-2 font-medium">{String(wo[fw.name] ?? "")}</td>
                      <td className="py-2 px-2">
                        {wo[fw.type] != null && (
                          <WorkOrderTypeBadge type={wo[fw.type] as number} />
                        )}
                      </td>
                      <td className="py-2 px-2">
                        {wo[fw.priority] != null && (
                          <PriorityBadge priority={wo[fw.priority] as number} />
                        )}
                      </td>
                      <td className="py-2 px-2">
                        {wo[fw.status] != null && (
                          <WorkOrderStatusBadge status={wo[fw.status] as number} />
                        )}
                      </td>
                      <td className="py-2 px-2 text-muted-foreground">
                        {String(wo[fw.planned] ?? "")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
