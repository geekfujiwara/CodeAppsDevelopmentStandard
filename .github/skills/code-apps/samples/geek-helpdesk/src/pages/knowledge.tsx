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
  useKnowledge,
  useCreateKnowledge,
  useUpdateKnowledge,
  useDeleteKnowledge,
} from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX, FEATURE_KNOWLEDGE } from "@/config"
import {
  KNOWLEDGE_STATUS_LABEL,
  KNOWLEDGE_STATUS_COLOR,
  KNOWLEDGE_STATUS_OPTIONS,
  type KnowledgeStatus,
  type Knowledge,
} from "@/types/dataverse"
import { Plus, Pencil, Trash2, Search } from "lucide-react"
import { toast } from "sonner"

function KnowledgeStatusBadge({ status }: { status: KnowledgeStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${KNOWLEDGE_STATUS_COLOR[status]}`}>
      {KNOWLEDGE_STATUS_LABEL[status]}
    </span>
  )
}

const EMPTY_FORM = {
  name:     "",
  content:  "",
  category: "",
  author:   "",
  status:   "",
  tags:     "",
  notes:    "",
}

type FormValues = typeof EMPTY_FORM

function DisabledFeatureCard() {
  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <Card className="max-w-lg w-full">
        <CardHeader>
          <CardTitle>この機能は無効です</CardTitle>
          <CardDescription>
            ナレッジベースは現在無効になっています。有効にするには .env の{" "}
            <code className="bg-muted px-1 py-0.5 rounded text-sm">VITE_FEATURE_KNOWLEDGE=true</code>{" "}
            を設定してください。
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}

export default function KnowledgePage() {
  if (!FEATURE_KNOWLEDGE) return <DisabledFeatureCard />
  return <KnowledgeContent />
}

function KnowledgeContent() {
  const { data: articles = [], isLoading } = useKnowledge()
  const createMutation = useCreateKnowledge()
  const updateMutation = useUpdateKnowledge()
  const deleteMutation = useDeleteKnowledge()

  const [search, setSearch]           = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [page, setPage]               = useState(1)
  const [modalOpen, setModalOpen]     = useState(false)
  const [editingId, setEditingId]     = useState<string | null>(null)
  const [form, setForm]               = useState<FormValues>(EMPTY_FORM)
  const [deleteId, setDeleteId]       = useState<string | null>(null)
  const [isSaving, setIsSaving]       = useState(false)

  const P = PUBLISHER_PREFIX
  const f = {
    id:       `${P}_knowledgeid`,
    name:     `${P}_name`,
    content:  `${P}_content`,
    category: `${P}_category`,
    author:   `${P}_author`,
    status:   `${P}_status`,
    tags:     `${P}_tags`,
    notes:    `${P}_notes`,
  }

  const ITEMS_PER_PAGE = 10

  const filtered = articles.filter((a) => {
    const name     = (a[f.name]     as string ?? "").toLowerCase()
    const category = (a[f.category] as string ?? "").toLowerCase()
    const author   = (a[f.author]   as string ?? "").toLowerCase()
    const q = search.toLowerCase()
    const matchSearch = !q || name.includes(q) || category.includes(q) || author.includes(q)
    const matchStatus = statusFilter === "all" || String(a[f.status]) === statusFilter
    return matchSearch && matchStatus
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE))
  const paginated  = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE)

  function openCreate() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setModalOpen(true)
  }

  function openEdit(article: Knowledge) {
    const id = article[f.id] as string
    setEditingId(id)
    setForm({
      name:     (article[f.name]     as string) ?? "",
      content:  (article[f.content]  as string) ?? "",
      category: (article[f.category] as string) ?? "",
      author:   (article[f.author]   as string) ?? "",
      status:   String((article[f.status] as number) ?? ""),
      tags:     (article[f.tags]     as string) ?? "",
      notes:    (article[f.notes]    as string) ?? "",
    })
    setModalOpen(true)
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error("タイトルは必須です")
      return
    }
    setIsSaving(true)
    try {
      const data: Record<string, unknown> = {
        [f.name]:     form.name,
        [f.content]:  form.content  || undefined,
        [f.category]: form.category || undefined,
        [f.author]:   form.author   || undefined,
        [f.status]:   form.status ? Number(form.status) : 100000000,
        [f.tags]:     form.tags     || undefined,
        [f.notes]:    form.notes    || undefined,
      }
      if (editingId) {
        await updateMutation.mutateAsync({ id: editingId, data })
        toast.success("ナレッジ記事を更新しました")
      } else {
        await createMutation.mutateAsync(data)
        toast.success("ナレッジ記事を登録しました")
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
      toast.success("ナレッジ記事を削除しました")
    } catch {
      toast.error("削除に失敗しました")
    } finally {
      setDeleteId(null)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">ナレッジベース</h1>
        <LoadingSkeletonList count={5} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">ナレッジベース</h1>
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
            placeholder="タイトル・カテゴリ・作成者で検索..."
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
            {KNOWLEDGE_STATUS_OPTIONS.map((opt) => (
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
                  <TableHead>タイトル</TableHead>
                  <TableHead>カテゴリ</TableHead>
                  <TableHead>作成者</TableHead>
                  <TableHead>ステータス</TableHead>
                  <TableHead>タグ</TableHead>
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
                  paginated.map((article, idx) => {
                    const status   = (article[f.status]   as KnowledgeStatus) ?? 100000000
                    const name     = (article[f.name]     as string) ?? "—"
                    const category = (article[f.category] as string) ?? "—"
                    const author   = (article[f.author]   as string) ?? "—"
                    const tags     = (article[f.tags]     as string) ?? "—"
                    const id       = article[f.id] as string

                    return (
                      <TableRow key={idx}>
                        <TableCell className="font-medium max-w-[200px] truncate">{name}</TableCell>
                        <TableCell>{category}</TableCell>
                        <TableCell>{author}</TableCell>
                        <TableCell><KnowledgeStatusBadge status={status} /></TableCell>
                        <TableCell className="max-w-[150px] truncate text-muted-foreground text-sm">{tags}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" title="編集" onClick={() => openEdit(article)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" title="削除" onClick={() => setDeleteId(id)}>
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
        title={editingId ? "ナレッジ記事を編集" : "ナレッジ記事を新規登録"}
        onSave={handleSave}
        isSaving={isSaving}
        saveLabel={isSaving ? "保存中..." : "保存"}
      >
        <div className="space-y-6">
          <FormSection title="基本情報">
            <FormColumns columns={2}>
              <div className="space-y-2 col-span-2">
                <Label htmlFor="name">タイトル <span className="text-destructive">*</span></Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="例: VPN接続方法"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">カテゴリ</Label>
                <Input
                  id="category"
                  value={form.category}
                  onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))}
                  placeholder="例: ネットワーク, メール"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="author">作成者</Label>
                <Input
                  id="author"
                  value={form.author}
                  onChange={(e) => setForm(f => ({ ...f, author: e.target.value }))}
                  placeholder="例: 山田 太郎"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">ステータス</Label>
                <Select value={form.status} onValueChange={(v) => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger id="status">
                    <SelectValue placeholder="選択してください" />
                  </SelectTrigger>
                  <SelectContent>
                    {KNOWLEDGE_STATUS_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="tags">タグ</Label>
                <Input
                  id="tags"
                  value={form.tags}
                  onChange={(e) => setForm(f => ({ ...f, tags: e.target.value }))}
                  placeholder="例: パスワード, VPN, メール"
                />
              </div>
            </FormColumns>
          </FormSection>
          <FormSection title="内容">
            <div className="space-y-2">
              <Label htmlFor="content">内容</Label>
              <Textarea
                id="content"
                value={form.content}
                onChange={(e) => setForm(f => ({ ...f, content: e.target.value }))}
                rows={6}
                placeholder="手順・説明を記入してください"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">備考</Label>
              <Textarea
                id="notes"
                value={form.notes}
                onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={2}
              />
            </div>
          </FormSection>
        </div>
      </FormModal>

      {/* 削除確認 */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => { if (!open) setDeleteId(null) }}
        title="ナレッジ記事を削除しますか？"
        description="この操作は取り消せません。"
        confirmLabel="削除"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  )
}
