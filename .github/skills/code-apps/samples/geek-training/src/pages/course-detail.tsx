import { useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FormModal, FormColumns } from "@/components/form-modal"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { LoadingSkeletonList } from "@/components/loading-skeleton"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { StagePath } from "@/components/stage-path"
import {
  useCourses,
  useUpdateCourse,
  useEnrollments,
  useCreateEnrollment,
  useUpdateEnrollment,
  useDeleteEnrollment,
} from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX } from "@/config"
import {
  COURSE_STAGE_PATH_ITEMS,
  COURSE_STATUS_LABEL,
  COURSE_FORMAT_LABEL,
  COURSE_FORMAT_COLOR,
  ENROLLMENT_STATUS_LABEL,
  ENROLLMENT_STATUS_COLOR,
  ENROLLMENT_STATUS_OPTIONS,
  ENROLLMENT_COMPLETED,
  ENROLLMENT_ACTIVE_STATUSES,
  RATING_OPTIONS,
} from "@/types/dataverse"
import {
  ArrowLeft, Plus, Pencil, Trash2, Tag, User, CalendarDays, Users, CheckCircle2,
} from "lucide-react"
import { toast } from "sonner"

const P = PUBLISHER_PREFIX

const f = {
  id:             `${P}_courseid`,
  name:           `${P}_name`,
  category:       `${P}_category`,
  instructor:     `${P}_instructor`,
  format:         `${P}_format`,
  status:         `${P}_status`,
  start_date:     `${P}_start_date`,
  duration_hours: `${P}_duration_hours`,
  capacity:       `${P}_capacity`,
  description:    `${P}_description`,
}

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

type EnrollForm = { name: string; department: string; status: string; enrolled_date: string; completed_date: string; rating: string }
const EMPTY_ENROLL: EnrollForm = {
  name: "", department: "", status: String(100000000),
  enrolled_date: "", completed_date: "", rating: "",
}

function StarsDisplay({ rating }: { rating: number }) {
  const stars = rating - 100000000 + 1
  return (
    <span className="text-yellow-500 text-sm">
      {"★".repeat(stars)}{"☆".repeat(5 - stars)}
    </span>
  )
}

export default function CourseDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: courses = [], isLoading } = useCourses()
  const { data: allEnrollments = [] } = useEnrollments()
  const updateCourse = useUpdateCourse()
  const createEnrollment = useCreateEnrollment()
  const updateEnrollment = useUpdateEnrollment()
  const deleteEnrollment = useDeleteEnrollment()

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<EnrollForm>(EMPTY_ENROLL)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const course = useMemo(
    () => courses.find(c => String(c[f.id] ?? "") === id),
    [courses, id]
  )

  const enrollments = useMemo(
    () => allEnrollments
      .filter(en => String(en[e.course_ref] ?? "") === id)
      .sort((a, b) => String(a[e.enrolled_date] ?? "").localeCompare(String(b[e.enrolled_date] ?? ""))),
    [allEnrollments, id]
  )

  const activeCount = useMemo(
    () => enrollments.filter(en => ENROLLMENT_ACTIVE_STATUSES.includes(en[e.status] as number)).length,
    [enrollments]
  )

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">コース詳細</h1>
        <LoadingSkeletonList count={3} />
      </div>
    )
  }

  if (!course || !id) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" className="gap-1" onClick={() => navigate("/courses")}>
          <ArrowLeft className="h-4 w-4" />コース一覧へ戻る
        </Button>
        <Card>
          <CardHeader>
            <CardTitle>コースが見つかりません</CardTitle>
            <CardDescription>削除されたか、URL が正しくない可能性があります。</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  const status = course[f.status] as number | undefined
  const format = course[f.format] as number | undefined
  const capacity = (course[f.capacity] as number) ?? 0
  const fillRate = capacity > 0 ? Math.min(100, Math.round((activeCount / capacity) * 100)) : 0

  const handleStageSelect = async (value: number) => {
    try {
      await updateCourse.mutateAsync({ id, data: { [f.status]: value } })
      toast.success(`ステータスを「${(COURSE_STATUS_LABEL as Record<number, string>)[value] ?? ""}」に変更しました`)
    } catch {
      toast.error("更新に失敗しました")
    }
  }

  const handleNew = () => {
    setEditingId(null)
    setForm({ ...EMPTY_ENROLL, enrolled_date: new Date().toISOString().slice(0, 10) })
    setIsFormOpen(true)
  }

  const handleEdit = (enrollment: Record<string, unknown>) => {
    setEditingId(String(enrollment[e.id] ?? ""))
    setForm({
      name:           String(enrollment[e.name] ?? ""),
      department:     String(enrollment[e.department] ?? ""),
      status:         enrollment[e.status] != null ? String(enrollment[e.status]) : String(100000000),
      enrolled_date:  String(enrollment[e.enrolled_date] ?? ""),
      completed_date: String(enrollment[e.completed_date] ?? ""),
      rating:         enrollment[e.rating] != null ? String(enrollment[e.rating]) : "",
    })
    setIsFormOpen(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("受講者名は必須です")
      return
    }
    const data: Record<string, unknown> = {
      [e.name]:       form.name,
      [e.course_ref]: id,
      [e.department]: form.department,
    }
    if (form.status) data[e.status] = Number(form.status)
    if (form.enrolled_date) data[e.enrolled_date] = form.enrolled_date
    if (form.completed_date) data[e.completed_date] = form.completed_date
    if (form.rating) data[e.rating] = Number(form.rating)
    try {
      if (editingId) {
        await updateEnrollment.mutateAsync({ id: editingId, data })
        toast.success("受講記録を更新しました")
      } else {
        await createEnrollment.mutateAsync(data)
        toast.success("受講者を追加しました")
      }
      setIsFormOpen(false)
    } catch {
      toast.error("保存に失敗しました")
    }
  }

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

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await deleteEnrollment.mutateAsync(deleteId)
      toast.success("受講記録を削除しました")
      setDeleteId(null)
    } catch {
      toast.error("削除に失敗しました")
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" className="gap-1 -ml-2 mb-1" onClick={() => navigate("/courses")}>
          <ArrowLeft className="h-4 w-4" />コース一覧へ戻る
        </Button>
        <h1 className="text-2xl font-bold text-foreground">{String(course[f.name] ?? "")}</h1>
      </div>

      {/* サマリーヘッダー + 矢羽 */}
      <Card>
        <CardContent className="py-4">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="flex items-start gap-2">
              <Tag className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">分野 / 形式</div>
                <div className="truncate text-sm font-medium">
                  {String(course[f.category] ?? "—")}
                  {format != null && (
                    <span className={`ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${COURSE_FORMAT_COLOR[format as keyof typeof COURSE_FORMAT_COLOR] ?? ""}`}>
                      {COURSE_FORMAT_LABEL[format as keyof typeof COURSE_FORMAT_LABEL] ?? ""}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <User className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">講師</div>
                <div className="truncate text-sm font-medium">{String(course[f.instructor] ?? "—")}</div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <CalendarDays className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">開催日 / 時間</div>
                <div className="truncate text-sm font-medium">
                  {String(course[f.start_date] ?? "—")}
                  {course[f.duration_hours] != null ? ` / ${course[f.duration_hours]}h` : ""}
                </div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Users className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="text-xs text-muted-foreground">申込状況</div>
                <div className="text-sm font-medium">
                  {activeCount} / {capacity > 0 ? capacity : "—"} 名
                </div>
                {capacity > 0 && <Progress value={fillRate} className="mt-1 h-2" />}
              </div>
            </div>
          </div>

          {/* ステータス矢羽 */}
          <div className="mt-4 border-t pt-4">
            <StagePath
              stages={COURSE_STAGE_PATH_ITEMS}
              current={status}
              onSelect={handleStageSelect}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              矢羽をクリックするとステータスを変更できます
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 概要 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">概要</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm whitespace-pre-wrap">
            {String(course[f.description] ?? "") || <span className="text-muted-foreground">（未入力）</span>}
          </p>
        </CardContent>
      </Card>

      {/* 受講者 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">受講者</CardTitle>
              <CardDescription>{enrollments.length} 件（申込日順）</CardDescription>
            </div>
            <Button size="sm" className="gap-1" onClick={handleNew}>
              <Plus className="h-3.5 w-3.5" />受講者を追加
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>受講者名</TableHead>
                  <TableHead>部門</TableHead>
                  <TableHead>ステータス</TableHead>
                  <TableHead>申込日</TableHead>
                  <TableHead>修了日</TableHead>
                  <TableHead>満足度</TableHead>
                  <TableHead className="w-[150px]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {enrollments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                      受講者がいません。「受講者を追加」から登録してください
                    </TableCell>
                  </TableRow>
                ) : (
                  enrollments.map((enrollment, idx) => {
                    const enrollStatus = enrollment[e.status] as number | undefined
                    const rating = enrollment[e.rating] as number | undefined
                    return (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">{String(enrollment[e.name] ?? "")}</TableCell>
                        <TableCell>{String(enrollment[e.department] ?? "")}</TableCell>
                        <TableCell>
                          {enrollStatus != null && (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${ENROLLMENT_STATUS_COLOR[enrollStatus as keyof typeof ENROLLMENT_STATUS_COLOR] ?? "bg-gray-100 text-gray-600"}`}>
                              {ENROLLMENT_STATUS_LABEL[enrollStatus as keyof typeof ENROLLMENT_STATUS_LABEL] ?? String(enrollStatus)}
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
                            {enrollStatus !== ENROLLMENT_COMPLETED && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1"
                                onClick={() => handleComplete(String(enrollment[e.id] ?? ""))}
                                title="修了にする"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />修了
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => handleEdit(enrollment)}
                              title="編集"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => setDeleteId(String(enrollment[e.id] ?? ""))}
                              title="削除"
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
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

      {/* 受講者フォーム */}
      <FormModal
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        title={editingId ? "受講記録編集" : "受講者追加"}
        onSave={handleSave}
        isSaving={createEnrollment.isPending || updateEnrollment.isPending}
        maxWidth="md"
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="enroll_name">受講者名 <span className="text-destructive">*</span></Label>
            <Input
              id="enroll_name"
              value={form.name}
              onChange={ev => setForm(p => ({ ...p, name: ev.target.value }))}
              placeholder="受講者の氏名"
            />
          </div>
          <FormColumns columns={2}>
            <div className="space-y-1.5">
              <Label htmlFor="enroll_department">部門</Label>
              <Input
                id="enroll_department"
                value={form.department}
                onChange={ev => setForm(p => ({ ...p, department: ev.target.value }))}
                placeholder="部門名"
              />
            </div>
            <div className="space-y-1.5">
              <Label>ステータス</Label>
              <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="ステータスを選択" />
                </SelectTrigger>
                <SelectContent>
                  {ENROLLMENT_STATUS_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="enroll_date">申込日</Label>
              <Input
                id="enroll_date"
                type="date"
                value={form.enrolled_date}
                onChange={ev => setForm(p => ({ ...p, enrolled_date: ev.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="completed_date">修了日</Label>
              <Input
                id="completed_date"
                type="date"
                value={form.completed_date}
                onChange={ev => setForm(p => ({ ...p, completed_date: ev.target.value }))}
              />
            </div>
          </FormColumns>
          <div className="space-y-1.5">
            <Label>満足度</Label>
            <Select value={form.rating} onValueChange={v => setForm(p => ({ ...p, rating: v }))}>
              <SelectTrigger>
                <SelectValue placeholder="満足度を選択（任意）" />
              </SelectTrigger>
              <SelectContent>
                {RATING_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </FormModal>

      {/* 受講記録削除確認 */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={open => { if (!open) setDeleteId(null) }}
        title="受講記録を削除しますか？"
        description="この操作は取り消せません。受講記録を完全に削除します。"
        confirmLabel="削除"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  )
}
