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
  useInventoryChecks,
  useCreateInventoryCheck,
  useUpdateInventoryCheck,
  useDeleteInventoryCheck,
} from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX, FEATURE_INVENTORY } from "@/config"
import {
  INVENTORY_RESULT_LABEL,
  INVENTORY_RESULT_COLOR,
  INVENTORY_RESULT_OPTIONS,
  type InventoryCheckResult,
  type InventoryCheck,
} from "@/types/dataverse"
import { Plus, Pencil, Trash2, Search } from "lucide-react"
import { toast } from "sonner"

function ResultBadge({ result }: { result: InventoryCheckResult }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${INVENTORY_RESULT_COLOR[result]}`}>
      {INVENTORY_RESULT_LABEL[result]}
    </span>
  )
}

const EMPTY_FORM = {
  asset_name: "",
  check_date: "",
  result:     "",
  checker:    "",
  notes:      "",
}

type FormValues = typeof EMPTY_FORM

function DisabledFeatureCard() {
  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <Card className="max-w-lg w-full">
        <CardHeader>
          <CardTitle>この機能は無効です</CardTitle>
          <CardDescription>
            棚卸ページは現在無効になっています。有効にするには .env の{" "}
            <code className="bg-muted px-1 py-0.5 rounded text-sm">VITE_FEATURE_INVENTORY=true</code>{" "}
            を設定してください。
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}

export default function InventoryPage() {
  if (!FEATURE_INVENTORY) return <DisabledFeatureCard />
  return <InventoryContent />
}

function InventoryContent() {
  const { data: checks = [], isLoading } = useInventoryChecks()
  const createMutation = useCreateInventoryCheck()
  const updateMutation = useUpdateInventoryCheck()
  const deleteMutation = useDeleteInventoryCheck()

  const [search, setSearch]         = useState("")
  const [resultFilter, setResultFilter] = useState("all")
  const [page, setPage]             = useState(1)
  const [modalOpen, setModalOpen]   = useState(false)
  const [editingId, setEditingId]   = useState<string | null>(null)
  const [form, setForm]             = useState<FormValues>(EMPTY_FORM)
  const [deleteId, setDeleteId]     = useState<string | null>(null)
  const [isSaving, setIsSaving]     = useState(false)

  const P = PUBLISHER_PREFIX
  const f = {
    id:         `${P}_inventory_checkid`,
    asset_name: `${P}_asset_name`,
    check_date: `${P}_check_date`,
    result:     `${P}_result`,
    checker:    `${P}_checker`,
    notes:      `${P}_notes`,
  }

  const ITEMS_PER_PAGE = 10

  const filtered = checks.filter((c) => {
    const name    = (c[f.asset_name] as string ?? "").toLowerCase()
    const checker = (c[f.checker] as string ?? "").toLowerCase()
    const q = search.toLowerCase()
    const matchSearch = !q || name.includes(q) || checker.includes(q)
    const matchResult = resultFilter === "all" || String(c[f.result]) === resultFilter
    return matchSearch && matchResult
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE))
  const paginated  = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE)

  function openCreate() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setModalOpen(true)
  }

  function openEdit(check: InventoryCheck) {
    const id = check[f.id] as string
    setEditingId(id)
    setForm({
      asset_name: (check[f.asset_name] as string) ?? "",
      check_date: (check[f.check_date] as string)?.slice(0, 10) ?? "",
      result:     String((check[f.result] as number) ?? ""),
      checker:    (check[f.checker] as string) ?? "",
      notes:      (check[f.notes] as string) ?? "",
    })
    setModalOpen(true)
  }

  async function handleSave() {
    if (!form.asset_name.trim()) {
      toast.error("資産名は必須です")
      return
    }
    setIsSaving(true)
    try {
      const data: Record<string, unknown> = {
        [f.asset_name]: form.asset_name,
        [f.check_date]: form.check_date || undefined,
        [f.result]:     form.result ? Number(form.result) : 100000000,
        [f.checker]:    form.checker || undefined,
        [f.notes]:      form.notes   || undefined,
      }
      if (editingId) {
        await updateMutation.mutateAsync({ id: editingId, data })
        toast.success("棚卸情報を更新しました")
      } else {
        await createMutation.mutateAsync(data)
        toast.success("棚卸を登録しました")
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
      toast.success("棚卸記録を削除しました")
    } catch {
      toast.error("削除に失敗しました")
    } finally {
      setDeleteId(null)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">棚卸</h1>
        <LoadingSkeletonList count={5} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">棚卸</h1>
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
            placeholder="資産名・担当者で検索..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="pl-9"
          />
        </div>
        <Select value={resultFilter} onValueChange={(v) => { setResultFilter(v); setPage(1) }}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="結果" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">すべて</SelectItem>
            {INVENTORY_RESULT_OPTIONS.map((opt) => (
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
                  <TableHead>確認日</TableHead>
                  <TableHead>結果</TableHead>
                  <TableHead>担当者</TableHead>
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
                  paginated.map((check, idx) => {
                    const result  = (check[f.result] as InventoryCheckResult) ?? 100000000
                    const name    = (check[f.asset_name] as string) ?? "—"
                    const date    = (check[f.check_date] as string)?.slice(0, 10) ?? "—"
                    const checker = (check[f.checker] as string) ?? "—"
                    const id      = check[f.id] as string

                    return (
                      <TableRow key={idx}>
                        <TableCell className="font-medium max-w-[180px] truncate">{name}</TableCell>
                        <TableCell>{date}</TableCell>
                        <TableCell><ResultBadge result={result} /></TableCell>
                        <TableCell>{checker}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              title="編集"
                              onClick={() => openEdit(check)}
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
        title={editingId ? "棚卸情報を編集" : "棚卸を新規登録"}
        onSave={handleSave}
        isSaving={isSaving}
        saveLabel={isSaving ? "保存中..." : "保存"}
      >
        <div className="space-y-6">
          <FormSection title="棚卸情報">
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
                <Label htmlFor="check_date">確認日</Label>
                <Input
                  id="check_date"
                  type="date"
                  value={form.check_date}
                  onChange={(e) => setForm(f => ({ ...f, check_date: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="result">結果</Label>
                <Select value={form.result} onValueChange={(v) => setForm(f => ({ ...f, result: v }))}>
                  <SelectTrigger id="result">
                    <SelectValue placeholder="選択してください" />
                  </SelectTrigger>
                  <SelectContent>
                    {INVENTORY_RESULT_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="checker">担当者</Label>
                <Input
                  id="checker"
                  value={form.checker}
                  onChange={(e) => setForm(f => ({ ...f, checker: e.target.value }))}
                  placeholder="例: 山田 太郎"
                />
              </div>
            </FormColumns>
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
        title="棚卸記録を削除しますか？"
        description="この操作は取り消せません。"
        confirmLabel="削除"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  )
}
