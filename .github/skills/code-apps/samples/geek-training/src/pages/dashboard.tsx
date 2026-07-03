import { useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { LoadingSkeletonGrid } from "@/components/loading-skeleton"
import { useCourses, useEnrollments } from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX } from "@/config"
import {
  COURSE_STATUS_LABEL,
  COURSE_STATUS_COLOR,
  COURSE_STATUS_OPEN,
  COURSE_FORMAT_LABEL,
  ENROLLMENT_STATUS_LABEL,
  ENROLLMENT_COMPLETED,
  ENROLLMENT_CANCELLED,
} from "@/types/dataverse"
import { GraduationCap, Users, Award, Percent } from "lucide-react"
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
  id:         `${P}_courseid`,
  name:       `${P}_name`,
  category:   `${P}_category`,
  format:     `${P}_format`,
  status:     `${P}_status`,
  start_date: `${P}_start_date`,
  capacity:   `${P}_capacity`,
}

const e = {
  name:          `${P}_name`,
  course_ref:    `${P}_course_ref`,
  status:        `${P}_status`,
  enrolled_date: `${P}_enrolled_date`,
}

const ENROLL_CHART_COLORS: Record<number, string> = {
  100000000: "#3b82f6",
  100000001: "#f97316",
  100000002: "#22c55e",
  100000003: "#9ca3af",
}

function CourseStatusBadge({ status }: { status: number }) {
  const label = COURSE_STATUS_LABEL[status as keyof typeof COURSE_STATUS_LABEL] ?? String(status)
  const color = COURSE_STATUS_COLOR[status as keyof typeof COURSE_STATUS_COLOR] ?? "bg-gray-100 text-gray-600"
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {label}
    </span>
  )
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const { data: courses = [], isLoading } = useCourses()
  const { data: enrollments = [] } = useEnrollments()

  const now = new Date()
  const thisMonth = now.getMonth()
  const thisYear = now.getFullYear()

  const kpi = useMemo(() => {
    const openCourses = courses.filter(c => (c[f.status] as number) === COURSE_STATUS_OPEN).length
    const monthEnrollments = enrollments.filter(en => {
      const d = en[e.enrolled_date] as string | undefined
      if (!d) return false
      const date = new Date(d)
      return date.getMonth() === thisMonth && date.getFullYear() === thisYear
    }).length
    const completed = enrollments.filter(en => (en[e.status] as number) === ENROLLMENT_COMPLETED).length
    const valid = enrollments.filter(en => (en[e.status] as number) !== ENROLLMENT_CANCELLED).length
    const completionRate = valid > 0 ? Math.round((completed / valid) * 100) : 0
    return { openCourses, monthEnrollments, completed, completionRate }
  }, [courses, enrollments, thisMonth, thisYear])

  const categoryChartData = useMemo(() => {
    const map = new Map<string, number>()
    for (const course of courses) {
      const cat = (course[f.category] as string) || "未分類"
      map.set(cat, (map.get(cat) ?? 0) + 1)
    }
    return [...map.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
  }, [courses])

  const enrollChartData = useMemo(() => {
    const counts: Record<number, number> = {
      100000000: 0, 100000001: 0, 100000002: 0, 100000003: 0,
    }
    enrollments.forEach(en => {
      const s = en[e.status] as number
      if (s in counts) counts[s]++
    })
    return Object.entries(counts)
      .map(([k, v]) => ({
        name: ENROLLMENT_STATUS_LABEL[Number(k) as keyof typeof ENROLLMENT_STATUS_LABEL],
        value: v,
        key: Number(k),
      }))
      .filter(d => d.value > 0)
  }, [enrollments])

  const upcomingCourses = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return [...courses]
      .sort((a, b) => {
        const aUp = String(a[f.start_date] ?? "") >= today ? 0 : 1
        const bUp = String(b[f.start_date] ?? "") >= today ? 0 : 1
        if (aUp !== bUp) return aUp - bUp
        return String(a[f.start_date] ?? "").localeCompare(String(b[f.start_date] ?? ""))
      })
      .slice(0, 5)
  }, [courses])

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">ダッシュボード</h1>
          <p className="text-muted-foreground text-sm mt-1">研修・受講状況の概要</p>
        </div>
        <LoadingSkeletonGrid columns={4} count={4} variant="compact" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">ダッシュボード</h1>
        <p className="text-muted-foreground text-sm mt-1">研修・受講状況の概要</p>
      </div>

      {/* KPI カード */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">募集中のコース</p>
                <p className="text-3xl font-bold text-blue-600">{kpi.openCourses}</p>
              </div>
              <GraduationCap className="h-10 w-10 text-blue-300" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">今月の申込</p>
                <p className="text-3xl font-bold text-indigo-600">{kpi.monthEnrollments}</p>
              </div>
              <Users className="h-10 w-10 text-indigo-300" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">修了者数（累計）</p>
                <p className="text-3xl font-bold text-green-600">{kpi.completed}</p>
              </div>
              <Award className="h-10 w-10 text-green-300" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">修了率</p>
                <p className="text-3xl font-bold text-purple-600">{kpi.completionRate}%</p>
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
            <CardTitle>分野別コース数</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={categoryChartData} layout="vertical">
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="value" name="コース数" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* 受講ステータス円グラフ */}
        <Card>
          <CardHeader>
            <CardTitle>受講ステータス別件数</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={enrollChartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ name, value }) => value > 0 ? `${name}: ${value}` : ""}
                >
                  {enrollChartData.map((entry) => (
                    <Cell key={entry.key} fill={ENROLL_CHART_COLORS[entry.key] ?? "#6b7280"} />
                  ))}
                </Pie>
                <Legend />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* 開催予定のコース */}
      <Card>
        <CardHeader>
          <CardTitle>開催予定のコース</CardTitle>
          <CardDescription>開催日の近い順（上位5件）</CardDescription>
        </CardHeader>
        <CardContent>
          {upcomingCourses.length === 0 ? (
            <p className="text-muted-foreground text-sm">コースがありません</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">コース名</th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">分野</th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">形式</th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">ステータス</th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">開催日</th>
                    <th className="text-right py-2 px-2 font-medium text-muted-foreground">定員</th>
                  </tr>
                </thead>
                <tbody>
                  {upcomingCourses.map((course, idx) => (
                    <tr
                      key={idx}
                      className="border-b last:border-0 hover:bg-muted/30 cursor-pointer"
                      onClick={() => navigate(`/courses/${String(course[f.id] ?? "")}`)}
                    >
                      <td className="py-2 px-2 font-medium">{String(course[f.name] ?? "")}</td>
                      <td className="py-2 px-2 text-muted-foreground">{String(course[f.category] ?? "")}</td>
                      <td className="py-2 px-2 text-muted-foreground">
                        {course[f.format] != null
                          ? COURSE_FORMAT_LABEL[course[f.format] as keyof typeof COURSE_FORMAT_LABEL] ?? ""
                          : ""}
                      </td>
                      <td className="py-2 px-2">
                        {course[f.status] != null && (
                          <CourseStatusBadge status={course[f.status] as number} />
                        )}
                      </td>
                      <td className="py-2 px-2 text-muted-foreground">{String(course[f.start_date] ?? "")}</td>
                      <td className="py-2 px-2 text-right">{String(course[f.capacity] ?? "")}</td>
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
