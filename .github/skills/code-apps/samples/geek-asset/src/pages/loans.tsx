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
  useLoans,
  useCreateLoan,
  useUpdateLoan,
  useDeleteLoan,
  useReturnLoan,
} from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX } from "@/config"
import {
  LOAN_STATUS_LABEL,
  LOAN_STATUS_COLOR,
  LOAN_STATUS_OPTIONS,
  type LoanStatus,
  type Loan,
} from "@/types/dataverse"
import { Plus, Pencil, Trash2, Search, RotateCcw } from "lucide-react"
import { toast } from "sonner"

function StatusBadge({ status }: { status: LoanStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${LOAN_STATUS_COLOR[status]}`}>
      {LOAN_STATUS_LABEL[status]}
    </span>
  )
}

const EMPTY_FORM = {
  asset_name:      "",
  borrower_name:   "",
  loan_date:       "",
  return_due_date: "",
  notes:           "",
}

type FormValues = typeof EMPTY_FORM

export default function Loans() {
  const { data: loans = [], isLoading } = useLoans()
  const createMutation = useCreateLoan()
  const updateMutation = useUpdateLoan()
  const deleteMutation = useDeleteLoan()
  const returnMutation = useReturnLoan()

  const [search, setSearch]           = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [page, setPage]               = useState(1)
  const [modalOpen, setModalOpen]     = useState(false)
  const [editingId, setEditingId]     = useState<string | null>(null)
  const [form, setForm]               = useState<FormValues>(EMPTY_FORM)
  const [deleteId, setDeleteId]       = useState<string | null>(null)
  const [returnId, setReturnId]       = useState<string | null>(null)
  const [isSaving, setIsSaving]       = useState(false)

  const P = PUBLISHER_PREFIX
  const f = {
    id:              `${P}_loanid`,
    asset_name:      `${P}_asset_name`,
    borrower_name:   `${P}_borrower_name`,
    loan_date:       `${P}_loan_date`,
    return_due_date: `${P}_return_due_date`,
    return_date:     `${P}_return_date`,
    status:          `${P}_status`,
    notes:           `${P}_notes`,
  }

  const today = new Date().toISOString().slice(0, 10)
  const ITEMS_PER_PAGE = 10

  const filtered = loans.filter((l) => {
    const asset    = (l[f.asset_name] as string ?? "").toLowerCase()
    const borrower = (l[f.borrower_name] as string ?? "").toLowerCase()
    const q = search.toLowerCase()
    const matchSearch = !q || asset.includes(q) || borrower.includes(q)
    const matchStatus = statusFilter === "all" || String(l[f.status]) === statusFilter
    return matchSearch && matchStatus
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE))
  const paginated  = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE)

  function openCreate() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setModalOpen(true)
  }

  function openEdit(loan: Loan) {
    const id = loan[f.id] as string
    setEditingId(id)
    setForm({
      asset_name:      (loan[f.asset_name] as string) ?? "",
      borrower_name:   (loan[f.borrower_name] as string) ?? "",
      loan_date:       (loan[f.loan_date] as string)?.slice(0, 10) ?? "",
      return_due_date: (loan[f.return_due_date] as string)?.slice(0, 10) ?? "",
      notes:           (loan[f.notes] as string) ?? "",
    })
    setModalOpen(true)
  }

  async function handleSave() {
    if (!form.asset_name.trim()) {
      toast.error("資産名は必須です")
      return
    }
    if (!form.borrower_name.trim()) {
      toast.error("借用者名は必須です")
      return
    }
    setIsSaving(true)
    try {
      const data: Record<string, unknown> = {
        [f.asset_name]:      form.asset_name,
        [f.borrower_name]:   form.borrower_name,
        [f.loan_date]:       form.loan_date       || undefined,
        [f.return_due_date]: form.return_due_date || undefined,
        [f.notes]:           form.notes           || undefined,
        ...(!editingId ? { [f.status]: 100000000 } : {}), // default: 貸出中
      }
      if (editingId) {
        await updateMutation.mutateAsync({ id: editingId, data })
        toast.success("貸出情報を更新しました")
      } else {
        await createMutation.mutateAsync(data)
        toast.success("貸出を登録しました")
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
      toast.success("貸出記録を削除しました")
    } catch {
      toast.error("削除に失敗しました")
    } finally {
      setDeleteId(null)
    }
  }

  async function handleReturn() {
    if (!returnId) return
    try {
      await returnMutation.mutateAsync(returnId)
      toast.success("返却処理が完了しました")
    } catch {
      toast.error("返却処理に失敗しました")
    } finally {
      setReturnId(null)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">貸出管理</h1>
        <LoadingSkeletonList count={5} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">貸出管理</h1>
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
            placeholder="資産名・借用者で検索..."
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
            {LOAN_STATUS_OPTIONS.map((opt) => (
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
                  <TableHead>資産名</TableHead>
                  <TableHead>借用者</TableHead>
                  <TableHead>貸出日</TableHead>
                  <TableHead>返却期限</TableHead>
                  <TableHead>返却日</TableHead>
                  <TableHead>ステータス</TableHead>
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
                  paginated.map((loan, idx) => {
                    const status     = (loan[f.status] as LoanStatus) ?? 100000000
                    const assetName  = (loan[f.asset_name] as string) ?? "—"
                    const borrower   = (loan[f.borrower_name] as string) ?? "—"
                    const loanDate   = (loan[f.loan_date] as string)?.slice(0, 10) ?? "—"
                    const dueDate    = (loan[f.return_due_date] as string)?.slice(0, 10) ?? "—"
                    const retDate    = (loan[f.return_date] as string)?.slice(0, 10) ?? "—"
                    const id         = loan[f.id] as string
                    const isOnLoan   = status === 100000000
                    const isReturned = status === 100000001
                    const isOverdue  = isOnLoan && dueDate !== "—" && dueDate < today

                    return (
                      <TableRow key={idx}>
                        <TableCell className="font-medium max-w-[180px] truncate">{assetName}</TableCell>
                        <TableCell>{borrower}</TableCell>
                        <TableCell>{loanDate}</TableCell>
                        <TableCell>
                          <span className={isOverdue ? "text-red-600 font-medium" : ""}>
                            {dueDate}
                            {isOverdue && (
                              <span className="ml-1 inline-flex items-center rounded-full bg-red-100 text-red-800 px-1.5 py-0.5 text-xs font-medium">
                                延滞
                              </span>
                            )}
                          </span>
                        </TableCell>
                        <TableCell>{isReturned ? retDate : "—"}</TableCell>
                        <TableCell><StatusBadge status={status} /></TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {!isReturned && (
                              <Button
                                variant="ghost"
                                size="icon"
                                title="編集"
                                onClick={() => openEdit(loan)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            )}
                            {isOnLoan && (
                              <Button
                                variant="ghost"
                                size="icon"
                                title="返却処理"
                                onClick={() => setReturnId(id)}
                              >
                                <RotateCcw className="h-4 w-4 text-green-600" />
                              </Button>
                            )}
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
        title={editingId ? "貸出情報を編集" : "貸出を新規登録"}
        onSave={handleSave}
        isSaving={isSaving}
        saveLabel={isSaving ? "保存中..." : "保存"}
      >
        <div className="space-y-6">
          <FormSection title="基本情報">
            <FormColumns columns={2}>
              <div className="space-y-2">
                <Label htmlFor="asset_name">資産名 <span className="text-destructive">*</span></Label>
                <Input
                  id="asset_name"
                  value={form.asset_name}
                  onChange={(e) => setForm(f => ({ ...f, asset_name: e.target.value }))}
                  placeholder="例: ThinkPad X1 Carbon"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="borrower_name">借用者 <span className="text-destructive">*</span></Label>
                <Input
                  id="borrower_name"
                  value={form.borrower_name}
                  onChange={(e) => setForm(f => ({ ...f, borrower_name: e.target.value }))}
                  placeholder="例: 山田 太郎"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="loan_date">貸出日</Label>
                <Input
                  id="loan_date"
                  type="date"
                  value={form.loan_date}
                  onChange={(e) => setForm(f => ({ ...f, loan_date: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="return_due_date">返却期限</Label>
                <Input
                  id="return_due_date"
                  type="date"
                  value={form.return_due_date}
                  onChange={(e) => setForm(f => ({ ...f, return_due_date: e.target.value }))}
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
        title="貸出記録を削除しますか？"
        description="この操作は取り消せません。"
        confirmLabel="削除"
        variant="destructive"
        onConfirm={handleDelete}
      />

      {/* 返却確認ダイアログ */}
      <ConfirmDialog
        open={!!returnId}
        onOpenChange={(open) => { if (!open) setReturnId(null) }}
        title="返却処理を行いますか？"
        description="返却日が本日の日付で記録され、ステータスが「返却済み」になります。"
        confirmLabel="返却する"
        onConfirm={handleReturn}
      />
    </div>
  )
}
