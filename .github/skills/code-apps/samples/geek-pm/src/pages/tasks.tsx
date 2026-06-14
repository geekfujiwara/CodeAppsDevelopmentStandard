import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { FormModal, FormColumns, FormSection } from "@/components/form-modal"
import { LoadingSkeletonList } from "@/components/loading-skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Card, CardContent } from "@/components/ui/card"
import {
  useProjects,
  useTasks,
  useCreateTask,
  useUpdateTask,
  useDeleteTask,
} from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX } from "@/config"
import {
  TASK_STATUS_LABEL,
  TASK_STATUS_COLOR,
  TASK_STATUS_OPTIONS,
  PRIORITY_LABEL,
  PRIORITY_COLOR,
  PRIORITY_OPTIONS,
  type TaskStatus,
  type Priority,
  type Task,
} from "@/types/dataverse"
import { Plus, Pencil, Trash2, Search } from "lucide-react"
import { toast } from "sonner"

function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TASK_STATUS_COLOR[status]}`}>
      {TASK_STATUS_LABEL[status]}
    </span>
  )
}

function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_COLOR[priority]}`}>
      {PRIORITY_LABEL[priority]}
    </span>
  )
}

const EMPTY_FORM = {
  name:           "",
  project_id:     "",
  assignee:       "",
  description:    "",
  status:         "",
  priority:       "",
  progress:       "",
  start_date:     "",
  due_date:       "",
  completed_date: "",
  notes:          "",
}

type FormValues = typeof EMPTY_FORM

export default function Tasks() {
  const { data: projects = [] }        = useProjects()
  const { data: tasks = [], isLoading } = useTasks()
  const createMutation = useCreateTask()
  const updateMutation = useUpdateTask()
  const deleteMutation = useDeleteTask()

  const [search, setSearch]             = useState("")
  const [projectFilter, setProjectFilter] = useState("all")
  const [statusFilter, setStatusFilter]   = useState("all")
  const [priorityFilter, setPriorityFilter] = useState("all")
  const [page, setPage]                 = useState(1)
  const [modalOpen, setModalOpen]       = useState(false)
  const [editingId, setEditingId]       = useState<string | null>(null)
  const [form, setForm]                 = useState<FormValues>(EMPTY_FORM)
  const [deleteId, setDeleteId]         = useState<string | null>(null)
  const [isSaving, setIsSaving]         = useState(false)

  const P = PUBLISHER_PREFIX
  const f = {
    id:             `${P}_taskid`,
    name:           `${P}_name`,
    project_id:     `${P}_project_id`,
    project_fmt:    `${P}_project_id_formatted`,
    assignee:       `${P}_assignee`,
    description:    `${P}_description`,
    status:         `${P}_status`,
    priority:       `${P}_priority`,
    progress:       `${P}_progress`,
    start_date:     `${P}_start_date`,
    due_date:       `${P}_due_date`,
    completed_date: `${P}_completed_date`,
    notes:          `${P}_notes`,
  }

  const fp = {
    id:   `${P}_projectid`,
    name: `${P}_name`,
  }

  const ITEMS_PER_PAGE = 10

  const filtered = tasks.filter((t) => {
    const name     = (t[f.name] as string ?? "").toLowerCase()
    const assignee = (t[f.assignee] as string ?? "").toLowerCase()
    const q        = search.toLowerCase()
    const matchSearch   = !q || name.includes(q) || assignee.includes(q)
    const matchProject  = projectFilter === "all"  || String(t[f.project_id]) === projectFilter
    const matchStatus   = statusFilter === "all"   || String(t[f.status])     === statusFilter
    const matchPriority = priorityFilter === "all" || String(t[f.priority])   === priorityFilter
    return matchSearch && matchProject && matchStatus && matchPriority
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE))
  const paginated  = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE)

  function openCreate() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setModalOpen(true)
  }

  function openEdit(task: Task) {
    const id = task[f.id] as string
    setEditingId(id)
    setForm({
      name:           (task[f.name] as string) ?? "",
      project_id:     (task[f.project_id] as string) ?? "",
      assignee:       (task[f.assignee] as string) ?? "",
      description:    (task[f.description] as string) ?? "",
      status:         String((task[f.status] as number) ?? ""),
      priority:       String((task[f.priority] as number) ?? ""),
      progress:       String((task[f.progress] as number) ?? ""),
      start_date:     (task[f.start_date] as string)?.slice(0, 10) ?? "",
      due_date:       (task[f.due_date] as string)?.slice(0, 10) ?? "",
      completed_date: (task[f.completed_date] as string)?.slice(0, 10) ?? "",
      notes:          (task[f.notes] as string) ?? "",
    })
    setModalOpen(true)
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error("タスク名は必須です")
      return
    }
    setIsSaving(true)
    try {
      const data: Record<string, unknown> = {
        [f.name]:           form.name,
        [f.assignee]:       form.assignee       || undefined,
        [f.description]:    form.description    || undefined,
        [f.status]:         form.status   ? Number(form.status)   : 100000000,
        [f.priority]:       form.priority ? Number(form.priority) : 100000000,
        [f.progress]:       form.progress ? Number(form.progress) : 0,
        [f.start_date]:     form.start_date     || undefined,
        [f.due_date]:       form.due_date       || undefined,
        [f.completed_date]: form.completed_date || undefined,
        [f.notes]:          form.notes          || undefined,
      }
      if (form.project_id) {
        data[`${P}_project_id@odata.bind`] = `/${P}_projects(${form.project_id})`
      }
      if (editingId) {
        await updateMutation.mutateAsync({ id: editingId, data })
        toast.success("タスクを更新しました")
      } else {
        await createMutation.mutateAsync(data)
        toast.success("タスクを登録しました")
      }
      setModalOpen(false)
    } catch {
      toast.error(editingId ? "更新に失敗しました" : "登録に失敗しました")
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteId) return
    try {
      await deleteMutation.mutateAsync(deleteId)
      toast.success("タスクを削除しました")
    } catch {
      toast.error("削除に失敗しました")
    } finally {
      setDeleteId(null)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">タスク</h1>
        <LoadingSkeletonList count={5} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">タスク</h1>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          新規登録
        </Button>
      </div>

      {/* フィルターバー */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="タスク名・担当者で検索..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="pl-9"
          />
        </div>
        <Select value={projectFilter} onValueChange={(v) => { setProjectFilter(v); setPage(1) }}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="プロジェクト" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">すべてのプロジェクト</SelectItem>
            {projects.map((p, idx) => (
              <SelectItem key={idx} value={String(p[fp.id])}>{String(p[fp.name] ?? "—")}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1) }}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="ステータス" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">すべて</SelectItem>
            {TASK_STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={(v) => { setPriorityFilter(v); setPage(1) }}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="優先度" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">すべて</SelectItem>
            {PRIORITY_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* テーブル */}
      <Card>
        <CardContent className="p-0">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>タスク名</TableHead>
                  <TableHead>プロジェクト</TableHead>
                  <TableHead>担当者</TableHead>
                  <TableHead>ステータス</TableHead>
                  <TableHead>優先度</TableHead>
                  <TableHead>進捗率</TableHead>
                  <TableHead>期限</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                      データがありません
                    </TableCell>
                  </TableRow>
                ) : (
                  paginated.map((task, idx) => {
                    const status   = (task[f.status] as TaskStatus) ?? 100000000
                    const priority = (task[f.priority] as Priority) ?? 100000000
                    const name     = (task[f.name] as string) ?? "—"
                    const project  = (task[f.project_fmt] as string) ?? "—"
                    const assignee = (task[f.assignee] as string) ?? "—"
                    const progress = (task[f.progress] as number) ?? 0
                    const due      = (task[f.due_date] as string)?.slice(0, 10) ?? "—"
                    const id       = task[f.id] as string
                    return (
                      <TableRow key={idx}>
                        <TableCell className="font-medium max-w-[160px] truncate">{name}</TableCell>
                        <TableCell className="max-w-[140px] truncate">{project}</TableCell>
                        <TableCell>{assignee}</TableCell>
                        <TableCell><TaskStatusBadge status={status} /></TableCell>
                        <TableCell><PriorityBadge priority={priority} /></TableCell>
                        <TableCell>
                          <div className="w-20">
                            <div className="w-full bg-muted rounded h-2">
                              <div className="h-2 rounded bg-primary" style={{ width: `${progress}%` }} />
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">{progress}%</p>
                          </div>
                        </TableCell>
                        <TableCell>{due}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              title="編集"
                              onClick={() => openEdit(task)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="削除"
                              onClick={() => setDeleteId(id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
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

          {/* ページネーション */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between p-4">
              <p className="text-sm text-muted-foreground">
                {filtered.length}件中 {(page - 1) * ITEMS_PER_PAGE + 1}–{Math.min(page * ITEMS_PER_PAGE, filtered.length)}件を表示
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>前へ</Button>
                <span className="text-sm">{page} / {totalPages}</span>
                <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>次へ</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 作成・編集モーダル */}
      <FormModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        title={editingId ? "タスクを編集" : "タスクを新規登録"}
        onSave={handleSave}
        isSaving={isSaving}
        saveLabel={isSaving ? "保存中..." : "保存"}
      >
        <div className="space-y-6">
          <FormSection title="基本情報">
            <FormColumns columns={2}>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="task_name">タスク名 <span className="text-destructive">*</span></Label>
                <Input
                  id="task_name"
                  value={form.name}
                  onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="例: 要件定義書の作成"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="task_project">プロジェクト</Label>
                <Select value={form.project_id} onValueChange={(v) => setForm(f => ({ ...f, project_id: v }))}>
                  <SelectTrigger id="task_project">
                    <SelectValue placeholder="選択してください" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((p, idx) => (
                      <SelectItem key={idx} value={String(p[fp.id])}>{String(p[fp.name] ?? "—")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="assignee">担当者</Label>
                <Input
                  id="assignee"
                  value={form.assignee}
                  onChange={(e) => setForm(f => ({ ...f, assignee: e.target.value }))}
                  placeholder="例: 佐藤 花子"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="task_description">説明</Label>
                <Textarea
                  id="task_description"
                  value={form.description}
                  onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="task_status">ステータス</Label>
                <Select value={form.status} onValueChange={(v) => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger id="task_status">
                    <SelectValue placeholder="選択してください" />
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_STATUS_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="task_priority">優先度</Label>
                <Select value={form.priority} onValueChange={(v) => setForm(f => ({ ...f, priority: v }))}>
                  <SelectTrigger id="task_priority">
                    <SelectValue placeholder="選択してください" />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITY_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="progress">進捗率 (0–100)</Label>
                <Input
                  id="progress"
                  type="number"
                  min={0}
                  max={100}
                  value={form.progress}
                  onChange={(e) => setForm(f => ({ ...f, progress: e.target.value }))}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="task_start_date">開始日</Label>
                <Input
                  id="task_start_date"
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm(f => ({ ...f, start_date: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="due_date">期限</Label>
                <Input
                  id="due_date"
                  type="date"
                  value={form.due_date}
                  onChange={(e) => setForm(f => ({ ...f, due_date: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="completed_date">完了日</Label>
                <Input
                  id="completed_date"
                  type="date"
                  value={form.completed_date}
                  onChange={(e) => setForm(f => ({ ...f, completed_date: e.target.value }))}
                />
              </div>
            </FormColumns>
          </FormSection>
          <FormSection title="備考">
            <div className="space-y-2">
              <Label htmlFor="task_notes">備考</Label>
              <Textarea
                id="task_notes"
                value={form.notes}
                onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={3}
              />
            </div>
          </FormSection>
        </div>
      </FormModal>

      {/* 削除確認ダイアログ */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => { if (!open) setDeleteId(null) }}
        title="タスクを削除しますか？"
        description="この操作は取り消せません。"
        confirmLabel="削除"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  )
}
