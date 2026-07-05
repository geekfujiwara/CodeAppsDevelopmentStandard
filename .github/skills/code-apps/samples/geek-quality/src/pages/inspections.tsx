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
  useInspections,
  useCreateInspection,
  useUpdateInspection,
  useDeleteInspection,
} from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX } from "@/config"
import {
  INSPECTION_STATUS_LABEL,
  INSPECTION_STATUS_COLOR,
  INSPECTION_STATUS_OPTIONS,
  computeYield,
} from "@/types/dataverse"
import { Plus, Pencil, Trash2, Search, ChevronLeft, ChevronRight, Eye } from "lucide-react"
import { toast } from "sonner"

const P = PUBLISHER_PREFIX

const f = {
  id:              `${P}_inspectionid`,
  name:            `${P}_name`,
  line:            `${P}_line`,
  product:         `${P}_product`,
  lot:             `${P}_lot`,
  inspector:       `${P}_inspector`,
  status:          `${P}_status`,
  inspection_date: `${P}_inspection_date`,
  inspected_qty:   `${P}_inspected_qty`,
  defect_qty:      `${P}_defect_qty`,
  notes:           `${P}_notes`,
}

function StatusBadge({ status }: { status: number }) {
  const label = INSPECTION_STATUS_LABEL[status as keyof typeof INSPECTION_STATUS_LABEL] ?? String(status)
  const color = INSPECTION_STATUS_COLOR[status as keyof typeof INSPECTION_STATUS_COLOR] ?? "bg-gray-100 text-gray-600"
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {label}
    </span>
  )
}

function YieldBadge({ value }: { value: number | null }) {
  if (value == null) return <span className="text-xs text-muted-foreground">—</span>
  const color = value >= 99 ? "bg-emerald-100 text-emerald-800"
    : value >= 95 ? "bg-blue-100 text-blue-800"
    : "bg-rose-100 text-rose-800"
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${color}`}>
      {value}%
    </span>
  )
}

type FormData = {
  name: string
  line: string
  product: string
  lot: string
  inspector: string
  status: string
  inspection_date: string
  inspected_qty: string
  notes: string
}

const EMPTY_FORM: FormData = {
  name: "", line: "", product: "", lot: "", inspector: "",
  status: String(100000000), inspection_date: "", inspected_qty: "", notes: "",
}

const ITEMS_PER_PAGE = 10

export default function InspectionsPage() {
  const navigate = useNavigate()
  const { data: inspections = [], isLoading } = useInspections()
  const createInspection = useCreateInspection()
  const updateInspection = useUpdateInspection()
  const deleteInspection = useDeleteInspection()

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const [search, setSearch] = useState("")
  const [filterStatus, setFilterStatus] = useState("all")
  const [currentPage, setCurrentPage] = useState(1)

  // フィルター
  const filtered = inspections
    .filter(r => {
      const q = search.toLowerCase()
      const matchSearch = !q ||
        String(r[f.name] ?? "").toLowerCase().includes(q) ||
        String(r[f.line] ?? "").toLowerCase().includes(q) ||
        String(r[f.product] ?? "").toLowerCase().includes(q) ||
        String(r[f.lot] ?? "").toLowerCase().includes(q)
      const matchStatus = filterStatus === "all" || String(r[f.status]) === filterStatus
      return matchSearch && matchStatus
    })
    .sort((a, b) => String(b[f.inspection_date] ?? "").localeCompare(String(a[f.inspection_date] ?? "")))

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE)
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
  const paginated = filtered.slice(startIndex, startIndex + ITEMS_PER_PAGE)

  const handleNew = () => {
    setEditingId(null)
    setFormData({ ...EMPTY_FORM, inspection_date: new Date().toISOString().slice(0, 10) })
    setIsFormOpen(true)
  }

  const handleEdit = (inspection: Record<string, unknown>) => {
    setEditingId(String(inspection[f.id] ?? ""))
    setFormData({
      name:            String(inspection[f.name] ?? ""),
      line:            String(inspection[f.line] ?? ""),
      product:         String(inspection[f.product] ?? ""),
      lot:             String(inspection[f.lot] ?? ""),
      inspector:       String(inspection[f.inspector] ?? ""),
      status:          inspection[f.status] != null ? String(inspection[f.status]) : String(100000000),
      inspection_date: String(inspection[f.inspection_date] ?? ""),
      inspected_qty:   inspection[f.inspected_qty] != null ? String(inspection[f.inspected_qty]) : "",
      notes:           String(inspection[f.notes] ?? ""),
    })
    setIsFormOpen(true)
  }

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error("件名は必須です")
      return
    }
    const data: Record<string, unknown> = {
      [f.name]:      formData.name,
      [f.line]:      formData.line,
      [f.product]:   formData.product,
      [f.lot]:       formData.lot,
      [f.inspector]: formData.inspector,
      [f.notes]:     formData.notes,
    }
    if (formData.status) data[f.status] = Number(formData.status)
    if (formData.inspection_date) data[f.inspection_date] = formData.inspection_date
    if (formData.inspected_qty) data[f.inspected_qty] = parseInt(formData.inspected_qty, 10)

    try {
      if (editingId) {
        await updateInspection.mutateAsync({ id: editingId, data })
        toast.success("検査記録を更新しました")
      } else {
        data[f.defect_qty] = 0
        await createInspection.mutateAsync(data)
        toast.success("検査記録を作成しました。不良は詳細画面から記録してください")
      }
      setIsFormOpen(false)
    } catch {
      toast.error("保存に失敗しました")
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await deleteInspection.mutateAsync(deleteId)
      toast.success("検査記録を削除しました")
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
          <h1 className="text-2xl font-bold">検査記録</h1>
        </div>
        <LoadingSkeletonList count={5} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">検査記録</h1>
          <p className="text-muted-foreground text-sm mt-1">生産ライン検査の計画・実施・不良記録</p>
        </div>
        <Button onClick={handleNew} className="gap-2">
          <Plus className="h-4 w-4" />
          新規作成
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>検査記録一覧</CardTitle>
          <CardDescription>{filtered.length} 件（実施日の新しい順）</CardDescription>
        </CardHeader>
        <CardContent>
          {/* フィルター */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="件名・ライン・品目・ロットで検索..."
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
                {INSPECTION_STATUS_OPTIONS.map(o => (
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
                  <TableHead>ライン</TableHead>
                  <TableHead>品目</TableHead>
                  <TableHead>ロット</TableHead>
                  <TableHead>ステータス</TableHead>
                  <TableHead className="text-right">検査数</TableHead>
                  <TableHead className="text-right">不良数</TableHead>
                  <TableHead>歩留まり</TableHead>
                  <TableHead>実施日</TableHead>
                  <TableHead className="w-[110px]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="h-24 text-center text-muted-foreground">
                      検査記録がありません
                    </TableCell>
                  </TableRow>
                ) : (
                  paginated.map((inspection, idx) => {
                    const inspectedQty = (inspection[f.inspected_qty] as number) ?? 0
                    const defectQty = (inspection[f.defect_qty] as number) ?? 0
                    return (
                      <TableRow
                        key={idx}
                        className="cursor-pointer"
                        onClick={() => navigate(`/inspections/${String(inspection[f.id] ?? "")}`)}
                      >
                        <TableCell className="font-medium max-w-[200px] truncate">
                          {String(inspection[f.name] ?? "")}
                        </TableCell>
                        <TableCell>{String(inspection[f.line] ?? "")}</TableCell>
                        <TableCell className="max-w-[140px] truncate">{String(inspection[f.product] ?? "")}</TableCell>
                        <TableCell className="font-mono text-xs">{String(inspection[f.lot] ?? "")}</TableCell>
                        <TableCell>
                          {inspection[f.status] != null && (
                            <StatusBadge status={inspection[f.status] as number} />
                          )}
                        </TableCell>
                        <TableCell className="text-right">{inspectedQty || ""}</TableCell>
                        <TableCell className="text-right">{defectQty}</TableCell>
                        <TableCell>
                          <YieldBadge value={computeYield(inspectedQty, defectQty)} />
                        </TableCell>
                        <TableCell>{String(inspection[f.inspection_date] ?? "")}</TableCell>
                        <TableCell onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => navigate(`/inspections/${String(inspection[f.id] ?? "")}`)}
                              title="詳細"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => handleEdit(inspection)}
                              title="編集"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => setDeleteId(String(inspection[f.id] ?? ""))}
                              title="削除"
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
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
        title={editingId ? "検査記録編集" : "検査記録新規作成"}
        onSave={handleSave}
        isSaving={createInspection.isPending || updateInspection.isPending}
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
              placeholder="例: 第2ライン 抜取検査（4/15 午前）"
            />
          </div>

          <FormColumns columns={2}>
            {/* ライン */}
            <div className="space-y-1.5">
              <Label htmlFor="line">ライン</Label>
              <Input
                id="line"
                value={formData.line}
                onChange={update("line")}
                placeholder="例: 第1ライン, 組立A"
              />
            </div>
            {/* 品目 */}
            <div className="space-y-1.5">
              <Label htmlFor="product">品目</Label>
              <Input
                id="product"
                value={formData.product}
                onChange={update("product")}
                placeholder="品目名・型番"
              />
            </div>
            {/* ロット */}
            <div className="space-y-1.5">
              <Label htmlFor="lot">ロット番号</Label>
              <Input
                id="lot"
                value={formData.lot}
                onChange={update("lot")}
                placeholder="例: LOT-2404-001"
              />
            </div>
            {/* 検査員 */}
            <div className="space-y-1.5">
              <Label htmlFor="inspector">検査員</Label>
              <Input
                id="inspector"
                value={formData.inspector}
                onChange={update("inspector")}
                placeholder="検査員名"
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
                  {INSPECTION_STATUS_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* 実施日 */}
            <div className="space-y-1.5">
              <Label htmlFor="inspection_date">実施日</Label>
              <Input
                id="inspection_date"
                type="date"
                value={formData.inspection_date}
                onChange={update("inspection_date")}
              />
            </div>
            {/* 検査数 */}
            <div className="space-y-1.5">
              <Label htmlFor="inspected_qty">検査数</Label>
              <Input
                id="inspected_qty"
                type="number"
                min={0}
                value={formData.inspected_qty}
                onChange={update("inspected_qty")}
                placeholder="例: 500"
              />
            </div>
          </FormColumns>

          {/* 所見（全幅） */}
          <div className="space-y-1.5">
            <Label htmlFor="notes">所見</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={update("notes")}
              placeholder="検査全体の所見・特記事項"
              rows={2}
            />
          </div>

          {!editingId && (
            <p className="text-xs text-muted-foreground">
              不良数は詳細画面で不良記録を追加すると自動集計されます。
            </p>
          )}
        </div>
      </FormModal>

      {/* 削除確認 */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={open => { if (!open) setDeleteId(null) }}
        title="検査記録を削除しますか？"
        description="この操作は取り消せません。検査記録を完全に削除します（不良記録は残ります）。"
        confirmLabel="削除"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  )
}
