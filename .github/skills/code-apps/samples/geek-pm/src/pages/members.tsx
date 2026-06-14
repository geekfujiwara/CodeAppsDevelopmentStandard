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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
  useProjects,
  useMembers,
  useCreateMember,
  useUpdateMember,
  useDeleteMember,
} from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX, FEATURE_MEMBERS } from "@/config"
import { type Member } from "@/types/dataverse"
import { Plus, Pencil, Trash2, Search, Info } from "lucide-react"
import { toast } from "sonner"

function DisabledFeatureCard() {
  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <Card className="max-w-md w-full">
        <CardHeader>
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Info className="h-5 w-5" />
          </div>
          <CardTitle>メンバー管理は無効です</CardTitle>
          <CardDescription>
            この機能を有効にするには、<code className="bg-muted px-1 rounded text-xs">VITE_FEATURE_MEMBERS=true</code> を
            <code className="bg-muted px-1 rounded text-xs">.env</code> に設定して再起動してください。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="bg-muted rounded-md p-3 text-xs overflow-x-auto">
            {`# .env\nVITE_FEATURE_MEMBERS=true`}
          </pre>
        </CardContent>
      </Card>
    </div>
  )
}

const EMPTY_FORM = {
  name:       "",
  project_id: "",
  role:       "",
  email:      "",
  join_date:  "",
  notes:      "",
}

type FormValues = typeof EMPTY_FORM

export default function Members() {
  if (!FEATURE_MEMBERS) return <DisabledFeatureCard />

  const { data: projects = [] }           = useProjects()
  const { data: members = [], isLoading } = useMembers()
  const createMutation = useCreateMember()
  const updateMutation = useUpdateMember()
  const deleteMutation = useDeleteMember()

  const [search, setSearch]               = useState("")
  const [projectFilter, setProjectFilter] = useState("all")
  const [page, setPage]                   = useState(1)
  const [modalOpen, setModalOpen]         = useState(false)
  const [editingId, setEditingId]         = useState<string | null>(null)
  const [form, setForm]                   = useState<FormValues>(EMPTY_FORM)
  const [deleteId, setDeleteId]           = useState<string | null>(null)
  const [isSaving, setIsSaving]           = useState(false)

  const P = PUBLISHER_PREFIX
  const f = {
    id:         `${P}_memberid`,
    name:       `${P}_name`,
    project_id: `${P}_project_id`,
    project_fmt:`${P}_project_id_formatted`,
    role:       `${P}_role`,
    email:      `${P}_email`,
    join_date:  `${P}_join_date`,
    notes:      `${P}_notes`,
  }

  const fp = {
    id:   `${P}_projectid`,
    name: `${P}_name`,
  }

  const ITEMS_PER_PAGE = 10

  const filtered = members.filter((m) => {
    const name  = (m[f.name] as string ?? "").toLowerCase()
    const role  = (m[f.role] as string ?? "").toLowerCase()
    const email = (m[f.email] as string ?? "").toLowerCase()
    const q     = search.toLowerCase()
    const matchSearch  = !q || name.includes(q) || role.includes(q) || email.includes(q)
    const matchProject = projectFilter === "all" || String(m[f.project_id]) === projectFilter
    return matchSearch && matchProject
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE))
  const paginated  = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE)

  function openCreate() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setModalOpen(true)
  }

  function openEdit(member: Member) {
    const id = member[f.id] as string
    setEditingId(id)
    setForm({
      name:       (member[f.name] as string) ?? "",
      project_id: (member[f.project_id] as string) ?? "",
      role:       (member[f.role] as string) ?? "",
      email:      (member[f.email] as string) ?? "",
      join_date:  (member[f.join_date] as string)?.slice(0, 10) ?? "",
      notes:      (member[f.notes] as string) ?? "",
    })
    setModalOpen(true)
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error("メンバー名は必須です")
      return
    }
    setIsSaving(true)
    try {
      const data: Record<string, unknown> = {
        [f.name]:      form.name,
        [f.role]:      form.role      || undefined,
        [f.email]:     form.email     || undefined,
        [f.join_date]: form.join_date || undefined,
        [f.notes]:     form.notes     || undefined,
      }
      if (form.project_id) {
        data[`${P}_project_id@odata.bind`] = `/${P}_projects(${form.project_id})`
      }
      if (editingId) {
        await updateMutation.mutateAsync({ id: editingId, data })
        toast.success("メンバーを更新しました")
      } else {
        await createMutation.mutateAsync(data)
        toast.success("メンバーを登録しました")
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
      toast.success("メンバーを削除しました")
    } catch {
      toast.error("削除に失敗しました")
    } finally {
      setDeleteId(null)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">メンバー</h1>
        <LoadingSkeletonList count={5} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">メンバー</h1>
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
            placeholder="メンバー名・役割・メールで検索..."
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
      </div>

      {/* テーブル */}
      <Card>
        <CardContent className="p-0">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>メンバー名</TableHead>
                  <TableHead>プロジェクト</TableHead>
                  <TableHead>役割</TableHead>
                  <TableHead>メール</TableHead>
                  <TableHead>参加日</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      データがありません
                    </TableCell>
                  </TableRow>
                ) : (
                  paginated.map((member, idx) => {
                    const name    = (member[f.name] as string) ?? "—"
                    const project = (member[f.project_fmt] as string) ?? "—"
                    const role    = (member[f.role] as string) ?? "—"
                    const email   = (member[f.email] as string) ?? "—"
                    const join    = (member[f.join_date] as string)?.slice(0, 10) ?? "—"
                    const id      = member[f.id] as string
                    return (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">{name}</TableCell>
                        <TableCell className="max-w-[140px] truncate">{project}</TableCell>
                        <TableCell>{role}</TableCell>
                        <TableCell>{email}</TableCell>
                        <TableCell>{join}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              title="編集"
                              onClick={() => openEdit(member)}
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
        title={editingId ? "メンバーを編集" : "メンバーを新規登録"}
        onSave={handleSave}
        isSaving={isSaving}
        saveLabel={isSaving ? "保存中..." : "保存"}
      >
        <div className="space-y-6">
          <FormSection title="メンバー情報">
            <FormColumns columns={2}>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="member_name">メンバー名 <span className="text-destructive">*</span></Label>
                <Input
                  id="member_name"
                  value={form.name}
                  onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="例: 山田 次郎"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="member_project">プロジェクト</Label>
                <Select value={form.project_id} onValueChange={(v) => setForm(f => ({ ...f, project_id: v }))}>
                  <SelectTrigger id="member_project">
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
                <Label htmlFor="role">役割</Label>
                <Input
                  id="role"
                  value={form.role}
                  onChange={(e) => setForm(f => ({ ...f, role: e.target.value }))}
                  placeholder="例: プロジェクトマネージャー"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">メール</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="例: yamada@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="join_date">参加日</Label>
                <Input
                  id="join_date"
                  type="date"
                  value={form.join_date}
                  onChange={(e) => setForm(f => ({ ...f, join_date: e.target.value }))}
                />
              </div>
            </FormColumns>
          </FormSection>
          <FormSection title="備考">
            <div className="space-y-2">
              <Label htmlFor="member_notes">備考</Label>
              <Textarea
                id="member_notes"
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
        title="メンバーを削除しますか？"
        description="この操作は取り消せません。"
        confirmLabel="削除"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  )
}
