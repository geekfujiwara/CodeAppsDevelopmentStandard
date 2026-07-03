import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { LoadingSkeletonList } from "@/components/loading-skeleton"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
  useCourses,
  useEnrollments,
  useUpdateEnrollment,
} from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX, FEATURE_ENROLLMENTS } from "@/config"
import {
  ENROLLMENT_STATUS_LABEL,
  ENROLLMENT_STATUS_COLOR,
  ENROLLMENT_STATUS_OPTIONS,
  ENROLLMENT_COMPLETED,
} from "@/types/dataverse"
import { Search, CheckCircle2, Eye } from "lucide-react"
import { toast } from "sonner"

const P = PUBLISHER_PREFIX

const e = {
  id:             `${P}_enrollmentid`,
  name:           `${P}_name`,
  course_ref:     `${P}_course_ref`,
  department:     `${P}_department`,
  status:         `${P}_status`,
  enrolled_date:  `${P}_enrolled_date`,
  completed_date: `${P}_completed_date`,
  rating:         `${P}_rating`,
}

const c = {
  id:   `${P}_courseid`,
  name: `${P}_name`,
}

function StarsDisplay({ rating }: { rating: number }) {
  const stars = rating - 100000000 + 1
  return (
    <span className="text-yellow-500 text-sm">
      {"★".repeat(stars)}{"☆".repeat(5 - stars)}
    </span>
  )
}

function DisabledFeatureCard() {
  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <Card className="max-w-lg w-full">
        <CardHeader>
          <CardTitle>この機能は無効です</CardTitle>
          <CardDescription>
            受講記録は現在無効になっています。有効にするには .env の{" "}
            <code className="bg-muted px-1 py-0.5 rounded text-sm">VITE_FEATURE_ENROLLMENTS=true</code>{" "}
            を設定してください。
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}

export default function EnrollmentsPage() {
  if (!FEATURE_ENROLLMENTS) return <DisabledFeatureCard />
  return <EnrollmentsContent />
}

function EnrollmentsContent() {
  const navigate = useNavigate()
  const { data: enrollments = [], isLoading } = useEnrollments()
  const { data: courses = [] } = useCourses()
  const updateEnrollment = useUpdateEnrollment()

  const [search, setSearch] = useState("")
  const [filterStatus, setFilterStatus] = useState("all")

  const courseNameMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const course of courses) {
      map.set(String(course[c.id] ?? ""), String(course[c.name] ?? ""))
    }
    return map
  }, [courses])

  const filtered = enrollments
    .filter(en => {
      const q = search.toLowerCase()
      const courseName = courseNameMap.get(String(en[e.course_ref] ?? "")) ?? ""
      const matchSearch = !q ||
        String(en[e.name] ?? "").toLowerCase().includes(q) ||
        String(en[e.department] ?? "").toLowerCase().includes(q) ||
        courseName.toLowerCase().includes(q)
      const matchStatus = filterStatus === "all" || String(en[e.status]) === filterStatus
      return matchSearch && matchStatus
    })
    .sort((a, b) => String(b[e.enrolled_date] ?? "").localeCompare(String(a[e.enrolled_date] ?? "")))

  const handleComplete = async (enrollmentId: string) => {
    try {
      await updateEnrollment.mutateAsync({
        id: enrollmentId,
        data: {
          [e.status]: ENROLLMENT_COMPLETED,
          [e.completed_date]: new Date().toISOString().slice(0, 10),
        },
      })
      toast.success("修了にしました")
    } catch {
      toast.error("更新に失敗しました")
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">受講記録</h1>
        <LoadingSkeletonList count={5} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">受講記録</h1>
        <p className="text-muted-foreground text-sm mt-1">全コースの受講記録を横断管理します</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>受講記録一覧</CardTitle>
          <CardDescription>{filtered.length} 件（申込日の新しい順）</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="受講者名・部門・コース名で検索..."
                value={search}
                onChange={ev => setSearch(ev.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-full sm:w-[150px]">
                <SelectValue placeholder="ステータス" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべてのステータス</SelectItem>
                {ENROLLMENT_STATUS_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>受講者名</TableHead>
                  <TableHead>コース</TableHead>
                  <TableHead>部門</TableHead>
                  <TableHead>ステータス</TableHead>
                  <TableHead>申込日</TableHead>
                  <TableHead>修了日</TableHead>
                  <TableHead>満足度</TableHead>
                  <TableHead className="w-[130px]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                      受講記録がありません（コース詳細画面から追加します）
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((enrollment, idx) => {
                    const status = enrollment[e.status] as number | undefined
                    const rating = enrollment[e.rating] as number | undefined
                    const courseId = String(enrollment[e.course_ref] ?? "")
                    return (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">{String(enrollment[e.name] ?? "")}</TableCell>
                        <TableCell className="max-w-[200px] truncate text-muted-foreground">
                          {courseNameMap.get(courseId) || "—"}
                        </TableCell>
                        <TableCell>{String(enrollment[e.department] ?? "")}</TableCell>
                        <TableCell>
                          {status != null && (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${ENROLLMENT_STATUS_COLOR[status as keyof typeof ENROLLMENT_STATUS_COLOR] ?? "bg-gray-100 text-gray-600"}`}>
                              {ENROLLMENT_STATUS_LABEL[status as keyof typeof ENROLLMENT_STATUS_LABEL] ?? String(status)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>{String(enrollment[e.enrolled_date] ?? "")}</TableCell>
                        <TableCell>{String(enrollment[e.completed_date] ?? "")}</TableCell>
                        <TableCell>
                          {rating != null && <StarsDisplay rating={rating} />}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => navigate(`/courses/${courseId}`)}
                              title="コースを開く"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            {status !== ENROLLMENT_COMPLETED && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1"
                                onClick={() => handleComplete(String(enrollment[e.id] ?? ""))}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />修了
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
