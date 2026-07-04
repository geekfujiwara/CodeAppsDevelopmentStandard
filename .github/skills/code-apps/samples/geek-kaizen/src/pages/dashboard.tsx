import { useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { LoadingSkeletonGrid } from "@/components/loading-skeleton"
import { useSuggestions } from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX, FEATURE_VOTING } from "@/config"
import {
  SUGGESTION_STATUS_LABEL,
  SUGGESTION_STATUS_COLOR,
  STATUS_REVIEWING,
  STATUS_ADOPTED,
  STATUS_IMPLEMENTED,
  STATUS_DECLINED,
} from "@/types/dataverse"
import { Lightbulb, Hourglass, CheckCircle, Rocket } from "lucide-react"
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
  id:            `${P}_suggestionid`,
  name:          `${P}_name`,
  category:      `${P}_category`,
  proposer:      `${P}_proposer`,
  department:    `${P}_department`,
  status:        `${P}_status`,
  votes:         `${P}_votes`,
  proposed_date: `${P}_proposed_date`,
}

const STATUS_CHART_COLORS: Record<number, string> = {
  100000000: "#3b82f6",
  100000001: "#f97316",
  100000002: "#22c55e",
  100000003: "#14b8a6",
  100000004: "#9ca3af",
}

function StatusBadge({ status }: { status: number }) {
  const label = SUGGESTION_STATUS_LABEL[status as keyof typeof SUGGESTION_STATUS_LABEL] ?? String(status)
  const color = SUGGESTION_STATUS_COLOR[status as keyof typeof SUGGESTION_STATUS_COLOR] ?? "bg-gray-100 text-gray-600"
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {label}
    </span>
  )
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const { data: suggestions = [], isLoading } = useSuggestions()

  const now = new Date()
  const thisMonth = now.getMonth()
  const thisYear = now.getFullYear()

  const kpi = useMemo(() => {
    const monthProposals = suggestions.filter(s => {
      const d = s[f.proposed_date] as string | undefined
      if (!d) return false
      const date = new Date(d)
      return date.getMonth() === thisMonth && date.getFullYear() === thisYear
    }).length
    const reviewing = suggestions.filter(s => (s[f.status] as number) === STATUS_REVIEWING).length
    const implemented = suggestions.filter(s => (s[f.status] as number) === STATUS_IMPLEMENTED).length
    const adopted = suggestions.filter(s =>
      [STATUS_ADOPTED, STATUS_IMPLEMENTED].includes(s[f.status] as number)
    ).length
    const decided = adopted + suggestions.filter(s => (s[f.status] as number) === STATUS_DECLINED).length
    const adoptionRate = decided > 0 ? Math.round((adopted / decided) * 100) : 0
    return { monthProposals, reviewing, adoptionRate, implemented }
  }, [suggestions, thisMonth, thisYear])

  const categoryChartData = useMemo(() => {
    const map = new Map<string, number>()
    for (const s of suggestions) {
      const cat = (s[f.category] as string) || "未分類"
      map.set(cat, (map.get(cat) ?? 0) + 1)
    }
    return [...map.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
  }, [suggestions])

  const statusChartData = useMemo(() => {
    const counts: Record<number, number> = {
      100000000: 0, 100000001: 0, 100000002: 0, 100000003: 0, 100000004: 0,
    }
    suggestions.forEach(s => {
      const st = s[f.status] as number
      if (st in counts) counts[st]++
    })
    return Object.entries(counts)
      .map(([k, v]) => ({
        name: SUGGESTION_STATUS_LABEL[Number(k) as keyof typeof SUGGESTION_STATUS_LABEL],
        value: v,
        key: Number(k),
      }))
      .filter(d => d.value > 0)
  }, [suggestions])

  const topSuggestions = useMemo(() => {
    return [...suggestions]
      .sort((a, b) => {
        if (FEATURE_VOTING) {
          const diff = ((b[f.votes] as number) ?? 0) - ((a[f.votes] as number) ?? 0)
          if (diff !== 0) return diff
        }
        return String(b[f.proposed_date] ?? "").localeCompare(String(a[f.proposed_date] ?? ""))
      })
      .slice(0, 5)
  }, [suggestions])

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">ダッシュボード</h1>
          <p className="text-muted-foreground text-sm mt-1">改善提案の概要</p>
        </div>
        <LoadingSkeletonGrid columns={4} count={4} variant="compact" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">ダッシュボード</h1>
        <p className="text-muted-foreground text-sm mt-1">改善提案の概要</p>
      </div>

      {/* KPI カード */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">今月の提案</p>
                <p className="text-3xl font-bold text-blue-600">{kpi.monthProposals}</p>
              </div>
              <Lightbulb className="h-10 w-10 text-blue-300" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">検討中</p>
                <p className="text-3xl font-bold text-orange-600">{kpi.reviewing}</p>
              </div>
              <Hourglass className="h-10 w-10 text-orange-300" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">採用率</p>
                <p className="text-3xl font-bold text-green-600">{kpi.adoptionRate}%</p>
              </div>
              <CheckCircle className="h-10 w-10 text-green-300" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">実施済み（累計）</p>
                <p className="text-3xl font-bold text-teal-600">{kpi.implemented}</p>
              </div>
              <Rocket className="h-10 w-10 text-teal-300" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* グラフ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 分野別棒グラフ */}
        <Card>
          <CardHeader>
            <CardTitle>分野別提案件数</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={categoryChartData} layout="vertical">
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="value" name="件数" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* ステータス別円グラフ */}
        <Card>
          <CardHeader>
            <CardTitle>ステータス別件数</CardTitle>
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
                  {statusChartData.map((entry) => (
                    <Cell key={entry.key} fill={STATUS_CHART_COLORS[entry.key] ?? "#6b7280"} />
                  ))}
                </Pie>
                <Legend />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* 注目の提案 */}
      <Card>
        <CardHeader>
          <CardTitle>注目の提案</CardTitle>
          <CardDescription>
            {FEATURE_VOTING ? "いいねの多い順（上位5件）" : "提案日の新しい順（上位5件）"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {topSuggestions.length === 0 ? (
            <p className="text-muted-foreground text-sm">提案がありません</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">タイトル</th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">分野</th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">提案者</th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">ステータス</th>
                    {FEATURE_VOTING && <th className="text-right py-2 px-2 font-medium text-muted-foreground">いいね</th>}
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">提案日</th>
                  </tr>
                </thead>
                <tbody>
                  {topSuggestions.map((suggestion, idx) => (
                    <tr
                      key={idx}
                      className="border-b last:border-0 hover:bg-muted/30 cursor-pointer"
                      onClick={() => navigate("/board")}
                    >
                      <td className="py-2 px-2 font-medium">{String(suggestion[f.name] ?? "")}</td>
                      <td className="py-2 px-2 text-muted-foreground">{String(suggestion[f.category] ?? "")}</td>
                      <td className="py-2 px-2 text-muted-foreground">{String(suggestion[f.proposer] ?? "")}</td>
                      <td className="py-2 px-2">
                        {suggestion[f.status] != null && (
                          <StatusBadge status={suggestion[f.status] as number} />
                        )}
                      </td>
                      {FEATURE_VOTING && (
                        <td className="py-2 px-2 text-right">{(suggestion[f.votes] as number) ?? 0}</td>
                      )}
                      <td className="py-2 px-2 text-muted-foreground">
                        {String(suggestion[f.proposed_date] ?? "")}
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
