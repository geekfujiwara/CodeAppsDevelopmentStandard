import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
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
  useDisposals,
  useCreateDisposal,
  useDeleteDisposal,
  useApproveDisposal,
  useCompleteDisposal,
} from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX, FEATURE_DISPOSAL } from "@/config"
import {
  DISPOSAL_STATUS_LABEL,
  DISPOSAL_STATUS_COLOR,
  type DisposalStatus,
  type Disposal,
} from "@/types/dataverse"
import { Plus, Trash2, Search, CheckCircle, PackageCheck } from "lucide-react"
import { toast } from "sonner"

function StatusBadge({ status }: { status: DisposalStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${DISPOSAL_STATUS_COLOR[status]}`}>
      {DISPOSAL_STATUS_LABEL[status]}
    </span>
  )
}

const EMPTY_FORM = {
  asset_name:    "",
  disposal_date: "",
  reason:        "",
  notes:         "",
}

type FormValues = typeof EMPTY_FORM

function DisabledFeatureCard() {
  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <Card className="max-w-lg w-full">
        <CardHeader>
          <CardTitle>この機能は無効です</CardTitle>
          <CardDescription>
            廃棄管理ページは現在無効になっています。有効にするには .env の{" "}
            <code className="bg-muted px-1 py-0.5 rounded text-sm">VITE_FEATURE_DISPOSAL=true</code>{" "}
            を設定してください。
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}

export default function DisposalPage() {
  if (!FEATURE_DISPOSAL) return <DisabledFeatureCard />
  return <DisposalContent />
}

function DisposalContent() {
  const { data: disposals = [], isLoading } = useDisposals()
  const createMutation  = useCreateDisposal()
  const deleteMutation  = useDeleteDisposal()
  const approveMutation = useApproveDisposal()
  const completeMutation = useCompleteDisposal()

  const [search, setSearch]       = useState("")
  const [page, setPage]           = useState(1)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm]           = useState<FormValues>(EMPTY_FORM)
  const [deleteId, setDeleteId]   = useState<string | null>(null)
  const [approveId, setApproveId] = useState<string | null>(null)
  const [completeId, setCompleteId] = useState<string | null>(null)
  const [isSaving, setIsSaving]   = useState(false)

  const P = PUBLISHER_PREFIX
  const f = {
    id:            `${P}_disposalid`,
    asset_name:    `${P}_asset_name`,
    disposal_date: `${P}_disposal_date`,
    reason:        `${P}_reason`,
    status:        `${P}_status`,
    notes:         `${P}_notes`,
  }

  const ITEMS_PER_PAGE = 10

  const filtered = disposals.filter((d) => {
    const name = (d[f.asset_name] as string ?? "").toLowerCase()
    const q    = search.toLowerCase()
    return !q || name.includes(q)
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE))
  const paginated  = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE)

  function openCreate() {
    setForm(EMPTY_FORM)
    setModalOpen(true)
  }

  async function handleSave() {
    if (!form.asset_name.trim()) {
      toast.error("資産名は必須です")
      return
    }
    setIsSaving(true)
    try {
      await createMutation.mutateAsync({
        [f.asset_name]:    form.asset_name,
        [f.disposal_date]: form.disposal_date || undefined,
        [f.reason]:        form.reason        || undefined,
        [f.notes]:         form.notes         || undefined,
        [f.status]:        100000000,  // 申請中
      })
      toast.success("廃棄申請を登録しました")
      setModalOpen(false)
    } catch {
      toast.error("登録に失敗しました")
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteId) return
    try {
      await deleteMutation.mutateAsync(deleteId)
      toast.success("廃棄申請を削除しました")
    } catch {
      toast.error("削除に失敗しました")
    } finally {
      setDeleteId(null)
    }
  }

  async function handleApprove() {
    if (!approveId) return
    try {
      await approveMutation.mutateAsync(approveId)
      toast.success("廃棄申請を承認しました")
    } catch {
      toast.error("承認に失敗しました")
    } finally {
      setApproveId(null)
    }
  }

  async function handleComplete() {
    if (!completeId) return
    try {
      await completeMutation.mutateAsync(completeId)
      toast.success("廃棄完了として記録しました")
    } catch {
      toast.error("更新に失敗しました")
    } finally {
      setCompleteId(null)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">廃棄管理</h1>
        <LoadingSkeletonList count={5} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">廃棄管理</h1>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          廃棄申請
        </Button>
      </div>

      {/* 検索バー */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="資産名で検索..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="pl-9"
          />
        </div>
      </div>

      {/* テーブル */}
      <Card>
        <CardContent className="p-0">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>資産名</TableHead>
                  <TableHead>廃棄予定日</TableHead>
                  <TableHead>理由</TableHead>
                  <TableHead>ステータス</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                      データがありません
                    </TableCell>
                  </TableRow>
                ) : (
                  paginated.map((disposal, idx) => {
                    const status  = (disposal[f.status] as DisposalStatus) ?? 100000000
                    const name    = (disposal[f.asset_name] as string) ?? "—"
                    const date    = (disposal[f.disposal_date] as string)?.slice(0, 10) ?? "—"
                    const reason  = (disposal[f.reason] as string) ?? "—"
                    const id      = disposal[f.id] as string
                    const isPending  = status === 100000000
                    const isApproved = status === 100000001

                    return (
                      <TableRow key={idx}>
                        <TableCell className="font-medium max-w-[180px] truncate">{name}</TableCell>
                        <TableCell>{date}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{reason}</TableCell>
                        <TableCell><StatusBadge status={status} /></TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {isPending && (
                              <Button
                                variant="ghost"
                                size="icon"
                                title="承認"
                                onClick={() => setApproveId(id)}
                              >
                                <CheckCircle className="h-4 w-4 text-blue-600" />
                              </Button>
                            )}
                            {isApproved && (
                              <Button
                                variant="ghost"
                                size="icon"
                                title="廃棄完了"
                                onClick={() => setCompleteId(id)}
                              >
                                <PackageCheck className="h-4 w-4 text-gray-600" />
                              </Button>
                            )}
                            {isPending && (
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

      {/* 廃棄申請モーダル */}
      <FormModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        title="廃棄申請を登録"
        onSave={handleSave}
        isSaving={isSaving}
        saveLabel={isSaving ? "保存中..." : "申請"}
      >
        <div className="space-y-6">
          <FormSection title="申請情報">
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
                <Label htmlFor="disposal_date">廃棄予定日</Label>
                <Input
                  id="disposal_date"
                  type="date"
                  value={form.disposal_date}
                  onChange={(e) => setForm(f => ({ ...f, disposal_date: e.target.value }))}
                />
              </div>
            </FormColumns>
            <div className="space-y-2">
              <Label htmlFor="reason">廃棄理由</Label>
              <Textarea
                id="reason"
                value={form.reason}
                onChange={(e) => setForm(f => ({ ...f, reason: e.target.value }))}
                rows={3}
                placeholder="例: 老朽化により使用不可"
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
        title="廃棄申請を削除しますか？"
        description="この操作は取り消せません。"
        confirmLabel="削除"
        variant="destructive"
        onConfirm={handleDelete}
      />

      {/* 承認確認 */}
      <ConfirmDialog
        open={!!approveId}
        onOpenChange={(open) => { if (!open) setApproveId(null) }}
        title="廃棄申請を承認しますか？"
        description="ステータスが「承認済み」に変わります。"
        confirmLabel="承認する"
        onConfirm={handleApprove}
      />

      {/* 廃棄完了確認 */}
      <ConfirmDialog
        open={!!completeId}
        onOpenChange={(open) => { if (!open) setCompleteId(null) }}
        title="廃棄完了として記録しますか？"
        description="ステータスが「廃棄完了」に変わります。この操作は取り消せません。"
        confirmLabel="廃棄完了"
        onConfirm={handleComplete}
      />
    </div>
  )
}
