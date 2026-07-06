import { useMemo, useState } from "react"
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
  useStores,
  useAudits,
  useCreateAudit,
  useUpdateAudit,
  useDeleteAudit,
} from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX } from "@/config"
import {
  AUDIT_STATUS_LABEL,
  AUDIT_STATUS_COLOR,
  AUDIT_STATUS_OPTIONS,
} from "@/types/dataverse"
import { Plus, Pencil, Trash2, Search, ChevronLeft, ChevronRight, Eye } from "lucide-react"
import { toast } from "sonner"

const P = PUBLISHER_PREFIX

const a = {
  id:         `${P}_store_auditid`,
  name:       `${P}_name`,
  store_ref:  `${P}_store_ref`,
  auditor:    `${P}_auditor`,
  status:     `${P}_status`,
  audit_date: `${P}_audit_date`,
  score:      `${P}_score`,
  notes:      `${P}_notes`,
}

const st = {
  id:   `${P}_storeid`,
  name: `${P}_name`,
}

function StatusBadge({ status }: { status: number }) {
  const label = AUDIT_STATUS_LABEL[status as keyof typeof AUDIT_STATUS_LABEL] ?? String(status)
  const color = AUDIT_STATUS_COLOR[status as keyof typeof AUDIT_STATUS_COLOR] ?? "bg-gray-100 text-gray-600"
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {label}
    </span>
  )
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score == null) return <span className="text-xs text-muted-foreground">—</span>
  const color = score >= 90 ? "bg-emerald-100 text-emerald-800"
    : score >= 70 ? "bg-blue-100 text-blue-800"
    : "bg-rose-100 text-rose-800"
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${color}`}>
      {score} 点
    </span>
  )
}

type FormData = {
  name: string
  store_ref: string
  auditor: string
  status: string
  audit_date: string
  notes: string
}

const EMPTY_FORM: FormData = {
  name: "", store_ref: "", auditor: "",
  status: String(100000000), audit_date: "", notes: "",
}

const ITEMS_PER_PAGE = 10

export default function AuditsPage() {
  const navigate = useNavigate()
  const { data: audits = [], isLoading } = useAudits()
  const { data: stores = [] } = useStores()
  const createAudit = useCreateAudit()
  const updateAudit = useUpdateAudit()
  const deleteAudit = useDeleteAudit()

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const [search, setSearch] = useState("")
  const [filterStatus, setFilterStatus] = useState("all")
  const [currentPage, setCurrentPage] = useState(1)

  const storeNameMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const store of stores) {
      map.set(String(store[st.id] ?? ""), String(store[st.name] ?? ""))
    }
    return map
  }, [stores])

  // フィルター
  const filtered = audits
    .filter(r => {
      const q = search.toLowerCase()
      const storeName = storeNameMap.get(String(r[a.store_ref] ?? "")) ?? ""
      const matchSearch = !q ||
        String(r[a.name] ?? "").toLowerCase().includes(q) ||
        String(r[a.auditor] ?? "").toLowerCase().includes(q) ||
        storeName.toLowerCase().includes(q)
      const matchStatus = filterStatus === "all" || String(r[a.status]) === filterStatus
      return matchSearch && matchStatus
    })
    .sort((x, y) => String(y[a.audit_date] ?? "").localeCompare(String(x[a.audit_date] ?? "")))

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE)
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
  const paginated = filtered.slice(startIndex, startIndex + ITEMS_PER_PAGE)

  const handleNew = () => {
    setEditingId(null)
    setFormData({ ...EMPTY_FORM, audit_date: new Date().toISOString().slice(0, 10) })
    setIsFormOpen(true)
  }

  const handleEdit = (audit: Record<string, unknown>) => {
    setEditingId(String(audit[a.id] ?? ""))
    setFormData({
      name:       String(audit[a.name] ?? ""),
      store_ref:  String(audit[a.store_ref] ?? ""),
      auditor:    String(audit[a.auditor] ?? ""),
      status:     audit[a.status] != null ? String(audit[a.status]) : String(100000000),
      audit_date: String(audit[a.audit_date] ?? ""),
      notes:      String(audit[a.notes] ?? ""),
    })
    setIsFormOpen(true)
  }

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error("件名は必須です")
      return
    }
    const data: Record<string, unknown> = {
      [a.name]:      formData.name,
      [a.store_ref]: formData.store_ref,
      [a.auditor]:   formData.auditor,
      [a.notes]:     formData.notes,
    }
    if (formData.status) data[a.status] = Number(formData.status)
    if (formData.audit_date) data[a.audit_date] = formData.audit_date

    try {
      if (editingId) {
        await updateAudit.mutateAsync({ id: editingId, data })
        toast.success("臨店チェックを更新しました")
      } else {
        await createAudit.mutateAsync(data)
        toast.success("臨店チェックを作成しました。詳細画面からチェックリストを生成してください")
      }
      setIsFormOpen(false)
    } catch {
      toast.error("保存に失敗しました")
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await deleteAudit.mutateAsync(deleteId)
      toast.success("臨店チェックを削除しました")
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
          <h1 className="text-2xl font-bold">臨店チェック</h1>
        </div>
        <LoadingSkeletonList count={5} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">臨店チェック</h1>
          <p className="text-muted-foreground text-sm mt-1">店舗巡回チェックの計画・実施・採点</p>
        </div>
        <Button onClick={handleNew} className="gap-2">
          <Plus className="h-4 w-4" />
          新規作成
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>臨店チェック一覧</CardTitle>
          <CardDescription>{filtered.length} 件（実施日の新しい順）</CardDescription>
        </CardHeader>
        <CardContent>
          {/* フィルター */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="件名・店舗・巡回担当で検索..."
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
                {AUDIT_STATUS_OPTIONS.map(o => (
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
                  <TableHead>件名</TableHead>
                  <TableHead>店舗</TableHead>
                  <TableHead>巡回担当</TableHead>
                  <TableHead>ステータス</TableHead>
                  <TableHead>スコア</TableHead>
                  <TableHead>実施日</TableHead>
                  <TableHead className="w-[110px]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                      臨店チェックがありません
                    </TableCell>
                  </TableRow>
                ) : (
                  paginated.map((audit, idx) => (
                    <TableRow
                      key={idx}
                      className="cursor-pointer"
                      onClick={() => navigate(`/audits/${String(audit[a.id] ?? "")}`)}
                    >
                      <TableCell className="font-medium max-w-[220px] truncate">
                        {String(audit[a.name] ?? "")}
                      </TableCell>
                      <TableCell>{storeNameMap.get(String(audit[a.store_ref] ?? "")) || "—"}</TableCell>
                      <TableCell>{String(audit[a.auditor] ?? "")}</TableCell>
                      <TableCell>
                        {audit[a.status] != null && (
                          <StatusBadge status={audit[a.status] as number} />
                        )}
                      </TableCell>
                      <TableCell>
                        <ScoreBadge score={(audit[a.score] as number) ?? null} />
                      </TableCell>
                      <TableCell>{String(audit[a.audit_date] ?? "")}</TableCell>
                      <TableCell onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => navigate(`/audits/${String(audit[a.id] ?? "")}`)}
                            title="詳細"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleEdit(audit)}
                            title="編集"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setDeleteId(String(audit[a.id] ?? ""))}
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
        title={editingId ? "臨店チェック編集" : "臨店チェック新規作成"}
        onSave={handleSave}
        isSaving={createAudit.isPending || updateAudit.isPending}
        maxWidth="2xl"
      >
        <div className="space-y-6">
          {/* 件名（必須、全幅） */}
          <div className="space-y-1.5">
            <Label htmlFor="name">件名 <span className="text-destructive">*</span></Label>
            <Input
              id="name"
              value={formData.name}
              onChange={update("name")}
              placeholder="例: 4月度 定期臨店（渋谷店）"
            />
          </div>

          <FormColumns columns={2}>
            {/* 店舗 */}
            <div className="space-y-1.5">
              <Label>店舗</Label>
              <Select value={formData.store_ref} onValueChange={v => setFormData(p => ({ ...p, store_ref: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="店舗を選択" />
                </SelectTrigger>
                <SelectContent>
                  {stores.map((store, idx) => (
                    <SelectItem key={idx} value={String(store[st.id] ?? "")}>
                      {String(store[st.name] ?? "")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* 巡回担当 */}
            <div className="space-y-1.5">
              <Label htmlFor="auditor">巡回担当</Label>
              <Input
                id="auditor"
                value={formData.auditor}
                onChange={update("auditor")}
                placeholder="SV・エリアマネージャー名"
              />
            </div>
            {/* ステータス */}
            <div className="space-y-1.5">
              <Label>ステータス</Label>
              <Select value={formData.status} onValueChange={v => setFormData(p => ({ ...p, status: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="ステータスを選択" />
                </SelectTrigger>
                <SelectContent>
                  {AUDIT_STATUS_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* 実施日 */}
            <div className="space-y-1.5">
              <Label htmlFor="audit_date">実施日</Label>
              <Input
                id="audit_date"
                type="date"
                value={formData.audit_date}
                onChange={update("audit_date")}
              />
            </div>
          </FormColumns>

          {/* 所感（全幅） */}
          <div className="space-y-1.5">
            <Label htmlFor="notes">所感</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={update("notes")}
              placeholder="巡回全体の所感・店長への申し送り"
              rows={2}
            />
          </div>

          {!editingId && (
            <p className="text-xs text-muted-foreground">
              チェック項目は保存後、詳細画面の「標準チェックリストを生成」から一括作成できます。
            </p>
          )}
        </div>
      </FormModal>

      {/* 削除確認 */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={open => { if (!open) setDeleteId(null) }}
        title="臨店チェックを削除しますか？"
        description="この操作は取り消せません。臨店チェックを完全に削除します（チェック項目は残ります）。"
        confirmLabel="削除"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  )
}
