import { useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { FormModal, FormColumns } from "@/components/form-modal"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { LoadingSkeletonList } from "@/components/loading-skeleton"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { StagePath } from "@/components/stage-path"
import {
  useInspections,
  useUpdateInspection,
  useDefects,
  useCreateDefect,
  useUpdateDefect,
  useDeleteDefect,
} from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX } from "@/config"
import {
  INSPECTION_STAGE_PATH_ITEMS,
  INSPECTION_STATUS_LABEL,
  DISPOSITION_LABEL,
  DISPOSITION_COLOR,
  DISPOSITION_OPTIONS,
  computeYield,
} from "@/types/dataverse"
import {
  ArrowLeft, Plus, Pencil, Trash2, Factory, Package, User, Gauge,
} from "lucide-react"
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

const d = {
  id:             `${P}_defectid`,
  name:           `${P}_name`,
  inspection_ref: `${P}_inspection_ref`,
  category:       `${P}_category`,
  qty:            `${P}_qty`,
  disposition:    `${P}_disposition`,
  cause:          `${P}_cause`,
}

type DefectForm = { name: string; category: string; qty: string; disposition: string; cause: string }
const EMPTY_DEFECT: DefectForm = { name: "", category: "", qty: "1", disposition: "", cause: "" }

export default function InspectionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: inspections = [], isLoading } = useInspections()
  const { data: allDefects = [] } = useDefects()
  const updateInspection = useUpdateInspection()
  const createDefect = useCreateDefect()
  const updateDefect = useUpdateDefect()
  const deleteDefect = useDeleteDefect()

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<DefectForm>(EMPTY_DEFECT)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const inspection = useMemo(
    () => inspections.find(r => String(r[f.id] ?? "") === id),
    [inspections, id]
  )

  const defects = useMemo(
    () => allDefects
      .filter(x => String(x[d.inspection_ref] ?? "") === id)
      .sort((x, y) => ((y[d.qty] as number) ?? 0) - ((x[d.qty] as number) ?? 0)),
    [allDefects, id]
  )

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">検査詳細</h1>
        <LoadingSkeletonList count={3} />
      </div>
    )
  }

  if (!inspection || !id) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" className="gap-1" onClick={() => navigate("/inspections")}>
          <ArrowLeft className="h-4 w-4" />検査記録一覧へ戻る
        </Button>
        <Card>
          <CardHeader>
            <CardTitle>検査記録が見つかりません</CardTitle>
            <CardDescription>削除されたか、URL が正しくない可能性があります。</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  const status = inspection[f.status] as number | undefined
  const inspectedQty = (inspection[f.inspected_qty] as number) ?? 0
  const defectQty = (inspection[f.defect_qty] as number) ?? 0
  const yieldRate = computeYield(inspectedQty, defectQty)

  /** 不良記録の変化後に不良数合計を検査レコードへ同期する */
  const syncDefectQty = async (nextDefects: { qty: number }[]) => {
    const total = nextDefects.reduce((sum, x) => sum + x.qty, 0)
    await updateInspection.mutateAsync({ id, data: { [f.defect_qty]: total } })
  }

  const currentDefectQtys = () =>
    defects.map(x => ({
      defectId: String(x[d.id] ?? ""),
      qty: (x[d.qty] as number) ?? 0,
    }))

  const handleStageSelect = async (value: number) => {
    try {
      await updateInspection.mutateAsync({ id, data: { [f.status]: value } })
      toast.success(`ステータスを「${(INSPECTION_STATUS_LABEL as Record<number, string>)[value] ?? ""}」に変更しました`)
    } catch {
      toast.error("更新に失敗しました")
    }
  }

  const handleNew = () => {
    setEditingId(null)
    setForm(EMPTY_DEFECT)
    setIsFormOpen(true)
  }

  const handleEdit = (defect: Record<string, unknown>) => {
    setEditingId(String(defect[d.id] ?? ""))
    setForm({
      name:        String(defect[d.name] ?? ""),
      category:    String(defect[d.category] ?? ""),
      qty:         defect[d.qty] != null ? String(defect[d.qty]) : "1",
      disposition: defect[d.disposition] != null ? String(defect[d.disposition]) : "",
      cause:       String(defect[d.cause] ?? ""),
    })
    setIsFormOpen(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("不良内容は必須です")
      return
    }
    const qty = parseInt(form.qty || "0", 10)
    const data: Record<string, unknown> = {
      [d.name]:           form.name,
      [d.inspection_ref]: id,
      [d.category]:       form.category || "未分類",
      [d.qty]:            qty,
      [d.cause]:          form.cause,
    }
    if (form.disposition) data[d.disposition] = Number(form.disposition)
    try {
      const qtys = currentDefectQtys()
      if (editingId) {
        await updateDefect.mutateAsync({ id: editingId, data })
        await syncDefectQty(qtys.map(x => x.defectId === editingId ? { qty } : x))
        toast.success("不良記録を更新しました")
      } else {
        await createDefect.mutateAsync(data)
        await syncDefectQty([...qtys, { qty }])
        toast.success("不良を記録しました")
      }
      setIsFormOpen(false)
    } catch {
      toast.error("保存に失敗しました")
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      const qtys = currentDefectQtys()
      await deleteDefect.mutateAsync(deleteId)
      await syncDefectQty(qtys.filter(x => x.defectId !== deleteId))
      toast.success("不良記録を削除しました")
      setDeleteId(null)
    } catch {
      toast.error("削除に失敗しました")
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Button variant="ghost" size="sm" className="gap-1 -ml-2 mb-1" onClick={() => navigate("/inspections")}>
            <ArrowLeft className="h-4 w-4" />検査記録一覧へ戻る
          </Button>
          <h1 className="text-2xl font-bold text-foreground">{String(inspection[f.name] ?? "")}</h1>
        </div>
        <Button size="sm" className="gap-1" onClick={handleNew}>
          <Plus className="h-3.5 w-3.5" />不良を記録
        </Button>
      </div>

      {/* サマリーヘッダー + 矢羽 */}
      <Card>
        <CardContent className="py-4">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="flex items-start gap-2">
              <Factory className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">ライン / 品目</div>
                <div className="truncate text-sm font-medium">
                  {String(inspection[f.line] ?? "—")} / {String(inspection[f.product] ?? "—")}
                </div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Package className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">ロット / 実施日</div>
                <div className="truncate text-sm font-medium">
                  <span className="font-mono text-xs">{String(inspection[f.lot] ?? "—")}</span>
                  {" / "}{String(inspection[f.inspection_date] ?? "—")}
                </div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <User className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">検査員 / 検査数</div>
                <div className="truncate text-sm font-medium">
                  {String(inspection[f.inspector] ?? "—")} / {inspectedQty > 0 ? `${inspectedQty} 個` : "—"}
                </div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Gauge className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">不良数 / 歩留まり</div>
                <div className="text-sm font-semibold">
                  {defectQty} 個
                  {yieldRate != null && (
                    <span className={`ml-2 ${yieldRate < 95 ? "text-rose-600" : "text-emerald-600 dark:text-emerald-400"}`}>
                      {yieldRate}%
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ステータス矢羽 */}
          <div className="mt-4 border-t pt-4">
            <StagePath
              stages={INSPECTION_STAGE_PATH_ITEMS}
              current={status}
              onSelect={handleStageSelect}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              矢羽をクリックするとステータスを変更できます
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 不良記録 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">不良記録</CardTitle>
          <CardDescription>{defects.length} 件（数量の多い順）。数量の合計が検査記録の不良数へ自動同期されます</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>不良内容</TableHead>
                  <TableHead>分類</TableHead>
                  <TableHead className="text-right">数量</TableHead>
                  <TableHead>処置</TableHead>
                  <TableHead>原因</TableHead>
                  <TableHead className="w-[80px]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {defects.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      不良記録がありません。「不良を記録」から登録してください
                    </TableCell>
                  </TableRow>
                ) : (
                  defects.map((defect, idx) => {
                    const disposition = defect[d.disposition] as number | undefined
                    return (
                      <TableRow key={idx}>
                        <TableCell className="font-medium max-w-[220px] truncate">{String(defect[d.name] ?? "")}</TableCell>
                        <TableCell>{String(defect[d.category] ?? "")}</TableCell>
                        <TableCell className="text-right">{String(defect[d.qty] ?? "")}</TableCell>
                        <TableCell>
                          {disposition != null && (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${DISPOSITION_COLOR[disposition as keyof typeof DISPOSITION_COLOR] ?? "bg-gray-100 text-gray-600"}`}>
                              {DISPOSITION_LABEL[disposition as keyof typeof DISPOSITION_LABEL] ?? String(disposition)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[240px] truncate text-muted-foreground">
                          {String(defect[d.cause] ?? "")}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => handleEdit(defect)}
                              title="編集"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => setDeleteId(String(defect[d.id] ?? ""))}
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
        </CardContent>
      </Card>

      {/* 所見 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">所見</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm whitespace-pre-wrap">
            {String(inspection[f.notes] ?? "") || <span className="text-muted-foreground">（未入力）</span>}
          </p>
        </CardContent>
      </Card>

      {/* 不良記録フォーム */}
      <FormModal
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        title={editingId ? "不良記録編集" : "不良を記録"}
        onSave={handleSave}
        isSaving={createDefect.isPending || updateDefect.isPending || updateInspection.isPending}
        maxWidth="md"
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="defect_name">不良内容 <span className="text-destructive">*</span></Label>
            <Input
              id="defect_name"
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              placeholder="例: 取付穴の径が公差外"
            />
          </div>
          <FormColumns columns={2}>
            <div className="space-y-1.5">
              <Label htmlFor="defect_category">分類</Label>
              <Input
                id="defect_category"
                value={form.category}
                onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
                placeholder="例: 寸法不良, 傷・打痕, 異物混入"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="defect_qty">数量</Label>
              <Input
                id="defect_qty"
                type="number"
                min={0}
                value={form.qty}
                onChange={e => setForm(p => ({ ...p, qty: e.target.value }))}
              />
            </div>
          </FormColumns>
          <div className="space-y-1.5">
            <Label>処置</Label>
            <Select value={form.disposition} onValueChange={v => setForm(p => ({ ...p, disposition: v }))}>
              <SelectTrigger>
                <SelectValue placeholder="処置を選択" />
              </SelectTrigger>
              <SelectContent>
                {DISPOSITION_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="defect_cause">原因</Label>
            <Textarea
              id="defect_cause"
              value={form.cause}
              onChange={e => setForm(p => ({ ...p, cause: e.target.value }))}
              placeholder="推定される原因・発生工程"
              rows={3}
            />
          </div>
        </div>
      </FormModal>

      {/* 不良記録削除確認 */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={open => { if (!open) setDeleteId(null) }}
        title="不良記録を削除しますか？"
        description="この操作は取り消せません。不良記録を削除し、不良数を再計算します。"
        confirmLabel="削除"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  )
}
