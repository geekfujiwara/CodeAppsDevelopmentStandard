import { useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { LoadingSkeletonList } from "@/components/loading-skeleton"
import { useVehicles, useRoutes, useStops } from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX, FEATURE_REPORTS } from "@/config"
import {
  STOP_DELIVERED,
  STOP_ABSENT,
  STOP_RETURNED,
  STOP_HANDLED_STATUSES,
} from "@/types/dataverse"

const BAR_COLORS = ["#3b82f6", "#22c55e", "#f97316", "#8b5cf6", "#14b8a6", "#6b7280"]

function DisabledFeatureCard() {
  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <Card className="max-w-lg w-full">
        <CardHeader>
          <CardTitle>この機能は無効です</CardTitle>
          <CardDescription>
            レポートは現在無効になっています。有効にするには .env の{" "}
            <code className="bg-muted px-1 py-0.5 rounded text-sm">VITE_FEATURE_REPORTS=true</code>{" "}
            を設定してください。
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}

export default function ReportsPage() {
  if (!FEATURE_REPORTS) return <DisabledFeatureCard />
  return <ReportsContent />
}

function ReportsContent() {
  const { data: routes = [], isLoading } = useRoutes()
  const { data: stops = [] } = useStops()
  const { data: vehicles = [] } = useVehicles()
  const P = PUBLISHER_PREFIX
  const f = {
    id:          `${P}_delivery_routeid`,
    driver:      `${P}_driver`,
    vehicle_ref: `${P}_vehicle_ref`,
    route_date:  `${P}_route_date`,
  }
  const s = {
    route_ref: `${P}_route_ref`,
    status:    `${P}_status`,
  }
  const v = {
    id:   `${P}_vehicleid`,
    name: `${P}_name`,
  }

  /** 便ID → ドライバー / 車両 / 運行日 */
  const routeInfoMap = useMemo(() => {
    const map = new Map<string, { driver: string; vehicleRef: string; date: string }>()
    for (const r of routes) {
      map.set(String(r[f.id] ?? ""), {
        driver: (r[f.driver] as string) || "未設定",
        vehicleRef: String(r[f.vehicle_ref] ?? ""),
        date: String(r[f.route_date] ?? ""),
      })
    }
    return map
  }, [routes])

  /** ドライバー別配達実績 */
  const driverData = useMemo(() => {
    const map = new Map<string, { delivered: number; absent: number; returned: number; handled: number }>()
    for (const stop of stops) {
      const info = routeInfoMap.get(String(stop[s.route_ref] ?? ""))
      if (!info) continue
      const st = stop[s.status] as number
      if (!STOP_HANDLED_STATUSES.includes(st)) continue
      const entry = map.get(info.driver) ?? { delivered: 0, absent: 0, returned: 0, handled: 0 }
      entry.handled++
      if (st === STOP_DELIVERED) entry.delivered++
      if (st === STOP_ABSENT) entry.absent++
      if (st === STOP_RETURNED) entry.returned++
      map.set(info.driver, entry)
    }
    return [...map.entries()]
      .map(([driver, x]) => ({
        driver, ...x,
        rate: x.handled > 0 ? Math.round((x.delivered / x.handled) * 100) : 0,
      }))
      .sort((a, b) => b.handled - a.handled)
  }, [stops, routeInfoMap])

  /** 車両別運行数 */
  const vehicleData = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of routes) {
      const vehicleRef = String(r[f.vehicle_ref] ?? "")
      const vehicle = vehicles.find(x => String(x[v.id] ?? "") === vehicleRef)
      const name = vehicle ? String(vehicle[v.name] ?? "") : "未設定"
      map.set(name, (map.get(name) ?? 0) + 1)
    }
    return [...map.entries()]
      .map(([name, 運行数]) => ({ name, 運行数 }))
      .sort((a, b) => b.運行数 - a.運行数)
      .slice(0, 10)
  }, [routes, vehicles])

  /** 日別配達数（直近14日） */
  const dailyData = useMemo(() => {
    const map = new Map<string, number>()
    for (const stop of stops) {
      if ((stop[s.status] as number) !== STOP_DELIVERED) continue
      const info = routeInfoMap.get(String(stop[s.route_ref] ?? ""))
      if (!info?.date) continue
      map.set(info.date, (map.get(info.date) ?? 0) + 1)
    }
    return [...map.entries()]
      .map(([date, 配達数]) => ({ date: date.slice(5), 配達数, full: date }))
      .sort((a, b) => a.full.localeCompare(b.full))
      .slice(-14)
  }, [stops, routeInfoMap])

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">レポート</h1>
        <LoadingSkeletonList count={3} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">レポート</h1>
        <p className="text-sm text-muted-foreground mt-1">配送統計（クライアント集計）</p>
      </div>

      {/* ドライバー別配達実績 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">ドライバー別配達実績</CardTitle>
          <CardDescription>対応済み（配達完了・不在・持ち戻り）の配送先を集計</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ドライバー</TableHead>
                  <TableHead className="text-right">対応数</TableHead>
                  <TableHead className="text-right">配達完了</TableHead>
                  <TableHead className="text-right">不在</TableHead>
                  <TableHead className="text-right">持ち戻り</TableHead>
                  <TableHead className="text-right">成功率</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {driverData.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">対応済みの配送先がありません</TableCell></TableRow>
                ) : (
                  driverData.map((row, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{row.driver}</TableCell>
                      <TableCell className="text-right">{row.handled}</TableCell>
                      <TableCell className="text-right">{row.delivered}</TableCell>
                      <TableCell className="text-right">{row.absent}</TableCell>
                      <TableCell className={`text-right ${row.returned > 0 ? "font-semibold text-rose-600" : ""}`}>
                        {row.returned}
                      </TableCell>
                      <TableCell className="text-right">{row.rate}%</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* 車両別運行数 */}
      <Card>
        <CardHeader><CardTitle className="text-base">車両別運行数（上位10件）</CardTitle></CardHeader>
        <CardContent>
          {vehicleData.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">配送便がありません</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={vehicleData} layout="vertical" margin={{ left: 16, right: 16, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="運行数" radius={[0, 4, 4, 0]}>
                  {vehicleData.map((_, idx) => (
                    <Cell key={idx} fill={BAR_COLORS[idx % BAR_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* 日別配達数 */}
      <Card>
        <CardHeader><CardTitle className="text-base">日別配達完了数（直近14日）</CardTitle></CardHeader>
        <CardContent>
          {dailyData.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">配達完了の記録がありません</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={dailyData} margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="配達数" fill="#22c55e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
