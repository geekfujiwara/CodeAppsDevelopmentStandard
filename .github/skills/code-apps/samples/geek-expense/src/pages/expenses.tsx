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
  useExpenses,
  useCreateExpense,
  useUpdateExpense,
  useDeleteExpense,
  useSubmitExpense,
  useCurrentUserId,
} from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX } from "@/config"
import {
  EXPENSE_STATUS_LABEL,
  EXPENSE_STATUS_COLOR,
  EXPENSE_CATEGORY_LABEL,
  CATEGORY_OPTIONS,
  STATUS_OPTIONS,
  type ExpenseStatus,
  type ExpenseCategory,
  type Expense,
} from "@/types/dataverse"
import { Plus, Pencil, Send, Trash2, Search } from "lucide-react"
import { toast } from "sonner"

function StatusBadge({ status }: { status: ExpenseStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${EXPENSE_STATUS_COLOR[status]}`}>
      {EXPENSE_STATUS_LABEL[status]}
    </span>
  )
}

const EMPTY_FORM = {
  title: "",
  amount: "",
  category: "",
  expensedate: "",
  description: "",
  department: "",
  notes: "",
}

type FormValues = typeof EMPTY_FORM

export default function Expenses() {
  const { data: expenses = [], isLoading } = useExpenses()
  const { data: currentUserId = "" } = useCurrentUserId()
  const createMutation  = useCreateExpense()
  const updateMutation  = useUpdateExpense()
  const deleteMutation  = useDeleteExpense()
  const submitMutation  = useSubmitExpense()

  const [search, setSearch]           = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [page, setPage]               = useState(1)
  const [modalOpen, setModalOpen]     = useState(false)
  const [editingId, setEditingId]     = useState<string | null>(null)
  const [form, setForm]               = useState<FormValues>(EMPTY_FORM)
  const [deleteId, setDeleteId]       = useState<string | null>(null)
  const [submitId, setSubmitId]       = useState<string | null>(null)
  const [isSaving, setIsSaving]       = useState(false)

  const f = {
    id:          `${PUBLISHER_PREFIX}_expenseid`,
    title:       `${PUBLISHER_PREFIX}_title`,
    amount:      `${PUBLISHER_PREFIX}_amount`,
    category:    `${PUBLISHER_PREFIX}_category`,
    expensedate: `${PUBLISHER_PREFIX}_expensedate`,
    description: `${PUBLISHER_PREFIX}_description`,
    status:      `${PUBLISHER_PREFIX}_status`,
    department:  `${PUBLISHER_PREFIX}_department`,
    notes:       `${PUBLISHER_PREFIX}_notes`,
  }

  const ITEMS_PER_PAGE = 10

  const filtered = expenses.filter((e) => {
    const title = (e[f.title] as string ?? "").toLowerCase()
    const dept  = (e[f.department] as string ?? "").toLowerCase()
    const q     = search.toLowerCase()
    const matchSearch = !q || title.includes(q) || dept.includes(q)
    const matchStatus = statusFilter === "all" || String(e[f.status]) === statusFilter
    const matchCategory = categoryFilter === "all" || String(e[f.category]) === categoryFilter
    return matchSearch && matchStatus && matchCategory
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE))
  const paginated  = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE)

  function openCreate() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setModalOpen(true)
  }

  function openEdit(expense: Expense) {
    const id = expense[f.id] as string
    setEditingId(id)
    setForm({
      title:       (expense[f.title] as string) ?? "",
      amount:      String((expense[f.amount] as number) ?? ""),
      category:    String((expense[f.category] as number) ?? ""),
      expensedate: (expense[f.expensedate] as string)?.slice(0, 10) ?? "",
      description: (expense[f.description] as string) ?? "",
      department:  (expense[f.department] as string) ?? "",
      notes:       (expense[f.notes] as string) ?? "",
    })
    setModalOpen(true)
  }

  async function handleSave() {
    if (!form.title.trim()) {
      toast.error("件名は必須です")
      return
    }
    if (!form.amount || isNaN(Number(form.amount))) {
      toast.error("金額を正しく入力してください")
      return
    }
    setIsSaving(true)
    try {
      const data: Record<string, unknown> = {
        title:       form.title,
        amount:      Number(form.amount),
        category:    form.category ? Number(form.category) : undefined,
        expensedate: form.expensedate || undefined,
        description: form.description || undefined,
        department:  form.department || undefined,
        notes:       form.notes || undefined,
      }
      if (editingId) {
        await updateMutation.mutateAsync({ id: editingId, data })
        toast.success("経費を更新しました")
      } else {
        await createMutation.mutateAsync(data)
        toast.success("経費を作成しました")
      }
      setModalOpen(false)
    } catch (err) {
      toast.error(editingId ? "更新に失敗しました" : "作成に失敗しました")
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteId) return
    try {
      await deleteMutation.mutateAsync(deleteId)
      toast.success("経費を削除しました")
    } catch {
      toast.error("削除に失敗しました")
    } finally {
      setDeleteId(null)
    }
  }

  async function handleSubmit() {
    if (!submitId) return
    const expense = expenses.find((e) => (e[f.id] as string) === submitId)
    try {
      await submitMutation.mutateAsync({
        id:          submitId,
        title:       (expense?.[f.title] as string) ?? "",
        amount:      (expense?.[f.amount] as number) ?? 0,
        submittedBy: currentUserId,
      })
      toast.success("申請しました")
    } catch {
      toast.error("申請に失敗しました")
    } finally {
      setSubmitId(null)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">経費申請</h1>
        <LoadingSkeletonList count={5} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">経費申請</h1>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          新規作成
        </Button>
      </div>

      {/* フィルターバー */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="件名・部門で検索..."
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
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setPage(1) }}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="カテゴリ" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">すべて</SelectItem>
            {CATEGORY_OPTIONS.map((opt) => (
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
                  <TableHead>件名</TableHead>
                  <TableHead className="text-right">金額</TableHead>
                  <TableHead>カテゴリ</TableHead>
                  <TableHead>費用発生日</TableHead>
                  <TableHead>ステータス</TableHead>
                  <TableHead>部門</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                      データがありません
                    </TableCell>
                  </TableRow>
                ) : (
                  paginated.map((expense, idx) => {
                    const status   = (expense[f.status] as ExpenseStatus) ?? 100000000
                    const category = expense[f.category] as ExpenseCategory
                    const amount   = (expense[f.amount] as number) ?? 0
                    const title    = (expense[f.title] as string) ?? "—"
                    const dept     = (expense[f.department] as string) ?? "—"
                    const date     = (expense[f.expensedate] as string)?.slice(0, 10) ?? "—"
                    const id       = expense[f.id] as string
                    const isDraft  = status === 100000000
                    const isRejected = status === 100000003

                    return (
                      <TableRow key={idx}>
                        <TableCell className="font-medium max-w-[200px] truncate">{title}</TableCell>
                        <TableCell className="text-right">¥{amount.toLocaleString()}</TableCell>
                        <TableCell>{category != null ? EXPENSE_CATEGORY_LABEL[category] : "—"}</TableCell>
                        <TableCell>{date}</TableCell>
                        <TableCell><StatusBadge status={status} /></TableCell>
                        <TableCell>{dept}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {(isDraft || isRejected) && (
                              <Button
                                variant="ghost"
                                size="icon"
                                title="編集"
                                onClick={() => openEdit(expense)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            )}
                            {isDraft && (
                              <Button
                                variant="ghost"
                                size="icon"
                                title="申請"
                                onClick={() => setSubmitId(id)}
                              >
                                <Send className="h-4 w-4 text-yellow-600" />
                              </Button>
                            )}
                            {(isDraft || isRejected) && (
                              <Button
                                variant="ghost"
                                size="icon"
                                title="削除"
                                onClick={() => setDeleteId(id)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
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
        title={editingId ? "経費を編集" : "経費を新規作成"}
        onSave={handleSave}
        isSaving={isSaving}
        saveLabel={isSaving ? "保存中..." : "保存"}
      >
        <div className="space-y-6">
          <FormSection title="基本情報">
            <FormColumns columns={2}>
              <div className="space-y-2">
                <Label htmlFor="title">件名 <span className="text-destructive">*</span></Label>
                <Input
                  id="title"
                  value={form.title}
                  onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="例: 4月出張交通費"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount">金額 (円) <span className="text-destructive">*</span></Label>
                <Input
                  id="amount"
                  type="number"
                  value={form.amount}
                  onChange={(e) => setForm(f => ({ ...f, amount: e.target.value }))}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">カテゴリ</Label>
                <Select value={form.category} onValueChange={(v) => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger id="category">
                    <SelectValue placeholder="選択してください" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="expensedate">費用発生日</Label>
                <Input
                  id="expensedate"
                  type="date"
                  value={form.expensedate}
                  onChange={(e) => setForm(f => ({ ...f, expensedate: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="department">部門</Label>
                <Input
                  id="department"
                  value={form.department}
                  onChange={(e) => setForm(f => ({ ...f, department: e.target.value }))}
                  placeholder="例: 営業部"
                />
              </div>
            </FormColumns>
          </FormSection>
          <FormSection title="詳細">
            <div className="space-y-2">
              <Label htmlFor="description">内容</Label>
              <Textarea
                id="description"
                value={form.description}
                onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="費用の詳細を入力してください"
                rows={3}
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

      {/* 削除確認ダイアログ */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => { if (!open) setDeleteId(null) }}
        title="経費を削除しますか？"
        description="この操作は取り消せません。"
        confirmLabel="削除"
        variant="destructive"
        onConfirm={handleDelete}
      />

      {/* 申請確認ダイアログ */}
      <ConfirmDialog
        open={!!submitId}
        onOpenChange={(open) => { if (!open) setSubmitId(null) }}
        title="申請しますか？"
        description="申請すると、ステータスが「申請中」に変わります。"
        confirmLabel="申請する"
        onConfirm={handleSubmit}
      />
    </div>
  )
}
