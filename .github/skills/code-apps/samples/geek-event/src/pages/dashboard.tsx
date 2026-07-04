import { useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { LoadingSkeletonGrid } from "@/components/loading-skeleton"
import { useEvents, useRegistrations } from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX } from "@/config"
import {
  EVENT_STATUS_LABEL,
  EVENT_STATUS_COLOR,
  EVENT_STATUS_CANCELLED,
  REGISTRATION_STATUS_LABEL,
  REGISTRATION_ATTENDED,
  REGISTRATION_CANCELLED,
} from "@/types/dataverse"
import { PartyPopper, CalendarDays, Users, Percent } from "lucide-react"
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
  id:         `${P}_eventid`,
  name:       `${P}_name`,
  category:   `${P}_category`,
  venue:      `${P}_venue`,
  status:     `${P}_status`,
  start_date: `${P}_start_date`,
  capacity:   `${P}_capacity`,
}

const r = {
  event_ref:       `${P}_event_ref`,
  status:          `${P}_status`,
  registered_date: `${P}_registered_date`,
}

const REG_CHART_COLORS: Record<number, string> = {
  100000000: "#3b82f6",
  100000001: "#22c55e",
  100000002: "#f97316",
  100000003: "#9ca3af",
}

function StatusBadge({ status }: { status: number }) {
  const label = EVENT_STATUS_LABEL[status as keyof typeof EVENT_STATUS_LABEL] ?? String(status)
  const color = EVENT_STATUS_COLOR[status as keyof typeof EVENT_STATUS_COLOR] ?? "bg-gray-100 text-gray-600"
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {label}
    </span>
  )
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const { data: events = [], isLoading } = useEvents()
  const { data: registrations = [] } = useRegistrations()

  const now = new Date()
  const thisMonth = now.getMonth()
  const thisYear = now.getFullYear()

  const kpi = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    const upcoming = events.filter(ev =>
      (ev[f.status] as number) !== EVENT_STATUS_CANCELLED &&
      !!ev[f.start_date] && String(ev[f.start_date]) >= today
    ).length
    const monthEvents = events.filter(ev => {
      const d = ev[f.start_date] as string | undefined
      if (!d) return false
      const date = new Date(d)
      return date.getMonth() === thisMonth && date.getFullYear() === thisYear
    }).length
    const activeRegs = registrations.filter(reg => (reg[r.status] as number) !== REGISTRATION_CANCELLED).length
    const attended = registrations.filter(reg => (reg[r.status] as number) === REGISTRATION_ATTENDED).length
    const attendRate = activeRegs > 0 ? Math.round((attended / activeRegs) * 100) : 0
    return { upcoming, monthEvents, activeRegs, attendRate }
  }, [events, registrations, thisMonth, thisYear])

  const categoryChartData = useMemo(() => {
    const map = new Map<string, number>()
    for (const ev of events) {
      const cat = (ev[f.category] as string) || "未分類"
      map.set(cat, (map.get(cat) ?? 0) + 1)
    }
    return [...map.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
  }, [events])

  const regChartData = useMemo(() => {
    const counts: Record<number, number> = {
      100000000: 0, 100000001: 0, 100000002: 0, 100000003: 0,
    }
    registrations.forEach(reg => {
      const s = reg[r.status] as number
      if (s in counts) counts[s]++
    })
    return Object.entries(counts)
      .map(([k, v]) => ({
        name: REGISTRATION_STATUS_LABEL[Number(k) as keyof typeof REGISTRATION_STATUS_LABEL],
        value: v,
        key: Number(k),
      }))
      .filter(d => d.value > 0)
  }, [registrations])

  const upcomingEvents = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return [...events]
      .sort((a, b) => {
        const aUp = String(a[f.start_date] ?? "") >= today ? 0 : 1
        const bUp = String(b[f.start_date] ?? "") >= today ? 0 : 1
        if (aUp !== bUp) return aUp - bUp
        return String(a[f.start_date] ?? "").localeCompare(String(b[f.start_date] ?? ""))
      })
      .slice(0, 5)
  }, [events])

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">ダッシュボード</h1>
          <p className="text-muted-foreground text-sm mt-1">イベント運営の概要</p>
        </div>
        <LoadingSkeletonGrid columns={4} count={4} variant="compact" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">ダッシュボード</h1>
        <p className="text-muted-foreground text-sm mt-1">イベント運営の概要</p>
      </div>

      {/* KPI カード */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">開催予定</p>
                <p className="text-3xl font-bold text-blue-600">{kpi.upcoming}</p>
              </div>
              <PartyPopper className="h-10 w-10 text-blue-300" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">今月の開催</p>
                <p className="text-3xl font-bold text-indigo-600">{kpi.monthEvents}</p>
              </div>
              <CalendarDays className="h-10 w-10 text-indigo-300" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">参加登録（有効）</p>
                <p className="text-3xl font-bold text-green-600">{kpi.activeRegs}</p>
              </div>
              <Users className="h-10 w-10 text-green-300" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">出席率</p>
                <p className="text-3xl font-bold text-purple-600">{kpi.attendRate}%</p>
              </div>
              <Percent className="h-10 w-10 text-purple-300" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* グラフ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 分野別棒グラフ */}
        <Card>
          <CardHeader>
            <CardTitle>分野別イベント数</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={categoryChartData} layout="vertical">
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="value" name="件数" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* 登録ステータス円グラフ */}
        <Card>
          <CardHeader>
            <CardTitle>参加登録ステータス別件数</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={regChartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ name, value }) => value > 0 ? `${name}: ${value}` : ""}
                >
                  {regChartData.map((entry) => (
                    <Cell key={entry.key} fill={REG_CHART_COLORS[entry.key] ?? "#6b7280"} />
                  ))}
                </Pie>
                <Legend />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* 開催予定のイベント */}
      <Card>
        <CardHeader>
          <CardTitle>開催予定のイベント</CardTitle>
          <CardDescription>開催日の近い順（上位5件）</CardDescription>
        </CardHeader>
        <CardContent>
          {upcomingEvents.length === 0 ? (
            <p className="text-muted-foreground text-sm">イベントがありません</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">イベント名</th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">分野</th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">会場</th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">ステータス</th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">開催日</th>
                    <th className="text-right py-2 px-2 font-medium text-muted-foreground">定員</th>
                  </tr>
                </thead>
                <tbody>
                  {upcomingEvents.map((event, idx) => (
                    <tr
                      key={idx}
                      className="border-b last:border-0 hover:bg-muted/30 cursor-pointer"
                      onClick={() => navigate(`/events/${String(event[f.id] ?? "")}`)}
                    >
                      <td className="py-2 px-2 font-medium">{String(event[f.name] ?? "")}</td>
                      <td className="py-2 px-2 text-muted-foreground">{String(event[f.category] ?? "")}</td>
                      <td className="py-2 px-2 text-muted-foreground">{String(event[f.venue] ?? "")}</td>
                      <td className="py-2 px-2">
                        {event[f.status] != null && (
                          <StatusBadge status={event[f.status] as number} />
                        )}
                      </td>
                      <td className="py-2 px-2 text-muted-foreground">{String(event[f.start_date] ?? "")}</td>
                      <td className="py-2 px-2 text-right">{String(event[f.capacity] ?? "")}</td>
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
