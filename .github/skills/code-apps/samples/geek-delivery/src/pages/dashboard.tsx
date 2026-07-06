import { useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { LoadingSkeletonGrid } from "@/components/loading-skeleton"
import { useVehicles, useRoutes, useStops } from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX, INSPECTION_WARNING_DAYS } from "@/config"
import {
  ROUTE_STATUS_LABEL,
  ROUTE_STATUS_COLOR,
  ROUTE_COMPLETED,
  STOP_STATUS_LABEL,
  STOP_DELIVERED,
  STOP_ABSENT,
  STOP_RETURNED,
  STOP_HANDLED_STATUSES,
  VEHICLE_STATUS_LABEL,
} from "@/types/dataverse"
import { Route, PackageCheck, DoorClosed, Wrench } from "lucide-react"
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

const f = {
  id:          `${P}_delivery_routeid`,
  name:        `${P}_name`,
  vehicle_ref: `${P}_vehicle_ref`,
  driver:      `${P}_driver`,
  status:      `${P}_status`,
  route_date:  `${P}_route_date`,
}

const s = {
  route_ref: `${P}_route_ref`,
  status:    `${P}_status`,
}

const v = {
  id:             `${P}_vehicleid`,
  name:           `${P}_name`,
  status:         `${P}_status`,
  inspection_due: `${P}_inspection_due`,
}

const STOP_CHART_COLORS: Record<number, string> = {
  100000000: "#9ca3af",
  100000001: "#22c55e",
  100000002: "#f97316",
  100000003: "#ef4444",
}

function RouteStatusBadge({ status }: { status: number }) {
  const label = ROUTE_STATUS_LABEL[status as keyof typeof ROUTE_STATUS_LABEL] ?? String(status)
  const color = ROUTE_STATUS_COLOR[status as keyof typeof ROUTE_STATUS_COLOR] ?? "bg-gray-100 text-gray-600"
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {label}
    </span>
  )
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const { data: routes = [], isLoading } = useRoutes()
  const { data: stops = [] } = useStops()
  const { data: vehicles = [] } = useVehicles()

  const vehicleNameMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const vehicle of vehicles) {
      map.set(String(vehicle[v.id] ?? ""), String(vehicle[v.name] ?? ""))
    }
    return map
  }, [vehicles])

  const kpi = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    const todayRoutes = routes.filter(r => String(r[f.route_date] ?? "") === today)
    const todayRouteIds = new Set(todayRoutes.map(r => String(r[f.id] ?? "")))
    const todayStops = stops.filter(stop => todayRouteIds.has(String(stop[s.route_ref] ?? "")))
    const delivered = todayStops.filter(stop => (stop[s.status] as number) === STOP_DELIVERED).length
    const handled = todayStops.filter(stop => STOP_HANDLED_STATUSES.includes(stop[s.status] as number)).length
    const deliveryRate = handled > 0 ? Math.round((delivered / handled) * 100) : 0
    const problems = todayStops.filter(stop =>
      [STOP_ABSENT, STOP_RETURNED].includes(stop[s.status] as number)
    ).length

    const soon = new Date()
    soon.setDate(soon.getDate() + INSPECTION_WARNING_DAYS)
    const soonStr = soon.toISOString().slice(0, 10)
    const inspectionSoon = vehicles.filter(vehicle => {
      const due = vehicle[v.inspection_due] as string | undefined
      return !!due && due <= soonStr
    }).length

    return { todayRoutes: todayRoutes.length, deliveryRate, problems, inspectionSoon }
  }, [routes, stops, vehicles])

  const stopChartData = useMemo(() => {
    const counts: Record<number, number> = {
      100000000: 0, 100000001: 0, 100000002: 0, 100000003: 0,
    }
    stops.forEach(stop => {
      const st = stop[s.status] as number
      if (st in counts) counts[st]++
    })
    return Object.entries(counts)
      .map(([k, val]) => ({
        name: STOP_STATUS_LABEL[Number(k) as keyof typeof STOP_STATUS_LABEL],
        value: val,
        key: Number(k),
      }))
      .filter(d => d.value > 0)
  }, [stops])

  const vehicleChartData = useMemo(() => {
    const map = new Map<string, number>()
    for (const vehicle of vehicles) {
      const st = vehicle[v.status] as number | undefined
      const label = st != null
        ? VEHICLE_STATUS_LABEL[st as keyof typeof VEHICLE_STATUS_LABEL] ?? "不明"
        : "不明"
      map.set(label, (map.get(label) ?? 0) + 1)
    }
    return [...map.entries()].map(([name, value]) => ({ name, value }))
  }, [vehicles])

  const recentRoutes = useMemo(() => {
    return [...routes]
      .sort((a, b) => {
        const aOpen = (a[f.status] as number) !== ROUTE_COMPLETED ? 0 : 1
        const bOpen = (b[f.status] as number) !== ROUTE_COMPLETED ? 0 : 1
        if (aOpen !== bOpen) return aOpen - bOpen
        return String(b[f.route_date] ?? "").localeCompare(String(a[f.route_date] ?? ""))
      })
      .slice(0, 5)
  }, [routes])

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">ダッシュボード</h1>
          <p className="text-muted-foreground text-sm mt-1">配送状況の概要</p>
        </div>
        <LoadingSkeletonGrid columns={4} count={4} variant="compact" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">ダッシュボード</h1>
        <p className="text-muted-foreground text-sm mt-1">配送状況の概要</p>
      </div>

      {/* KPI カード */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">本日の運行便</p>
                <p className="text-3xl font-bold text-blue-600">{kpi.todayRoutes}</p>
              </div>
              <Route className="h-10 w-10 text-blue-300" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">本日の配達成功率</p>
                <p className="text-3xl font-bold text-green-600">{kpi.deliveryRate}%</p>
              </div>
              <PackageCheck className="h-10 w-10 text-green-300" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">本日の不在・持ち戻り</p>
                <p className="text-3xl font-bold text-orange-600">{kpi.problems}</p>
              </div>
              <DoorClosed className="h-10 w-10 text-orange-300" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">点検期限間近（{INSPECTION_WARNING_DAYS}日以内）</p>
                <p className="text-3xl font-bold text-red-600">{kpi.inspectionSoon}</p>
              </div>
              <Wrench className="h-10 w-10 text-red-300" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* グラフ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 配達ステータス円グラフ */}
        <Card>
          <CardHeader>
            <CardTitle>配達ステータス別件数（全期間）</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={stopChartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ name, value }) => value > 0 ? `${name}: ${value}` : ""}
                >
                  {stopChartData.map((entry) => (
                    <Cell key={entry.key} fill={STOP_CHART_COLORS[entry.key] ?? "#6b7280"} />
                  ))}
                </Pie>
                <Legend />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* 車両稼働状況 */}
        <Card>
          <CardHeader>
            <CardTitle>車両稼働状況</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={vehicleChartData} layout="vertical">
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="value" name="台数" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* 直近の配送便 */}
      <Card>
        <CardHeader>
          <CardTitle>直近の配送便</CardTitle>
          <CardDescription>未完了優先・運行日の新しい順（上位5件）</CardDescription>
        </CardHeader>
        <CardContent>
          {recentRoutes.length === 0 ? (
            <p className="text-muted-foreground text-sm">配送便がありません</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">便名</th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">車両</th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">ドライバー</th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">ステータス</th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">運行日</th>
                  </tr>
                </thead>
                <tbody>
                  {recentRoutes.map((route, idx) => (
                    <tr
                      key={idx}
                      className="border-b last:border-0 hover:bg-muted/30 cursor-pointer"
                      onClick={() => navigate(`/routes/${String(route[f.id] ?? "")}`)}
                    >
                      <td className="py-2 px-2 font-medium">{String(route[f.name] ?? "")}</td>
                      <td className="py-2 px-2 text-muted-foreground">
                        {vehicleNameMap.get(String(route[f.vehicle_ref] ?? "")) || "—"}
                      </td>
                      <td className="py-2 px-2 text-muted-foreground">{String(route[f.driver] ?? "")}</td>
                      <td className="py-2 px-2">
                        {route[f.status] != null && (
                          <RouteStatusBadge status={route[f.status] as number} />
                        )}
                      </td>
                      <td className="py-2 px-2 text-muted-foreground">{String(route[f.route_date] ?? "")}</td>
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
