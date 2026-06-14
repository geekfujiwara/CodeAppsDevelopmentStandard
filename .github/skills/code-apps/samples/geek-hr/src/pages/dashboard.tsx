import { useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { LoadingSkeletonGrid } from "@/components/loading-skeleton"
import { useEmployees, useRecruitments, useEvaluations } from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX, FEATURE_RECRUITMENT, FEATURE_EVALUATION } from "@/config"
import {
  EMPLOYEE_STATUS_LABEL,
  EMPLOYEE_STATUS_COLOR,
  EMPLOYMENT_TYPE_LABEL,
  type EmployeeStatus,
  type EmploymentType,
  RECRUITMENT_STATUS,
} from "@/types/dataverse"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
  ResponsiveContainer,
} from "recharts"
import { Users, UserPlus, UserCheck, Star } from "lucide-react"

const CHART_COLORS = ["#14b8a6", "#0ea5e9", "#8b5cf6", "#f59e0b", "#f87171", "#34d399", "#60a5fa"]

export default function Dashboard() {
  const { data: employees = [], isLoading: empLoading } = useEmployees()
  const { data: recruitments = [], isLoading: recLoading } = useRecruitments()
  const { data: evaluations = [], isLoading: evalLoading } = useEvaluations()

  const P = PUBLISHER_PREFIX
  const f = {
    status:          `${P}_status`,
    hire_date:       `${P}_hire_date`,
    department:      `${P}_department`,
    employment_type: `${P}_employment_type`,
    name:            `${P}_name`,
  }
  const rf = { status: `${P}_status` }

  const now = new Date()
  const thisMonth = now.getMonth()
  const thisYear  = now.getFullYear()

  const stats = useMemo(() => {
    const active = employees.filter((e) => (e[f.status] as number) === 100000000)
    const thisMonthHires = employees.filter((e) => {
      const d = new Date((e[f.hire_date] as string) || "")
      return d.getFullYear() === thisYear && d.getMonth() === thisMonth
    })
    const openPositions = recruitments.filter((r) => {
      const s = r[rf.status] as number
      return s === RECRUITMENT_STATUS.OPEN || s === RECRUITMENT_STATUS.SCREENING
    })
    const thisTermEvals = evaluations.length
    return {
      totalActive: active.length,
      thisMonthHires: thisMonthHires.length,
      openPositions: openPositions.length,
      evaluations: thisTermEvals,
    }
  }, [employees, recruitments, evaluations, f, rf, thisMonth, thisYear])

  const deptData = useMemo(() => {
    const counts: Record<string, number> = {}
    employees
      .filter((e) => (e[f.status] as number) === 100000000)
      .forEach((e) => {
        const dept = (e[f.department] as string) || "未設定"
        counts[dept] = (counts[dept] ?? 0) + 1
      })
    return Object.entries(counts)
      .map(([dept, 人数]) => ({ name: dept, 人数 }))
      .sort((a, b) => b.人数 - a.人数)
  }, [employees, f])

  const typeData = useMemo(() => {
    const counts: Record<number, number> = {}
    employees
      .filter((e) => (e[f.status] as number) === 100000000)
      .forEach((e) => {
        const t = (e[f.employment_type] as number) ?? 100000000
        counts[t] = (counts[t] ?? 0) + 1
      })
    return Object.entries(EMPLOYMENT_TYPE_LABEL)
      .map(([value, label]) => ({ name: label, value: counts[Number(value)] ?? 0 }))
      .filter((d) => d.value > 0)
  }, [employees, f])

  const recentHires = useMemo(
    () => [...employees]
      .sort((a, b) => new Date(b[f.hire_date] as string || "").getTime() - new Date(a[f.hire_date] as string || "").getTime())
      .slice(0, 5),
    [employees, f]
  )

  const isLoading = empLoading || recLoading || evalLoading

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">ダッシュボード</h1>
        <LoadingSkeletonGrid columns={4} count={4} variant="compact" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">ダッシュボード</h1>

      {/* KPI カード */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4" />
              総社員数（在籍）
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.totalActive}<span className="text-sm font-normal text-muted-foreground ml-1">名</span></p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <UserPlus className="h-4 w-4" />
              今月入社
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-teal-600">{stats.thisMonthHires}<span className="text-sm font-normal text-muted-foreground ml-1">名</span></p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <UserCheck className="h-4 w-4" />
              採用中ポジション
            </CardTitle>
          </CardHeader>
          <CardContent>
            {FEATURE_RECRUITMENT ? (
              <p className="text-2xl font-bold text-yellow-600">{stats.openPositions}<span className="text-sm font-normal text-muted-foreground ml-1">件</span></p>
            ) : (
              <p className="text-2xl font-bold text-muted-foreground">—</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Star className="h-4 w-4" />
              評価レコード数
            </CardTitle>
          </CardHeader>
          <CardContent>
            {FEATURE_EVALUATION ? (
              <p className="text-2xl font-bold">{stats.evaluations}<span className="text-sm font-normal text-muted-foreground ml-1">件</span></p>
            ) : (
              <p className="text-2xl font-bold text-muted-foreground">—</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* チャート行 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>部門別人数（在籍中）</CardTitle>
          </CardHeader>
          <CardContent>
            {deptData.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-8">データがありません</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={deptData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="人数" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>雇用形態別構成（在籍中）</CardTitle>
          </CardHeader>
          <CardContent>
            {typeData.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-8">データがありません</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={typeData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={3}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {typeData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 最近の入社 */}
      <Card>
        <CardHeader>
          <CardTitle>最近の入社（直近5名）</CardTitle>
        </CardHeader>
        <CardContent>
          {recentHires.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-4">社員データがありません</p>
          ) : (
            <div className="divide-y divide-border">
              {recentHires.map((emp, idx) => {
                const status = (emp[f.status] as EmployeeStatus) ?? 100000000
                const type   = emp[f.employment_type] as EmploymentType
                const name   = (emp[f.name] as string) ?? "—"
                const dept   = (emp[f.department] as string) ?? "—"
                const hired  = (emp[f.hire_date] as string)?.slice(0, 10) ?? "—"
                return (
                  <div key={idx} className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${EMPLOYEE_STATUS_COLOR[status]}`}>
                        {EMPLOYEE_STATUS_LABEL[status]}
                      </span>
                      <div>
                        <p className="text-sm font-medium">{name}</p>
                        <p className="text-xs text-muted-foreground">{dept}{type != null ? ` · ${EMPLOYMENT_TYPE_LABEL[type]}` : ""}</p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">{hired} 入社</p>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
