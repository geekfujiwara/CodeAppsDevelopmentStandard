import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { FormModal, FormColumns } from "@/components/form-modal"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { LoadingSkeletonList } from "@/components/loading-skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
  useCourses,
  useCreateCourse,
  useUpdateCourse,
  useDeleteCourse,
} from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX } from "@/config"
import {
  COURSE_STATUS_LABEL,
  COURSE_STATUS_COLOR,
  COURSE_STATUS_OPTIONS,
  COURSE_FORMAT_LABEL,
  COURSE_FORMAT_COLOR,
  COURSE_FORMAT_OPTIONS,
} from "@/types/dataverse"
import { Plus, Pencil, Trash2, Search, ChevronLeft, ChevronRight, Eye } from "lucide-react"
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

function StatusBadge({ status }: { status: number }) {
  const label = COURSE_STATUS_LABEL[status as keyof typeof COURSE_STATUS_LABEL] ?? String(status)
  const color = COURSE_STATUS_COLOR[status as keyof typeof COURSE_STATUS_COLOR] ?? "bg-gray-100 text-gray-600"
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {label}
    </span>
  )
}

function FormatBadge({ format }: { format: number }) {
  const label = COURSE_FORMAT_LABEL[format as keyof typeof COURSE_FORMAT_LABEL] ?? String(format)
  const color = COURSE_FORMAT_COLOR[format as keyof typeof COURSE_FORMAT_COLOR] ?? "bg-gray-100 text-gray-600"
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {label}
    </span>
  )
}

type FormData = {
  name: string
  category: string
  instructor: string
  format: string
  status: string
  start_date: string
  duration_hours: string
  capacity: string
  description: string
}

const EMPTY_FORM: FormData = {
  name: "", category: "", instructor: "", format: "",
  status: String(100000000), start_date: "", duration_hours: "", capacity: "", description: "",
}

const ITEMS_PER_PAGE = 10

export default function CoursesPage() {
  const navigate = useNavigate()
  const { data: courses = [], isLoading } = useCourses()
  const createCourse = useCreateCourse()
  const updateCourse = useUpdateCourse()
  const deleteCourse = useDeleteCourse()

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const [search, setSearch] = useState("")
  const [filterStatus, setFilterStatus] = useState("all")
  const [filterFormat, setFilterFormat] = useState("all")
  const [currentPage, setCurrentPage] = useState(1)

  // フィルター
  const filtered = courses
    .filter(c => {
      const q = search.toLowerCase()
      const matchSearch = !q ||
        String(c[f.name] ?? "").toLowerCase().includes(q) ||
        String(c[f.category] ?? "").toLowerCase().includes(q) ||
        String(c[f.instructor] ?? "").toLowerCase().includes(q)
      const matchStatus = filterStatus === "all" || String(c[f.status]) === filterStatus
      const matchFormat = filterFormat === "all" || String(c[f.format]) === filterFormat
      return matchSearch && matchStatus && matchFormat
    })
    .sort((a, b) => String(b[f.start_date] ?? "").localeCompare(String(a[f.start_date] ?? "")))

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE)
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
  const paginated = filtered.slice(startIndex, startIndex + ITEMS_PER_PAGE)

  const handleNew = () => {
    setEditingId(null)
    setFormData(EMPTY_FORM)
    setIsFormOpen(true)
  }

  const handleEdit = (course: Record<string, unknown>) => {
    setEditingId(String(course[f.id] ?? ""))
    setFormData({
      name:           String(course[f.name] ?? ""),
      category:       String(course[f.category] ?? ""),
      instructor:     String(course[f.instructor] ?? ""),
      format:         course[f.format] != null ? String(course[f.format]) : "",
      status:         course[f.status] != null ? String(course[f.status]) : String(100000000),
      start_date:     String(course[f.start_date] ?? ""),
      duration_hours: course[f.duration_hours] != null ? String(course[f.duration_hours]) : "",
      capacity:       course[f.capacity] != null ? String(course[f.capacity]) : "",
      description:    String(course[f.description] ?? ""),
    })
    setIsFormOpen(true)
  }

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error("コース名は必須です")
      return
    }
    const data: Record<string, unknown> = {
      [f.name]:        formData.name,
      [f.category]:    formData.category,
      [f.instructor]:  formData.instructor,
      [f.description]: formData.description,
    }
    if (formData.format) data[f.format] = Number(formData.format)
    if (formData.status) data[f.status] = Number(formData.status)
    if (formData.start_date) data[f.start_date] = formData.start_date
    if (formData.duration_hours) data[f.duration_hours] = parseFloat(formData.duration_hours)
    if (formData.capacity) data[f.capacity] = parseInt(formData.capacity, 10)

    try {
      if (editingId) {
        await updateCourse.mutateAsync({ id: editingId, data })
        toast.success("研修コースを更新しました")
      } else {
        await createCourse.mutateAsync(data)
        toast.success("研修コースを作成しました")
      }
      setIsFormOpen(false)
    } catch {
      toast.error("保存に失敗しました")
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await deleteCourse.mutateAsync(deleteId)
      toast.success("研修コースを削除しました")
      setDeleteId(null)
    } catch {
      toast.error("削除に失敗しました")
    }
  }

  const update = (key: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setFormData(prev => ({ ...prev, [key]: e.target.value }))

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">研修コース</h1>
        </div>
        <LoadingSkeletonList count={5} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">研修コース</h1>
          <p className="text-muted-foreground text-sm mt-1">研修カタログの管理</p>
        </div>
        <Button onClick={handleNew} className="gap-2">
          <Plus className="h-4 w-4" />
          新規作成
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>コース一覧</CardTitle>
          <CardDescription>{filtered.length} 件（開催日の新しい順）</CardDescription>
        </CardHeader>
        <CardContent>
          {/* フィルター */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="コース名・分野・講師で検索..."
                value={search}
                onChange={e => { setSearch(e.target.value); setCurrentPage(1) }}
                className="pl-9"
              />
            </div>
            <Select value={filterStatus} onValueChange={v => { setFilterStatus(v); setCurrentPage(1) }}>
              <SelectTrigger className="w-full sm:w-[150px]">
                <SelectValue placeholder="ステータス" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべてのステータス</SelectItem>
                {COURSE_STATUS_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterFormat} onValueChange={v => { setFilterFormat(v); setCurrentPage(1) }}>
              <SelectTrigger className="w-full sm:w-[150px]">
                <SelectValue placeholder="形式" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべての形式</SelectItem>
                {COURSE_FORMAT_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* テーブル */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>コース名</TableHead>
                  <TableHead>分野</TableHead>
                  <TableHead>講師</TableHead>
                  <TableHead>形式</TableHead>
                  <TableHead>ステータス</TableHead>
                  <TableHead>開催日</TableHead>
                  <TableHead className="text-right">時間</TableHead>
                  <TableHead className="text-right">定員</TableHead>
                  <TableHead className="w-[110px]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                      研修コースがありません
                    </TableCell>
                  </TableRow>
                ) : (
                  paginated.map((course, idx) => (
                    <TableRow
                      key={idx}
                      className="cursor-pointer"
                      onClick={() => navigate(`/courses/${String(course[f.id] ?? "")}`)}
                    >
                      <TableCell className="font-medium max-w-[220px] truncate">
                        {String(course[f.name] ?? "")}
                      </TableCell>
                      <TableCell>{String(course[f.category] ?? "")}</TableCell>
                      <TableCell>{String(course[f.instructor] ?? "")}</TableCell>
                      <TableCell>
                        {course[f.format] != null && (
                          <FormatBadge format={course[f.format] as number} />
                        )}
                      </TableCell>
                      <TableCell>
                        {course[f.status] != null && (
                          <StatusBadge status={course[f.status] as number} />
                        )}
                      </TableCell>
                      <TableCell>{String(course[f.start_date] ?? "")}</TableCell>
                      <TableCell className="text-right">
                        {course[f.duration_hours] != null ? `${course[f.duration_hours]}h` : ""}
                      </TableCell>
                      <TableCell className="text-right">{String(course[f.capacity] ?? "")}</TableCell>
                      <TableCell onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => navigate(`/courses/${String(course[f.id] ?? "")}`)}
                            title="詳細"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleEdit(course)}
                            title="編集"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setDeleteId(String(course[f.id] ?? ""))}
                            title="削除"
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* ページネーション */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <span className="text-sm text-muted-foreground">
                {filtered.length} 件中 {startIndex + 1}-{Math.min(startIndex + ITEMS_PER_PAGE, filtered.length)} 件を表示
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline" size="sm"
                  onClick={() => setCurrentPage(p => p - 1)}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />前へ
                </Button>
                {Array.from({ length: totalPages }, (_, idx) => idx + 1).map(page => (
                  <Button
                    key={page}
                    variant={currentPage === page ? "default" : "outline"}
                    size="sm"
                    onClick={() => setCurrentPage(page)}
                    className="w-8 h-8 p-0"
                  >
                    {page}
                  </Button>
                ))}
                <Button
                  variant="outline" size="sm"
                  onClick={() => setCurrentPage(p => p + 1)}
                  disabled={currentPage === totalPages}
                >
                  次へ<ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* フォームモーダル */}
      <FormModal
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        title={editingId ? "研修コース編集" : "研修コース新規作成"}
        onSave={handleSave}
        isSaving={createCourse.isPending || updateCourse.isPending}
        maxWidth="2xl"
      >
        <div className="space-y-6">
          {/* コース名（必須、全幅） */}
          <div className="space-y-1.5">
            <Label htmlFor="name">コース名 <span className="text-destructive">*</span></Label>
            <Input
              id="name"
              value={formData.name}
              onChange={update("name")}
              placeholder="研修コース名を入力"
            />
          </div>

          <FormColumns columns={2}>
            {/* 分野 */}
            <div className="space-y-1.5">
              <Label htmlFor="category">分野</Label>
              <Input
                id="category"
                value={formData.category}
                onChange={update("category")}
                placeholder="例: コンプライアンス, IT スキル, 安全教育"
              />
            </div>
            {/* 講師 */}
            <div className="space-y-1.5">
              <Label htmlFor="instructor">講師</Label>
              <Input
                id="instructor"
                value={formData.instructor}
                onChange={update("instructor")}
                placeholder="講師名"
              />
            </div>
            {/* 形式 */}
            <div className="space-y-1.5">
              <Label>形式</Label>
              <Select value={formData.format} onValueChange={v => setFormData(p => ({ ...p, format: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="形式を選択" />
                </SelectTrigger>
                <SelectContent>
                  {COURSE_FORMAT_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* ステータス */}
            <div className="space-y-1.5">
              <Label>ステータス</Label>
              <Select value={formData.status} onValueChange={v => setFormData(p => ({ ...p, status: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="ステータスを選択" />
                </SelectTrigger>
                <SelectContent>
                  {COURSE_STATUS_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* 開催日 */}
            <div className="space-y-1.5">
              <Label htmlFor="start_date">開催日</Label>
              <Input
                id="start_date"
                type="date"
                value={formData.start_date}
                onChange={update("start_date")}
              />
            </div>
            {/* 時間 */}
            <div className="space-y-1.5">
              <Label htmlFor="duration_hours">時間（h）</Label>
              <Input
                id="duration_hours"
                type="number"
                min={0}
                step="0.5"
                value={formData.duration_hours}
                onChange={update("duration_hours")}
                placeholder="例: 3"
              />
            </div>
            {/* 定員 */}
            <div className="space-y-1.5">
              <Label htmlFor="capacity">定員</Label>
              <Input
                id="capacity"
                type="number"
                min={0}
                value={formData.capacity}
                onChange={update("capacity")}
                placeholder="例: 20"
              />
            </div>
          </FormColumns>

          {/* 概要（全幅） */}
          <div className="space-y-1.5">
            <Label htmlFor="description">概要</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={update("description")}
              placeholder="研修の目的・対象者・内容"
              rows={3}
            />
          </div>
        </div>
      </FormModal>

      {/* 削除確認 */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={open => { if (!open) setDeleteId(null) }}
        title="研修コースを削除しますか？"
        description="この操作は取り消せません。研修コースを完全に削除します（受講記録は残ります）。"
        confirmLabel="削除"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  )
}
