import { useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { LoadingSkeletonGrid } from "@/components/loading-skeleton"
import { useRooms, useCleaningLogs } from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX } from "@/config"
import {
  ROOM_STATUS_LABEL, ROOM_STATUS_HEX, ROOM_STATUS_ORDER,
  ATTENTION_STATUSES, OCCUPIED_STATUS,
  TASK_TYPE_LABEL, RESULT_LABEL,
  type RoomStatus, type TaskType, type TaskResult,
} from "@/types/dataverse"
import { BrushCleaning, BedDouble, Wrench, Percent } from "lucide-react"
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts"

const P = PUBLISHER_PREFIX
const r = {
  id:     `${P}_roomid`,
  name:   `${P}_name`,
  floor:  `${P}_floor`,
  status: `${P}_status`,
}
const l = {
  room_ref:  `${P}_room_ref`,
  log_date:  `${P}_log_date`,
  task_type: `${P}_task_type`,
  staff:     `${P}_staff`,
  result:    `${P}_result`,
  name:      `${P}_name`,
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const { data: rooms = [], isLoading } = useRooms()
  const { data: logs = [] } = useCleaningLogs()

  const roomMap = useMemo(() => {
    const map = new Map<string, Record<string, unknown>>()
    for (const room of rooms) map.set(String(room[r.id] ?? ""), room)
    return map
  }, [rooms])

  const today = new Date().toISOString().slice(0, 10)

  const kpi = useMemo(() => {
    const total = rooms.length
    const attention = rooms.filter(x => ATTENTION_STATUSES.includes((x[r.status] as RoomStatus) ?? 100000000)).length
    const maintenance = rooms.filter(x => (x[r.status] as RoomStatus) === 100000005).length
    const occupied = rooms.filter(x => (x[r.status] as RoomStatus) === OCCUPIED_STATUS).length
    const occupancy = total > 0 ? Math.round((occupied / total) * 100) : 0
    const todayDone = logs.filter(x => String(x[l.log_date] ?? "") === today && (x[l.result] as TaskResult) === 100000000).length
    return { attention, maintenance, occupancy, todayDone }
  }, [rooms, logs, today])

  const statusChartData = useMemo(() => {
    const counts = new Map<RoomStatus, number>()
    for (const x of rooms) {
      const s = (x[r.status] as RoomStatus | null) ?? 100000000
      counts.set(s, (counts.get(s) ?? 0) + 1)
    }
    return ROOM_STATUS_ORDER
      .map(s => ({ name: ROOM_STATUS_LABEL[s], value: counts.get(s) ?? 0, color: ROOM_STATUS_HEX[s] }))
      .filter(d => d.value > 0)
  }, [rooms])

  const floorChartData = useMemo(() => {
    const byFloor = new Map<number, Record<string, number>>()
    for (const x of rooms) {
      const floor = Number(x[r.floor] ?? 0)
      const s = (x[r.status] as RoomStatus | null) ?? 100000000
      const row = byFloor.get(floor) ?? {}
      const key = ROOM_STATUS_LABEL[s]
      row[key] = (row[key] ?? 0) + 1
      byFloor.set(floor, row)
    }
    return [...byFloor.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([floor, row]) => ({ name: `${floor}F`, ...row }))
  }, [rooms])

  const recentLogs = useMemo(() => {
    return logs
      .slice()
      .sort((a, b) => String(b[l.log_date] ?? "").localeCompare(String(a[l.log_date] ?? "")))
      .slice(0, 6)
  }, [logs])

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">ダッシュボード</h1>
          <p className="text-muted-foreground text-sm mt-1">客室・清掃状況の概要</p>
        </div>
        <LoadingSkeletonGrid columns={4} count={4} variant="compact" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">ダッシュボード</h1>
        <p className="text-muted-foreground text-sm mt-1">客室・清掃状況の概要</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate("/board")}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">要対応（清掃/点検待ち）</p>
                <p className="text-3xl font-bold text-amber-600">{kpi.attention}</p>
              </div>
              <BrushCleaning className="h-10 w-10 text-amber-300" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">本日の清掃完了</p>
                <p className="text-3xl font-bold text-emerald-600">{kpi.todayDone}</p>
              </div>
              <BedDouble className="h-10 w-10 text-emerald-300" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">整備中</p>
                <p className="text-3xl font-bold text-rose-600">{kpi.maintenance}</p>
              </div>
              <Wrench className="h-10 w-10 text-rose-300" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">稼働率（滞在中）</p>
                <p className="text-3xl font-bold text-blue-600">{kpi.occupancy}%</p>
              </div>
              <Percent className="h-10 w-10 text-blue-300" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>状況別 客室数</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={statusChartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ name, value }) => value > 0 ? `${name}: ${value}` : ""}
                >
                  {statusChartData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Legend />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>階別 状況内訳</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={floorChartData}>
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                {ROOM_STATUS_ORDER.map(s => (
                  <Bar key={s} dataKey={ROOM_STATUS_LABEL[s]} stackId="a" fill={ROOM_STATUS_HEX[s]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>直近の清掃・整備記録</CardTitle>
          <CardDescription>新しい順・上位6件</CardDescription>
        </CardHeader>
        <CardContent>
          {recentLogs.length === 0 ? (
            <p className="text-muted-foreground text-sm">記録がありません。客室ボードで状況を更新すると記録が作成されます</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">客室</th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">作業</th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">担当</th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">結果</th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">記録日</th>
                  </tr>
                </thead>
                <tbody>
                  {recentLogs.map((log, idx) => {
                    const room = roomMap.get(String(log[l.room_ref] ?? ""))
                    const result = (log[l.result] as TaskResult | null)
                    return (
                      <tr key={idx} className="border-b last:border-0">
                        <td className="py-2 px-2 font-medium tabular-nums">{String(room?.[r.name] ?? "—")}</td>
                        <td className="py-2 px-2">{log[l.task_type] != null ? TASK_TYPE_LABEL[log[l.task_type] as TaskType] : "—"}</td>
                        <td className="py-2 px-2 text-muted-foreground">{String(log[l.staff] ?? "—")}</td>
                        <td className="py-2 px-2">
                          <span className={result === 100000001 ? "text-rose-600 font-medium" : "text-emerald-600"}>
                            {result != null ? RESULT_LABEL[result] : "—"}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-muted-foreground tabular-nums">{String(log[l.log_date] ?? "")}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
