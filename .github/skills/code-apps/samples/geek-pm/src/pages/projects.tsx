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
  useCreateProject,
  useUpdateProject,
  useDeleteProject,
} from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX } from "@/config"
import {
  PROJECT_STATUS_LABEL,
  PROJECT_STATUS_COLOR,
  PROJECT_STATUS_OPTIONS,
  PRIORITY_LABEL,
  PRIORITY_COLOR,
  PRIORITY_OPTIONS,
  type ProjectStatus,
  type Priority,
  type Project,
} from "@/types/dataverse"
import { Plus, Pencil, Trash2, Search } from "lucide-react"
import { toast } from "sonner"

function StatusBadge({ status }: { status: ProjectStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${PROJECT_STATUS_COLOR[status]}`}>
      {PROJECT_STATUS_LABEL[status]}
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
  name:        "",
  description: "",
  owner:       "",
  department:  "",
  status:      "",
  priority:    "",
  start_date:  "",
  end_date:    "",
  notes:       "",
}

type FormValues = typeof EMPTY_FORM

export default function Projects() {
  const { data: projects = [], isLoading } = useProjects()
  const createMutation = useCreateProject()
  const updateMutation = useUpdateProject()
  const deleteMutation = useDeleteProject()

  const [search, setSearch]           = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [priorityFilter, setPriorityFilter] = useState("all")
  const [page, setPage]               = useState(1)
  const [modalOpen, setModalOpen]     = useState(false)
  const [editingId, setEditingId]     = useState<string | null>(null)
  const [form, setForm]               = useState<FormValues>(EMPTY_FORM)
  const [deleteId, setDeleteId]       = useState<string | null>(null)
  const [isSaving, setIsSaving]       = useState(false)

  const P = PUBLISHER_PREFIX
  const f = {
    id:          `${P}_projectid`,
    name:        `${P}_name`,
    description: `${P}_description`,
    owner:       `${P}_owner`,
    department:  `${P}_department`,
    status:      `${P}_status`,
    priority:    `${P}_priority`,
    start_date:  `${P}_start_date`,
    end_date:    `${P}_end_date`,
    notes:       `${P}_notes`,
  }

  const ITEMS_PER_PAGE = 10

  const filtered = projects.filter((p) => {
    const name  = (p[f.name] as string ?? "").toLowerCase()
    const owner = (p[f.owner] as string ?? "").toLowerCase()
    const q     = search.toLowerCase()
    const matchSearch   = !q || name.includes(q) || owner.includes(q)
    const matchStatus   = statusFilter === "all"   || String(p[f.status])   === statusFilter
    const matchPriority = priorityFilter === "all" || String(p[f.priority]) === priorityFilter
    return matchSearch && matchStatus && matchPriority
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE))
  const paginated  = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE)

  function openCreate() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setModalOpen(true)
  }

  function openEdit(project: Project) {
    const id = project[f.id] as string
    setEditingId(id)
    setForm({
      name:        (project[f.name] as string) ?? "",
      description: (project[f.description] as string) ?? "",
      owner:       (project[f.owner] as string) ?? "",
      department:  (project[f.department] as string) ?? "",
      status:      String((project[f.status] as number) ?? ""),
      priority:    String((project[f.priority] as number) ?? ""),
      start_date:  (project[f.start_date] as string)?.slice(0, 10) ?? "",
      end_date:    (project[f.end_date] as string)?.slice(0, 10) ?? "",
      notes:       (project[f.notes] as string) ?? "",
    })
    setModalOpen(true)
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error("プロジェクト名は必須です")
      return
    }
    setIsSaving(true)
    try {
      const data: Record<string, unknown> = {
        [f.name]:        form.name,
        [f.description]: form.description || undefined,
        [f.owner]:       form.owner       || undefined,
        [f.department]:  form.department  || undefined,
        [f.status]:      form.status   ? Number(form.status)   : 100000000,
        [f.priority]:    form.priority ? Number(form.priority) : 100000000,
        [f.start_date]:  form.start_date  || undefined,
        [f.end_date]:    form.end_date    || undefined,
        [f.notes]:       form.notes       || undefined,
      }
      if (editingId) {
        await updateMutation.mutateAsync({ id: editingId, data })
        toast.success("プロジェクトを更新しました")
      } else {
        await createMutation.mutateAsync(data)
        toast.success("プロジェクトを登録しました")
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
      toast.success("プロジェクトを削除しました")
    } catch {
      toast.error("削除に失敗しました")
    } finally {
      setDeleteId(null)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">プロジェクト</h1>
        <LoadingSkeletonList count={5} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">プロジェクト</h1>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          新規登録
        </Button>
      </div>

      {/* フィルターバー */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="プロジェクト名・オーナーで検索..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1) }}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="ステータス" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">すべて</SelectItem>
            {PROJECT_STATUS_OPTIONS.map((opt) => (
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
                  <TableHead>プロジェクト名</TableHead>
                  <TableHead>オーナー</TableHead>
                  <TableHead>部門</TableHead>
                  <TableHead>ステータス</TableHead>
                  <TableHead>優先度</TableHead>
                  <TableHead>開始日</TableHead>
                  <TableHead>終了日</TableHead>
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
                  paginated.map((project, idx) => {
                    const status   = (project[f.status] as ProjectStatus) ?? 100000000
                    const priority = (project[f.priority] as Priority) ?? 100000000
                    const name     = (project[f.name] as string) ?? "—"
                    const owner    = (project[f.owner] as string) ?? "—"
                    const dept     = (project[f.department] as string) ?? "—"
                    const start    = (project[f.start_date] as string)?.slice(0, 10) ?? "—"
                    const end      = (project[f.end_date] as string)?.slice(0, 10) ?? "—"
                    const id       = project[f.id] as string
                    return (
                      <TableRow key={idx}>
                        <TableCell className="font-medium max-w-[180px] truncate">{name}</TableCell>
                        <TableCell>{owner}</TableCell>
                        <TableCell>{dept}</TableCell>
                        <TableCell><StatusBadge status={status} /></TableCell>
                        <TableCell><PriorityBadge priority={priority} /></TableCell>
                        <TableCell>{start}</TableCell>
                        <TableCell>{end}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              title="編集"
                              onClick={() => openEdit(project)}
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
        title={editingId ? "プロジェクトを編集" : "プロジェクトを新規登録"}
        onSave={handleSave}
        isSaving={isSaving}
        saveLabel={isSaving ? "保存中..." : "保存"}
      >
        <div className="space-y-6">
          <FormSection title="基本情報">
            <FormColumns columns={2}>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="name">プロジェクト名 <span className="text-destructive">*</span></Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="例: 新基幹システム開発"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="description">説明</Label>
                <Textarea
                  id="description"
                  value={form.description}
                  onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="owner">オーナー</Label>
                <Input
                  id="owner"
                  value={form.owner}
                  onChange={(e) => setForm(f => ({ ...f, owner: e.target.value }))}
                  placeholder="例: 田中 太郎"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="department">部門</Label>
                <Input
                  id="department"
                  value={form.department}
                  onChange={(e) => setForm(f => ({ ...f, department: e.target.value }))}
                  placeholder="例: 情報システム部"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">ステータス</Label>
                <Select value={form.status} onValueChange={(v) => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger id="status">
                    <SelectValue placeholder="選択してください" />
                  </SelectTrigger>
                  <SelectContent>
                    {PROJECT_STATUS_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="priority">優先度</Label>
                <Select value={form.priority} onValueChange={(v) => setForm(f => ({ ...f, priority: v }))}>
                  <SelectTrigger id="priority">
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
                <Label htmlFor="start_date">開始日</Label>
                <Input
                  id="start_date"
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm(f => ({ ...f, start_date: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end_date">終了日</Label>
                <Input
                  id="end_date"
                  type="date"
                  value={form.end_date}
                  onChange={(e) => setForm(f => ({ ...f, end_date: e.target.value }))}
                />
              </div>
            </FormColumns>
          </FormSection>
          <FormSection title="備考">
            <div className="space-y-2">
              <Label htmlFor="notes">備考</Label>
              <Textarea
                id="notes"
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
        title="プロジェクトを削除しますか？"
        description="この操作は取り消せません。"
        confirmLabel="削除"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  )
}
