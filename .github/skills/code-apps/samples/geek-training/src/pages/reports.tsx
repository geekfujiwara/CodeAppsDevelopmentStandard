import { useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { LoadingSkeletonList } from "@/components/loading-skeleton"
import { useCourses, useEnrollments } from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX, FEATURE_REPORTS } from "@/config"
import {
  ENROLLMENT_COMPLETED,
  ENROLLMENT_CANCELLED,
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
  const { data: courses = [], isLoading } = useCourses()
  const { data: enrollments = [] } = useEnrollments()
  const P = PUBLISHER_PREFIX
  const c = {
    id:       `${P}_courseid`,
    name:     `${P}_name`,
    category: `${P}_category`,
  }
  const e = {
    course_ref:    `${P}_course_ref`,
    department:    `${P}_department`,
    status:        `${P}_status`,
    enrolled_date: `${P}_enrolled_date`,
    rating:        `${P}_rating`,
  }

  /** コースID → 分野 のマップ */
  const courseCategoryMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const course of courses) {
      map.set(String(course[c.id] ?? ""), (course[c.category] as string) || "未分類")
    }
    return map
  }, [courses])

  const categoryData = useMemo(() => {
    const map = new Map<string, { total: number; completed: number }>()
    for (const en of enrollments) {
      if ((en[e.status] as number) === ENROLLMENT_CANCELLED) continue
      const cat = courseCategoryMap.get(String(en[e.course_ref] ?? "")) ?? "未分類"
      const entry = map.get(cat) ?? { total: 0, completed: 0 }
      entry.total++
      if ((en[e.status] as number) === ENROLLMENT_COMPLETED) entry.completed++
      map.set(cat, entry)
    }
    return [...map.entries()]
      .map(([category, v]) => ({
        category, ...v,
        rate: v.total > 0 ? Math.round((v.completed / v.total) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total)
  }, [enrollments, courseCategoryMap])

  const deptData = useMemo(() => {
    const map = new Map<string, number>()
    for (const en of enrollments) {
      if ((en[e.status] as number) === ENROLLMENT_CANCELLED) continue
      const dept = (en[e.department] as string) || "未設定"
      map.set(dept, (map.get(dept) ?? 0) + 1)
    }
    return [...map.entries()]
      .map(([name, 件数]) => ({ name, 件数 }))
      .sort((a, b) => b.件数 - a.件数)
      .slice(0, 10)
  }, [enrollments])

  const monthlyData = useMemo(() => {
    const map = new Map<string, number>()
    for (const en of enrollments) {
      const d = en[e.enrolled_date] as string | undefined
      if (!d) continue
      const key = d.slice(0, 7)
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    return [...map.entries()]
      .map(([month, 件数]) => ({ month, 件数 }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12)
  }, [enrollments])

  const satisfactionData = useMemo(() => {
    const map = new Map<string, { sum: number; count: number }>()
    for (const en of enrollments) {
      const rating = en[e.rating] as number | undefined
      if (rating == null) continue
      const courseId = String(en[e.course_ref] ?? "")
      const course = courses.find(co => String(co[c.id] ?? "") === courseId)
      const courseName = course ? String(course[c.name] ?? "") : "—"
      const entry = map.get(courseName) ?? { sum: 0, count: 0 }
      entry.sum += rating - 100000000 + 1
      entry.count++
      map.set(courseName, entry)
    }
    return [...map.entries()]
      .map(([course, v]) => ({ course, avg: v.count > 0 ? v.sum / v.count : 0, count: v.count }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 10)
  }, [enrollments, courses])

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
        <p className="text-sm text-muted-foreground mt-1">研修・受講統計（クライアント集計）</p>
      </div>

      {/* 分野別修了率 */}
      <Card>
        <CardHeader><CardTitle className="text-base">分野別修了率</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>分野</TableHead>
                  <TableHead className="text-right">受講数</TableHead>
                  <TableHead className="text-right">修了数</TableHead>
                  <TableHead className="text-right">修了率</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categoryData.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="h-24 text-center text-muted-foreground">データがありません</TableCell></TableRow>
                ) : (
                  categoryData.map((row, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{row.category}</TableCell>
                      <TableCell className="text-right">{row.total}</TableCell>
                      <TableCell className="text-right">{row.completed}</TableCell>
                      <TableCell className="text-right">{row.rate}%</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* 部門別受講数 */}
      <Card>
        <CardHeader><CardTitle className="text-base">部門別受講数（上位10件）</CardTitle></CardHeader>
        <CardContent>
          {deptData.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">データがありません</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={deptData} layout="vertical" margin={{ left: 16, right: 16, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="件数" radius={[0, 4, 4, 0]}>
                  {deptData.map((_, idx) => (
                    <Cell key={idx} fill={BAR_COLORS[idx % BAR_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* 月別申込数 */}
      <Card>
        <CardHeader><CardTitle className="text-base">月別申込数（直近12ヶ月）</CardTitle></CardHeader>
        <CardContent>
          {monthlyData.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">データがありません</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={monthlyData} margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="件数" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* コース別満足度 */}
      <Card>
        <CardHeader><CardTitle className="text-base">コース別満足度（上位10件）</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>コース</TableHead>
                  <TableHead className="text-right">回答数</TableHead>
                  <TableHead className="text-right">平均満足度</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {satisfactionData.length === 0 ? (
                  <TableRow><TableCell colSpan={3} className="h-24 text-center text-muted-foreground">満足度の記録がありません</TableCell></TableRow>
                ) : (
                  satisfactionData.map((row, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium max-w-[280px] truncate">{row.course}</TableCell>
                      <TableCell className="text-right">{row.count}</TableCell>
                      <TableCell className="text-right">
                        <span className="text-yellow-500">★</span> {row.avg.toFixed(1)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
